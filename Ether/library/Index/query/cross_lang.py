"""Cross-language equivalence finder.

Given code in language X, find equivalent implementations across other languages.
Optionally reranks with a larger model and structural comparison.
"""
from __future__ import annotations

from ..models.base import EmbeddingModel
from ..store.vector_store import VectorStore
from ..config import DEFAULT_SEARCH_LIMIT, DEFAULT_RERANK_CANDIDATES
from .semantic import SemanticSearch
from .structural import compare
from .results import SearchResult, EquivalenceResult


class CrossLanguageFinder:
    """Find equivalent implementations across languages."""

    def __init__(
        self,
        search_model: EmbeddingModel,
        store: VectorStore,
        rerank_model: EmbeddingModel | None = None,
    ):
        self._search = SemanticSearch(search_model, store)
        self._rerank_model = rerank_model
        self._store = store

    def find_equivalents(
        self,
        code: str,
        source_language: str,
        limit: int = DEFAULT_SEARCH_LIMIT,
        rerank: bool = True,
        structural: bool = True,
        target_languages: list[str] | None = None,
    ) -> EquivalenceResult:
        """Find equivalent implementations in other languages.

        Args:
            code: Source code to find equivalents for.
            source_language: Language of the source code.
            limit: Number of results to return.
            rerank: Whether to rerank with the larger model.
            structural: Whether to add structural comparison scores.
            target_languages: Specific languages to search (None = all).

        Returns:
            EquivalenceResult with ranked equivalents.
        """
        # Get more candidates than limit for reranking
        candidates_limit = DEFAULT_RERANK_CANDIDATES if rerank and self._rerank_model else limit

        # Determine language exclusion
        exclude_langs = [source_language]

        if target_languages:
            # Search each target language
            results: list[SearchResult] = []
            for lang in target_languages:
                if lang == source_language:
                    continue
                lang_results = self._search.search(
                    code,
                    limit=candidates_limit // max(len(target_languages), 1),
                    language=lang,
                )
                results.extend(lang_results)
        else:
            results = self._search.search(
                code,
                limit=candidates_limit,
                exclude_languages=exclude_langs,
            )

        # Rerank with larger model
        if rerank and self._rerank_model and results:
            results = self._rerank(code, results, limit * 2)

        # Add structural scores
        if structural and results:
            for result in results:
                try:
                    comp = compare(code, source_language, result.text, result.language)
                    result.structural_score = comp.similarity
                except Exception:
                    pass

        # Sort by combined score (semantic + structural)
        results = _combined_sort(results)

        return EquivalenceResult(
            source_language=source_language,
            source_code=code,
            equivalents=results[:limit],
        )

    def _rerank(self, query_code: str, candidates: list[SearchResult], limit: int) -> list[SearchResult]:
        """Rerank candidates using the larger model."""
        if not self._rerank_model:
            return candidates

        import numpy as np

        # Embed query with reranking model (query mode)
        if hasattr(self._rerank_model, 'set_mode'):
            self._rerank_model.set_mode('query')
        query_vec = self._rerank_model.embed([query_code])[0]

        # Embed all candidate texts (document mode)
        if hasattr(self._rerank_model, 'set_mode'):
            self._rerank_model.set_mode('document')
        texts = [r.text for r in candidates]
        candidate_vecs = self._rerank_model.embed(texts)

        # Compute cosine similarity
        similarities = candidate_vecs @ query_vec
        norms = np.linalg.norm(candidate_vecs, axis=1) * np.linalg.norm(query_vec)
        norms = np.maximum(norms, 1e-12)
        scores = similarities / norms

        # Update scores and sort
        for i, result in enumerate(candidates):
            result.score = float(1.0 - scores[i])  # Convert to distance-like score

        candidates.sort(key=lambda r: r.score)
        return candidates[:limit]


def _combined_sort(results: list[SearchResult]) -> list[SearchResult]:
    """Sort results by combined semantic + structural score."""
    def sort_key(r: SearchResult) -> float:
        semantic = r.score  # Lower is better (distance)
        if r.structural_score is not None:
            # Structural is 0-1 (higher is better), convert to distance-like
            structural = 1.0 - r.structural_score
            return 0.7 * semantic + 0.3 * structural
        return semantic

    results.sort(key=sort_key)
    return results
