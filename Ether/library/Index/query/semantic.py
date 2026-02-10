"""Semantic code search via vector similarity."""
from __future__ import annotations

import numpy as np

from ..models.base import EmbeddingModel
from ..store.vector_store import VectorStore
from ..config import DEFAULT_SEARCH_LIMIT
from .results import SearchResult


class SemanticSearch:
    """Embed query -> vector search -> rank results."""

    def __init__(self, model: EmbeddingModel, store: VectorStore):
        self.model = model
        self.store = store

    def search(
        self,
        query: str,
        limit: int = DEFAULT_SEARCH_LIMIT,
        language: str | None = None,
        version: str | None = None,
        ast_type: str | None = None,
        repo: str | None = None,
        exclude_languages: list[str] | None = None,
    ) -> list[SearchResult]:
        """Search for code similar to the query text.

        Args:
            query: Natural language or code query.
            limit: Max results.
            language: Filter to language.
            version: Filter to version.
            ast_type: Filter to AST type.
            repo: Filter to repo.
            exclude_languages: Languages to exclude.

        Returns:
            List of SearchResult objects sorted by similarity.
        """
        # Set query mode for models that support it (e.g. sentence-transformers)
        if hasattr(self.model, 'set_mode'):
            self.model.set_mode('query')
        query_vector = self.model.embed([query])[0]

        # Search the store
        raw_results = self.store.search(
            query_vector=query_vector,
            limit=limit,
            language=language,
            version=version,
            ast_type=ast_type,
            repo=repo,
            exclude_languages=exclude_languages,
        )

        return [_to_search_result(r) for r in raw_results]

    def search_by_code(
        self,
        code: str,
        limit: int = DEFAULT_SEARCH_LIMIT,
        **kwargs,
    ) -> list[SearchResult]:
        """Search using a code snippet as query (same as search, semantic alias)."""
        return self.search(code, limit=limit, **kwargs)


def _to_search_result(raw: dict) -> SearchResult:
    """Convert a raw LanceDB result dict to a SearchResult."""
    return SearchResult(
        chunk_id=raw.get("chunk_id", ""),
        language=raw.get("language", ""),
        version=raw.get("version", ""),
        file_path=raw.get("file_path", ""),
        repo=raw.get("repo", ""),
        start_line=raw.get("start_line", 0),
        end_line=raw.get("end_line", 0),
        ast_type=raw.get("ast_type", ""),
        name=raw.get("name", ""),
        text=raw.get("text", ""),
        score=raw.get("_distance", 0.0),
    )
