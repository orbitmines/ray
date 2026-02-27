"""LLaMA embedding extraction via mean pooling of hidden states.

Wraps tinygrad's existing LLaMA implementation.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

from .base import EmbeddingModel
from ..config import TINYGRAD_DIR


class LlamaEmbedModel:
    """EmbeddingModel that extracts embeddings from LLaMA via mean pooling."""

    def __init__(self, config: dict):
        self._config = config
        self._model = None
        self._dim = config.get("hidden_size", 4096)
        self._max_seq = config.get("max_position_embeddings", 4096)

    @property
    def dim(self) -> int:
        return self._dim

    @property
    def max_seq_len(self) -> int:
        return self._max_seq

    def load_weights(self, path: str) -> None:
        """Load LLaMA weights.

        Uses tinygrad's existing LLaMA Transformer class.
        Expects the model path to contain safetensors or .pt files.
        """
        if not path:
            return

        # Add tinygrad extra models to path so we can import it
        extra_models = str(TINYGRAD_DIR / "extra" / "models")
        if extra_models not in sys.path:
            sys.path.insert(0, str(TINYGRAD_DIR))
            sys.path.insert(0, extra_models)

        from tinygrad import Tensor, nn
        from tinygrad.nn.state import safe_load, load_state_dict

        # Import LLaMA from tinygrad
        from extra.models.llama import Transformer

        cfg = self._config
        self._model = Transformer(
            dim=cfg.get("hidden_size", 4096),
            hidden_dim=cfg.get("intermediate_size", 11008),
            n_heads=cfg.get("num_attention_heads", 32),
            n_layers=cfg.get("num_hidden_layers", 32),
            norm_eps=cfg.get("norm_eps", 1e-5),
            vocab_size=cfg.get("vocab_size", 32000),
            max_context=cfg.get("max_position_embeddings", 4096),
            jit=False,
            disable_kv_cache=True,
        )

        model_path = Path(path)
        if not model_path.exists():
            print(f"Warning: Model path {path} does not exist.")
            return

        state_dict = {}
        for sf in sorted(model_path.glob("*.safetensors")):
            state_dict.update(safe_load(str(sf)))
        if state_dict:
            load_state_dict(self._model, state_dict, strict=False)

    def embed(self, texts: list[str]) -> np.ndarray:
        """Embed texts using LLaMA hidden states with mean pooling.

        Uses temperature=NaN to get logits, but we intercept at the hidden layer.
        """
        if self._model is None:
            raise RuntimeError("Model not loaded. Call load_weights() first.")

        import math
        from tinygrad import Tensor

        results = []
        for text in texts:
            # Simple byte-level tokenization fallback
            # In production, use the proper LLaMA tokenizer (sentencepiece)
            tokens = self._tokenize(text)
            input_ids = Tensor([tokens])

            # Get hidden states by running through embeddings + layers + norm
            h = self._model.tok_embeddings(input_ids)
            seq_len = h.shape[1]
            freqs_cis = self._model.freqs_cis.cast(h.dtype)[:, :seq_len, :, :, :]

            mask = Tensor.full(
                (1, 1, seq_len, seq_len), float("-inf"), dtype=h.dtype
            ).triu(1) if seq_len > 1 else None

            for layer in self._model.layers:
                h = layer(h, 0, freqs_cis, mask)
            h = self._model.norm(h)

            # Mean pool over sequence
            embedding = h.mean(axis=1).squeeze(0)

            # L2 normalize
            norm = (embedding * embedding).sum().sqrt()
            embedding = embedding / norm.maximum(1e-12)

            results.append(embedding.numpy())

        return np.stack(results)

    def _tokenize(self, text: str) -> list[int]:
        """Basic tokenization. In production, use sentencepiece."""
        # Truncate to max_seq_len tokens
        # This is a placeholder - real usage needs proper LLaMA tokenizer
        encoded = text.encode("utf-8")[:self._max_seq]
        return list(encoded)
