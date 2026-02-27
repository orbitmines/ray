"""Chunking facade - picks tree-sitter or line-based fallback."""
from __future__ import annotations

from .tree_sitter_chunker import TreeSitterChunker, CodeChunk
from .line_chunker import LineChunker
from ..config import DEFAULT_CHUNK_MAX_LINES, DEFAULT_CHUNK_MIN_LINES


class Chunker:
    """Facade that selects the best chunking strategy for a given language."""

    def __init__(self, min_lines: int = DEFAULT_CHUNK_MIN_LINES,
                 max_lines: int = DEFAULT_CHUNK_MAX_LINES):
        self.min_lines = min_lines
        self.max_lines = max_lines
        self._ts_chunker = TreeSitterChunker()
        self._line_chunker = LineChunker()

    def chunk(self, source: str, language: str) -> list[CodeChunk]:
        """Chunk source code using the best available strategy.

        Uses tree-sitter AST parsing for supported languages,
        falls back to blank-line-boundary splitting otherwise.

        Args:
            source: Source code text.
            language: Language name (e.g. "Python", "Rust").

        Returns:
            List of CodeChunk objects.
        """
        if self._ts_chunker.supports(language):
            chunks = self._ts_chunker.chunk(source, language, self.min_lines, self.max_lines)
            if chunks:
                return chunks

        # Fallback to line-based
        return self._line_chunker.chunk(source, self.min_lines, self.max_lines)

    def supported_languages(self) -> list[str]:
        """Return languages with tree-sitter support."""
        return self._ts_chunker.supported_languages()
