"""NomicBERT implementation in tinygrad.

Adapts tinygrad's BERT to NomicBERT architecture:
- Rotary Position Embeddings (RoPE) instead of absolute position embeddings
- SwiGLU activation instead of GELU
- No QKV bias
- CLS token pooling + L2 normalization
- 8192 max context, 30528 vocab size

Supports both CodeRankEmbed (137M, 12 layers) and Nomic Embed Code (7B, 32 layers).
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np

from .base import EmbeddingModel

# Lazy import tinygrad to avoid import errors when not installed
_tinygrad = None
def _get_tinygrad():
    global _tinygrad
    if _tinygrad is None:
        import tinygrad
        _tinygrad = tinygrad
    return _tinygrad


def precompute_freqs_cis(dim: int, end: int, theta: float = 1000.0):
    """Precompute rotary position embedding frequencies."""
    tg = _get_tinygrad()
    Tensor = tg.Tensor
    freqs = 1.0 / (theta ** (Tensor.arange(0, dim, 2)[:(dim // 2)] / dim))
    freqs = Tensor.arange(end).unsqueeze(dim=1) * freqs.unsqueeze(dim=0)
    # Return cos, sin components
    return freqs.cos(), freqs.sin()


def apply_rotary_emb(x, cos, sin):
    """Apply rotary embeddings (GPT-NeoX style, non-interleaved).

    Pairs dimensions (i, i + rotary_dim//2) — first-half/second-half split.
    x shape: (batch, seq, heads, head_dim)
    cos/sin shape: (seq, rotary_dim//2)
    """
    batch, seq, heads, head_dim = x.shape
    rotary_dim = cos.shape[-1] * 2

    # Split into rotary and passthrough parts
    x_rot = x[..., :rotary_dim]
    x_pass = x[..., rotary_dim:]

    # GPT-NeoX style: split into first half and second half
    half = rotary_dim // 2
    x1 = x_rot[..., :half]    # first half
    x2 = x_rot[..., half:]    # second half

    # Reshape cos/sin for broadcasting: (1, seq, 1, rotary_dim//2)
    cos = cos[:seq].reshape(1, seq, 1, -1)
    sin = sin[:seq].reshape(1, seq, 1, -1)

    # Apply rotation: pairs are (x1[i], x2[i]) sharing frequency i
    out1 = x1 * cos - x2 * sin
    out2 = x2 * cos + x1 * sin

    # Concatenate halves back
    out_rot = out1.cat(out2, dim=-1)

    # Concatenate with passthrough
    if x_pass.shape[-1] > 0:
        return out_rot.cat(x_pass, dim=-1)
    return out_rot


class NomicBertEmbeddings:
    """Token embeddings only (no position embeddings - RoPE is used instead)."""

    def __init__(self, vocab_size: int, hidden_size: int, type_vocab_size: int = 2):
        tg = _get_tinygrad()
        nn = tg.nn
        self.word_embeddings = nn.Embedding(vocab_size, hidden_size)
        self.token_type_embeddings = nn.Embedding(type_vocab_size, hidden_size)
        self.norm = nn.LayerNorm(hidden_size, eps=1e-12)

    def __call__(self, input_ids, token_type_ids=None):
        tg = _get_tinygrad()
        Tensor = tg.Tensor
        embeddings = self.word_embeddings(input_ids)
        # Always add token_type_embeddings (default type 0) — trained bias vector
        if token_type_ids is None:
            token_type_ids = Tensor.zeros(*input_ids.shape, dtype=tg.dtypes.int)
        embeddings = embeddings + self.token_type_embeddings(token_type_ids)
        return self.norm(embeddings)


class NomicBertSelfAttention:
    """Multi-head self-attention with Rotary Position Embeddings."""

    def __init__(self, hidden_size: int, num_attention_heads: int, rotary_emb_fraction: float = 0.5):
        tg = _get_tinygrad()
        nn = tg.nn
        self.num_heads = num_attention_heads
        self.head_dim = hidden_size // num_attention_heads
        self.rotary_dim = int(self.head_dim * rotary_emb_fraction)

        # No bias in NomicBERT QKV projections
        self.Wqkv = nn.Linear(hidden_size, 3 * hidden_size, bias=False)
        self.out_proj = nn.Linear(hidden_size, hidden_size, bias=False)

    def __call__(self, hidden_states, cos, sin, attention_mask=None):
        tg = _get_tinygrad()
        Tensor = tg.Tensor
        batch, seq_len, hidden = hidden_states.shape

        # Compute Q, K, V in one projection
        qkv = self.Wqkv(hidden_states)
        q, k, v = qkv.chunk(3, dim=-1)

        # Reshape to (batch, seq, heads, head_dim)
        q = q.reshape(batch, seq_len, self.num_heads, self.head_dim)
        k = k.reshape(batch, seq_len, self.num_heads, self.head_dim)
        v = v.reshape(batch, seq_len, self.num_heads, self.head_dim)

        # Apply rotary embeddings
        q = apply_rotary_emb(q, cos, sin)
        k = apply_rotary_emb(k, cos, sin)

        # Transpose for attention: (batch, heads, seq, head_dim)
        q = q.transpose(1, 2)
        k = k.transpose(1, 2)
        v = v.transpose(1, 2)

        # Scaled dot-product attention
        attn = Tensor.scaled_dot_product_attention(q, k, v, attention_mask, 0.0)

        # Reshape back
        attn = attn.transpose(1, 2).reshape(batch, seq_len, hidden)
        return self.out_proj(attn)


class NomicBertSwiGLU:
    """SwiGLU feed-forward: fc2(fc11(x) * silu(fc12(x)))"""

    def __init__(self, hidden_size: int, intermediate_size: int):
        tg = _get_tinygrad()
        nn = tg.nn
        self.fc11 = nn.Linear(hidden_size, intermediate_size, bias=False)
        self.fc12 = nn.Linear(hidden_size, intermediate_size, bias=False)
        self.fc2 = nn.Linear(intermediate_size, hidden_size, bias=False)

    def __call__(self, x):
        # fc12 is the gate (gets silu), fc11 is the up projection
        return self.fc2(self.fc11(x) * self.fc12(x).silu())


class NomicBertLayer:
    """Single transformer layer with RoPE attention + SwiGLU."""

    def __init__(self, hidden_size: int, intermediate_size: int,
                 num_attention_heads: int, rotary_emb_fraction: float):
        tg = _get_tinygrad()
        nn = tg.nn
        self.attn = NomicBertSelfAttention(hidden_size, num_attention_heads, rotary_emb_fraction)
        self.mlp = NomicBertSwiGLU(hidden_size, intermediate_size)
        self.norm1 = nn.LayerNorm(hidden_size, eps=1e-12)
        self.norm2 = nn.LayerNorm(hidden_size, eps=1e-12)

    def __call__(self, hidden_states, cos, sin, attention_mask=None):
        # Post-norm: attention then norm (prenorm=false in model config)
        residual = hidden_states
        hidden_states = self.attn(hidden_states, cos, sin, attention_mask)
        hidden_states = self.norm1(residual + hidden_states)

        # Post-norm: FFN then norm
        residual = hidden_states
        hidden_states = self.mlp(hidden_states)
        hidden_states = self.norm2(residual + hidden_states)

        return hidden_states


class NomicBertEncoder:
    """Stack of NomicBERT transformer layers."""

    def __init__(self, hidden_size: int, intermediate_size: int,
                 num_attention_heads: int, num_hidden_layers: int,
                 rotary_emb_fraction: float):
        self.layers = [
            NomicBertLayer(hidden_size, intermediate_size, num_attention_heads, rotary_emb_fraction)
            for _ in range(num_hidden_layers)
        ]

    def __call__(self, hidden_states, cos, sin, attention_mask=None):
        for layer in self.layers:
            hidden_states = layer(hidden_states, cos, sin, attention_mask)
        return hidden_states


class NomicBert:
    """NomicBERT model: embeddings + encoder + CLS pooling + L2 norm."""

    def __init__(self, vocab_size: int = 30528, hidden_size: int = 768,
                 intermediate_size: int = 3072, num_attention_heads: int = 12,
                 num_hidden_layers: int = 12, max_position_embeddings: int = 8192,
                 type_vocab_size: int = 2, rotary_emb_fraction: float = 1.0,
                 rotary_emb_base: float = 1000.0):
        self.hidden_size = hidden_size
        self.max_position_embeddings = max_position_embeddings

        self.embeddings = NomicBertEmbeddings(vocab_size, hidden_size, type_vocab_size)
        self.encoder = NomicBertEncoder(
            hidden_size, intermediate_size, num_attention_heads,
            num_hidden_layers, rotary_emb_fraction,
        )

        head_dim = hidden_size // num_attention_heads
        rotary_dim = int(head_dim * rotary_emb_fraction)
        self.cos, self.sin = precompute_freqs_cis(rotary_dim, max_position_embeddings, rotary_emb_base)

    def __call__(self, input_ids, attention_mask=None, token_type_ids=None):
        tg = _get_tinygrad()
        Tensor = tg.Tensor

        hidden_states = self.embeddings(input_ids, token_type_ids)

        # Build causal-free attention mask
        attn_mask = None
        if attention_mask is not None:
            # (batch, seq) -> (batch, 1, 1, seq) for broadcasting
            attn_mask = attention_mask.unsqueeze(1).unsqueeze(2)
            attn_mask = (1.0 - attn_mask) * -10000.0

        hidden_states = self.encoder(hidden_states, self.cos, self.sin, attn_mask)

        # CLS token pooling (first token)
        cls_output = hidden_states[:, 0]

        # L2 normalization in float32
        norm = (cls_output * cls_output).sum(axis=-1, keepdim=True).sqrt()
        cls_output = cls_output / norm.maximum(1e-12)

        return cls_output


class NomicBertModel:
    """EmbeddingModel implementation for NomicBERT (CodeRankEmbed / Nomic Embed Code)."""

    def __init__(self, config: dict):
        self._config = config
        self._model: NomicBert | None = None
        self._dim = config.get("hidden_size", 768)
        self._max_seq = config.get("max_position_embeddings", 8192)
        self._query_prefix = config.get("query_prefix", "search_query: ")
        self._document_prefix = config.get("document_prefix", "search_document: ")
        self._mode = "document"

    @property
    def dim(self) -> int:
        return self._dim

    @property
    def max_seq_len(self) -> int:
        return self._max_seq

    def set_mode(self, mode: str):
        """Set embedding mode: 'query' or 'document'."""
        if mode not in ("query", "document"):
            raise ValueError(f"mode must be 'query' or 'document', got '{mode}'")
        self._mode = mode

    def load_weights(self, path: str) -> None:
        """Load NomicBERT weights from safetensors files."""
        tg = _get_tinygrad()
        from tinygrad import Device
        from tinygrad.nn.state import safe_load, load_state_dict

        # Use GPU if available
        try:
            Device.DEFAULT = 'CL'
            print(f"  Using device: {Device.DEFAULT}", flush=True)
        except Exception:
            print(f"  Using device: {Device.DEFAULT} (no GPU found)", flush=True)

        cfg = self._config
        self._model = NomicBert(
            vocab_size=cfg.get("vocab_size", 30528),
            hidden_size=cfg.get("hidden_size", 768),
            intermediate_size=cfg.get("intermediate_size", 3072),
            num_attention_heads=cfg.get("num_attention_heads", 12),
            num_hidden_layers=cfg.get("num_hidden_layers", 12),
            max_position_embeddings=cfg.get("max_position_embeddings", 8192),
            rotary_emb_fraction=cfg.get("rotary_emb_fraction", 1.0),
            rotary_emb_base=cfg.get("rotary_emb_base", 1000.0),
        )

        if not path:
            return

        model_path = Path(path)
        if not model_path.exists():
            print(f"Warning: Model path {path} does not exist. Model initialized with random weights.")
            return

        # Load safetensors files
        safetensor_files = sorted(model_path.glob("*.safetensors"))
        if not safetensor_files:
            print(f"Warning: No safetensors files found in {path}")
            return

        state_dict = {}
        for sf in safetensor_files:
            state_dict.update(safe_load(str(sf)))

        # Map HuggingFace weight names to our model structure
        mapped = _map_hf_weights(state_dict)
        load_state_dict(self._model, mapped, strict=False)


    def _ensure_tokenizer(self):
        if not hasattr(self, '_tokenizer'):
            from .tokenizer import WordPieceTokenizer
            model_path = Path(self._config.get("path", ""))
            vocab_path = model_path / "vocab.txt"
            if not vocab_path.exists():
                raise FileNotFoundError(f"vocab.txt not found at {vocab_path}")
            self._tokenizer = WordPieceTokenizer(str(vocab_path), max_length=min(self._max_seq, 512))

    def tokenize(self, texts: list[str]) -> tuple:
        """Pre-tokenize texts (CPU). Returns (ids, masks) numpy arrays."""
        self._ensure_tokenizer()
        prefix = self._query_prefix if self._mode == "query" else self._document_prefix
        prefixed = [prefix + t for t in texts]
        return self._tokenizer.batch_encode(prefixed)

    def embed_tokenized(self, all_ids, all_masks) -> np.ndarray:
        """Embed pre-tokenized inputs (GPU)."""
        tg = _get_tinygrad()
        Tensor = tg.Tensor
        input_ids = Tensor(all_ids)
        attention_mask = Tensor(all_masks)
        embeddings = self._model(input_ids, attention_mask)
        return embeddings.numpy()

    def embed(self, texts: list[str]) -> np.ndarray:
        """Embed texts using NomicBERT with appropriate prefix based on mode."""
        if self._model is None:
            raise RuntimeError("Model not loaded. Call load_weights() first.")
        all_ids, all_masks = self.tokenize(texts)
        return self.embed_tokenized(all_ids, all_masks)


def _map_hf_weights(state_dict: dict) -> dict:
    """Map HuggingFace NomicBERT weight names to our model structure.

    HF weight names -> Our model structure:
      emb_ln.{weight,bias}                           -> embeddings.norm.{weight,bias}
      embeddings.word_embeddings.weight               -> embeddings.word_embeddings.weight
      embeddings.token_type_embeddings.weight          -> embeddings.token_type_embeddings.weight
      encoder.layers.N.attn.Wqkv.weight               -> encoder.layers.N.attn.Wqkv.weight
      encoder.layers.N.attn.out_proj.weight            -> encoder.layers.N.attn.out_proj.weight
      encoder.layers.N.mlp.fc11.weight                 -> encoder.layers.N.mlp.fc11.weight
      encoder.layers.N.mlp.fc12.weight                 -> encoder.layers.N.mlp.fc12.weight
      encoder.layers.N.mlp.fc2.weight                  -> encoder.layers.N.mlp.fc2.weight
      encoder.layers.N.norm1.{weight,bias}             -> encoder.layers.N.norm1.{weight,bias}
      encoder.layers.N.norm2.{weight,bias}             -> encoder.layers.N.norm2.{weight,bias}
    """
    mapped = {}
    for k, v in state_dict.items():
        new_key = k
        # emb_ln -> embeddings.norm
        new_key = new_key.replace("emb_ln.", "embeddings.norm.")
        # Everything else matches our structure directly
        mapped[new_key] = v
    return mapped
