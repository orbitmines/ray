"""HuggingFace transformers wrapper for embedding models.

Uses transformers + torch directly for fast local loading.
Supports CodeRankEmbed and other NomicBERT-based models.
"""
from __future__ import annotations

import numpy as np

from .base import EmbeddingModel


class SentenceTransformerModel:
    """EmbeddingModel using HuggingFace transformers with local-first loading."""

    def __init__(self, config: dict):
        self._config = config
        self._model = None
        self._tokenizer = None
        self._dim = config.get("hidden_size", 768)
        self._max_seq = config.get("max_position_embeddings", 8192)
        self._model_name = config.get("hf_name", "")
        self._query_prefix = config.get("query_prefix", "search_query: ")
        self._document_prefix = config.get("document_prefix", "search_document: ")
        self._mode = "document"  # default to document embedding

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
        """Load model, preferring local cache to avoid network calls."""
        import logging
        logging.getLogger("transformers").setLevel(logging.ERROR)

        import torch
        import transformers
        transformers.logging.set_verbosity_error()
        # Suppress the "custom code" interactive prompt for local model files
        transformers.dynamic_module_utils.resolve_trust_remote_code = lambda *a, **kw: True
        from transformers import AutoTokenizer, AutoModel

        model_id = self._model_name or path
        if not model_id:
            raise ValueError("No model name or path specified")

        # Try local snapshot first for fast offline loading
        local_path = _find_local_snapshot(model_id)
        if local_path:
            self._tokenizer = AutoTokenizer.from_pretrained(local_path)
            self._model = AutoModel.from_pretrained(
                local_path, trust_remote_code=True, local_files_only=True
            )
        else:
            # Fall back to downloading
            self._tokenizer = AutoTokenizer.from_pretrained(model_id)
            self._model = AutoModel.from_pretrained(
                model_id, trust_remote_code=True
            )

        self._model.eval()
        self._dim = self._model.config.hidden_size

    def embed(self, texts: list[str]) -> np.ndarray:
        """Embed texts with appropriate prefix based on mode."""
        if self._model is None:
            raise RuntimeError("Model not loaded. Call load_weights() first.")

        import torch
        import torch.nn.functional as F

        prefix = self._query_prefix if self._mode == "query" else self._document_prefix
        prefixed = [prefix + t for t in texts]

        # Cap at 512 tokens for code chunks (keeps memory reasonable)
        max_len = min(self._max_seq, 512)
        inputs = self._tokenizer(
            prefixed, return_tensors="pt", padding=True,
            truncation=True, max_length=max_len,
        )

        with torch.no_grad():
            outputs = self._model(**inputs)

        # CLS pooling + L2 normalize
        embeddings = outputs.last_hidden_state[:, 0]
        embeddings = F.normalize(embeddings, p=2, dim=1)
        return embeddings.numpy()


def _find_local_snapshot(model_id: str) -> str | None:
    """Find the local HuggingFace cache snapshot for a model."""
    from pathlib import Path

    cache_dir = Path.home() / ".cache" / "huggingface" / "hub"
    # HF cache uses -- as separator: "nomic-ai/CodeRankEmbed" -> "models--nomic-ai--CodeRankEmbed"
    dir_name = "models--" + model_id.replace("/", "--")
    model_dir = cache_dir / dir_name / "snapshots"

    if not model_dir.exists():
        return None

    # Get the most recent snapshot
    snapshots = sorted(model_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
    if not snapshots:
        return None

    snapshot = snapshots[0]
    # Verify it has the essential files
    if (snapshot / "config.json").exists():
        return str(snapshot)
    return None
