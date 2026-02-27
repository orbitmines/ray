"""Model registry: register, load, and switch models by name."""
from __future__ import annotations

from typing import Any

from ..config import load_models_config, save_models_config
from .base import EmbeddingModel


# Map from model type string to model class
_MODEL_TYPES: dict[str, type] = {}


def register_model_type(type_name: str, cls: type):
    """Register a model class for a type name (e.g. 'nomic_bert')."""
    _MODEL_TYPES[type_name] = cls


class ModelRegistry:
    """Manages loading and switching between embedding models."""

    def __init__(self):
        self._loaded: dict[str, EmbeddingModel] = {}
        self._config = load_models_config()

    @property
    def config(self) -> dict:
        return self._config

    @property
    def indexing_model_name(self) -> str:
        return self._config["indexing"]

    @property
    def reranking_model_name(self) -> str:
        return self._config["reranking"]

    def list_models(self) -> dict[str, dict]:
        """List all registered models with their config."""
        return self._config.get("models", {})

    def get_model_config(self, name: str) -> dict:
        """Get config for a specific model."""
        models = self._config.get("models", {})
        if name not in models:
            raise KeyError(f"Unknown model: {name}. Available: {list(models.keys())}")
        return models[name]

    def load(self, name: str) -> EmbeddingModel:
        """Load a model by name (cached after first load)."""
        if name in self._loaded:
            return self._loaded[name]

        cfg = self.get_model_config(name)
        model_type = cfg["type"]
        if model_type not in _MODEL_TYPES:
            raise ValueError(
                f"Unknown model type '{model_type}'. "
                f"Registered types: {list(_MODEL_TYPES.keys())}"
            )

        cls = _MODEL_TYPES[model_type]
        model = cls(cfg)
        model.load_weights(cfg.get("path", ""))
        self._loaded[name] = model
        return model

    def get_indexing_model(self) -> EmbeddingModel:
        """Load and return the current indexing model."""
        return self.load(self.indexing_model_name)

    def get_reranking_model(self) -> EmbeddingModel:
        """Load and return the current reranking model."""
        return self.load(self.reranking_model_name)

    def select(self, name: str, task: str):
        """Switch the active model for a task ('indexing' or 'reranking')."""
        if task not in ("indexing", "reranking"):
            raise ValueError(f"task must be 'indexing' or 'reranking', got '{task}'")
        # Verify the model exists
        self.get_model_config(name)
        self._config[task] = name
        save_models_config(self._config)

    def unload(self, name: str):
        """Unload a model from memory."""
        self._loaded.pop(name, None)

    def unload_all(self):
        """Unload all models from memory."""
        self._loaded.clear()
