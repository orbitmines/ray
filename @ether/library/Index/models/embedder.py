"""Batch embedding pipeline: text -> vectors.

Handles batching, progress reporting, and model management.
"""
from __future__ import annotations

import time
from typing import Callable

import numpy as np

from .base import EmbeddingModel
from ..config import DEFAULT_BATCH_SIZE


class CodeEmbedder:
    """Batch embedding pipeline that processes texts through a model."""

    def __init__(self, model: EmbeddingModel, batch_size: int = DEFAULT_BATCH_SIZE):
        self.model = model
        self.batch_size = batch_size

    @property
    def dim(self) -> int:
        return self.model.dim

    def embed_batch(self, texts: list[str]) -> np.ndarray:
        """Embed a single batch of texts."""
        if not texts:
            return np.empty((0, self.model.dim), dtype=np.float32)
        return self.model.embed(texts)

    def embed_all(
        self,
        texts: list[str],
        progress_callback: Callable[[int, int], None] | None = None,
    ) -> np.ndarray:
        """Embed all texts in batches, with optional progress reporting.

        Args:
            texts: All texts to embed.
            progress_callback: Called with (processed_count, total_count) after each batch.

        Returns:
            numpy array of shape (len(texts), dim), dtype float32.
        """
        if not texts:
            return np.empty((0, self.model.dim), dtype=np.float32)

        all_embeddings = []
        total = len(texts)
        t0 = time.time()

        for i in range(0, total, self.batch_size):
            batch = texts[i : i + self.batch_size]
            embeddings = self.embed_batch(batch)
            all_embeddings.append(embeddings)
            done = min(i + len(batch), total)
            if progress_callback:
                progress_callback(done, total)
            # Print ETA after first batch
            if i == 0 and total > self.batch_size:
                elapsed = time.time() - t0
                eta_sec = elapsed * (total / len(batch) - 1)
                if eta_sec > 60:
                    print(f" (ETA: {eta_sec/60:.0f}m)", flush=True)
                else:
                    print(f" (ETA: {eta_sec:.0f}s)", flush=True)

        return np.concatenate(all_embeddings, axis=0)

    def embed_with_ids(
        self,
        items: list[tuple[str, str]],
        progress_callback: Callable[[int, int], None] | None = None,
    ) -> list[tuple[str, np.ndarray]]:
        """Embed items that have (id, text) pairs.

        Returns:
            List of (id, embedding_vector) tuples.
        """
        if not items:
            return []

        ids = [item[0] for item in items]
        texts = [item[1] for item in items]
        embeddings = self.embed_all(texts, progress_callback)

        return list(zip(ids, embeddings))
