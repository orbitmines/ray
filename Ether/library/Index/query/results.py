"""Result dataclasses and formatting for search results."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SearchResult:
    """A single search result."""
    chunk_id: str
    language: str
    version: str
    file_path: str
    repo: str
    start_line: int
    end_line: int
    ast_type: str
    name: str
    text: str
    score: float  # Similarity score (lower distance = better)
    structural_score: float | None = None

    def to_dict(self) -> dict:
        d = {
            "chunk_id": self.chunk_id,
            "language": self.language,
            "version": self.version,
            "file_path": self.file_path,
            "repo": self.repo,
            "start_line": self.start_line,
            "end_line": self.end_line,
            "ast_type": self.ast_type,
            "name": self.name,
            "text": self.text,
            "score": self.score,
        }
        if self.structural_score is not None:
            d["structural_score"] = self.structural_score
        return d

    def summary(self) -> str:
        """Short human-readable summary."""
        name_part = f" {self.name}" if self.name else ""
        return (
            f"[{self.language}] {self.repo}:{self.file_path}"
            f" L{self.start_line}-{self.end_line}"
            f" ({self.ast_type}{name_part}) score={self.score:.4f}"
        )


@dataclass
class ComparisonResult:
    """Result of structural comparison between two code fragments."""
    similarity: float
    features_a: dict
    features_b: dict
    details: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "similarity": self.similarity,
            "features_a": self.features_a,
            "features_b": self.features_b,
            "details": self.details,
        }


@dataclass
class EquivalenceResult:
    """Result of cross-language equivalence search."""
    source_language: str
    source_code: str
    equivalents: list[SearchResult]

    def to_dict(self) -> dict:
        return {
            "source_language": self.source_language,
            "source_code": self.source_code[:200] + ("..." if len(self.source_code) > 200 else ""),
            "equivalents": [r.to_dict() for r in self.equivalents],
        }
