"""Abstract base for embedding models."""
from __future__ import annotations

from typing import Protocol, runtime_checkable

import numpy as np


@runtime_checkable
class EmbeddingModel(Protocol):
    """Protocol that all embedding models must implement."""

    @property
    def dim(self) -> int:
        """Embedding dimensionality."""
        ...

    @property
    def max_seq_len(self) -> int:
        """Maximum input sequence length."""
        ...

    def embed(self, texts: list[str]) -> np.ndarray:
        """Embed a batch of texts into vectors.

        Args:
            texts: List of text strings to embed.

        Returns:
            numpy array of shape (len(texts), dim), dtype float32.
        """
        ...

    def load_weights(self, path: str) -> None:
        """Load model weights from the given path."""
        ...
