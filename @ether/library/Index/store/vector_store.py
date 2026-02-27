"""LanceDB wrapper for vector storage and search."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from ..config import VECTORS_DIR, EMBEDDING_DIM, ensure_dirs
from .schema import CHUNKS_SCHEMA, TABLE_NAME


class VectorStore:
    """LanceDB-backed vector store for code chunk embeddings."""

    def __init__(self, db_path: Path | None = None):
        self._db_path = str(db_path or VECTORS_DIR)
        self._db = None
        self._table = None

    def _get_db(self):
        if self._db is None:
            import lancedb
            ensure_dirs()
            self._db = lancedb.connect(self._db_path)
        return self._db

    def _get_table(self):
        if self._table is None:
            db = self._get_db()
            try:
                self._table = db.open_table(TABLE_NAME)
            except Exception:
                self._table = None
        return self._table

    def _ensure_table(self):
        """Get or create the table."""
        table = self._get_table()
        if table is not None:
            return table
        db = self._get_db()
        import pyarrow as pa
        empty = pa.table({
            "chunk_id": pa.array([], type=pa.string()),
            "language": pa.array([], type=pa.string()),
            "version": pa.array([], type=pa.string()),
            "file_path": pa.array([], type=pa.string()),
            "repo": pa.array([], type=pa.string()),
            "start_line": pa.array([], type=pa.int32()),
            "end_line": pa.array([], type=pa.int32()),
            "ast_type": pa.array([], type=pa.string()),
            "name": pa.array([], type=pa.string()),
            "text": pa.array([], type=pa.string()),
            "vector": pa.array([], type=pa.list_(pa.float32(), EMBEDDING_DIM)),
        })
        self._table = db.create_table(TABLE_NAME, data=empty, schema=CHUNKS_SCHEMA)
        return self._table

    def insert(self, records: list[dict]) -> int:
        """Insert code chunk records into the store.

        Each record should have: chunk_id, language, version, file_path, repo,
        start_line, end_line, ast_type, name, text, vector.

        Returns:
            Number of records inserted.
        """
        if not records:
            return 0
        table = self._ensure_table()
        table.add(records)
        return len(records)

    def search(
        self,
        query_vector: np.ndarray,
        limit: int = 20,
        language: str | None = None,
        version: str | None = None,
        ast_type: str | None = None,
        repo: str | None = None,
        exclude_languages: list[str] | None = None,
    ) -> list[dict]:
        """Search for similar code chunks.

        Args:
            query_vector: Query embedding vector.
            limit: Max results to return.
            language: Filter to a specific language.
            version: Filter to a specific version.
            ast_type: Filter to a specific AST type (e.g. "function_definition").
            repo: Filter to a specific repo.
            exclude_languages: Languages to exclude from results.

        Returns:
            List of result dicts with metadata and _distance score.
        """
        table = self._get_table()
        if table is None:
            return []

        query = table.search(query_vector.tolist()).limit(limit)

        # Build where clause
        filters = []
        if language:
            filters.append(f"language = '{_escape(language)}'")
        if version:
            filters.append(f"version = '{_escape(version)}'")
        if ast_type:
            filters.append(f"ast_type = '{_escape(ast_type)}'")
        if repo:
            filters.append(f"repo = '{_escape(repo)}'")
        if exclude_languages:
            for lang in exclude_languages:
                filters.append(f"language != '{_escape(lang)}'")

        if filters:
            query = query.where(" AND ".join(filters))

        results = query.to_list()
        return results

    def count(self, language: str | None = None) -> int:
        """Count records, optionally filtered by language."""
        table = self._get_table()
        if table is None:
            return 0
        if language:
            return table.count_rows(f"language = '{_escape(language)}'")
        return table.count_rows()

    def languages(self) -> list[dict]:
        """Get list of indexed languages with chunk counts."""
        table = self._get_table()
        if table is None:
            return []
        try:
            df = table.to_lance().to_table(columns=["language"]).to_pandas()
            counts = df["language"].value_counts().to_dict()
        except (ImportError, Exception):
            # Fallback: query all records for language field
            results = table.search().select(["language"]).limit(1_000_000).to_list()
            counts: dict[str, int] = {}
            for r in results:
                lang = r.get("language", "")
                counts[lang] = counts.get(lang, 0) + 1
        return [{"language": lang, "count": count} for lang, count in sorted(counts.items())]

    def stats(self) -> dict:
        """Get index statistics."""
        table = self._get_table()
        if table is None:
            return {"total_chunks": 0, "languages": 0, "repos": 0}
        try:
            df = table.to_lance().to_table(columns=["language", "repo"]).to_pandas()
            return {
                "total_chunks": len(df),
                "languages": df["language"].nunique(),
                "repos": df["repo"].nunique(),
            }
        except (ImportError, Exception):
            total = table.count_rows()
            results = table.search().select(["language", "repo"]).limit(1_000_000).to_list()
            languages = set(r.get("language", "") for r in results)
            repos = set(r.get("repo", "") for r in results)
            return {
                "total_chunks": total,
                "languages": len(languages),
                "repos": len(repos),
            }

    def delete_by_language(self, language: str) -> int:
        """Delete all chunks for a language (for reindexing)."""
        table = self._get_table()
        if table is None:
            return 0
        count = table.count_rows(f"language = '{_escape(language)}'")
        table.delete(f"language = '{_escape(language)}'")
        return count

    def delete_by_file(self, file_path: str) -> int:
        """Delete all chunks for a specific file."""
        table = self._get_table()
        if table is None:
            return 0
        count = table.count_rows(f"file_path = '{_escape(file_path)}'")
        table.delete(f"file_path = '{_escape(file_path)}'")
        return count


def _escape(s: str) -> str:
    """Escape single quotes for LanceDB SQL-like filters."""
    return s.replace("'", "''")
