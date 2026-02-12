"""Indexing pipeline orchestrator: crawl -> chunk -> embed -> store."""
from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Callable

from ..config import INDEX_STATE_FILE, ensure_dirs
from ..models.embedder import CodeEmbedder
from ..store.vector_store import VectorStore
from .registry import LanguageRegistry, LanguageEntry
from .crawler import SourceCrawler, SourceFile
from .chunker import Chunker
from .tree_sitter_chunker import CodeChunk


class IndexState:
    """Tracks which files have been indexed."""

    def __init__(self, state_file: Path | None = None):
        self._file = state_file or INDEX_STATE_FILE
        self._state: dict = {}
        self._load()

    def _load(self):
        if self._file.exists():
            with open(self._file) as f:
                self._state = json.load(f)
        else:
            self._state = {"files": {}, "languages": {}}

    def save(self):
        ensure_dirs()
        with open(self._file, "w") as f:
            json.dump(self._state, f, indent=2)

    def is_indexed(self, file_path: str, mtime: float) -> bool:
        """Check if a file has been indexed (and hasn't changed)."""
        entry = self._state.get("files", {}).get(file_path)
        if entry is None:
            return False
        return entry.get("mtime", 0) >= mtime

    def mark_indexed(self, file_path: str, mtime: float, chunk_count: int):
        self._state.setdefault("files", {})[file_path] = {
            "mtime": mtime,
            "chunks": chunk_count,
            "indexed_at": time.time(),
        }

    def mark_language(self, language: str, version: str, file_count: int, chunk_count: int):
        self._state.setdefault("languages", {})[language] = {
            "version": version,
            "files": file_count,
            "chunks": chunk_count,
            "indexed_at": time.time(),
        }

    def get_language_info(self, language: str) -> dict | None:
        return self._state.get("languages", {}).get(language)


class IndexingPipeline:
    """Orchestrates the full indexing pipeline."""

    def __init__(
        self,
        registry: LanguageRegistry,
        embedder: CodeEmbedder,
        store: VectorStore,
        chunker: Chunker | None = None,
        state: IndexState | None = None,
    ):
        self.registry = registry
        self.embedder = embedder
        self.store = store
        self.chunker = chunker or Chunker()
        self.state = state or IndexState()
        self._ext_map = registry.build_extension_map()
        self._crawler = SourceCrawler(self._ext_map)

    def index_language(
        self,
        language_name: str,
        version: str | None = None,
        incremental: bool = True,
        max_files: int = 0,
        progress_callback: Callable[[str, int, int], None] | None = None,
    ) -> dict:
        """Index a single language.

        Args:
            language_name: Name of the language to index.
            version: Override version string.
            incremental: Skip already-indexed files.
            progress_callback: Called with (phase, current, total).

        Returns:
            Dict with indexing stats.
        """
        entry = self.registry.get(language_name)
        if entry is None:
            raise ValueError(f"Unknown language: {language_name}")

        if not entry.has_repo:
            return {"language": language_name, "error": "No repo cloned", "files": 0, "chunks": 0}

        entry.version = version or entry.resolve_version()

        if not incremental:
            self.store.delete_by_language(entry.name)

        # Phase 1: Crawl
        if progress_callback:
            progress_callback("crawling", 0, 0)
        source_files = self._crawler.crawl_entry(entry)

        if not source_files:
            return {"language": language_name, "files": 0, "chunks": 0}

        # Filter out already-indexed files
        if incremental:
            source_files = self._filter_new(source_files)

        if not source_files:
            return {"language": language_name, "files": 0, "chunks": 0, "skipped": "all up to date"}

        if max_files > 0:
            source_files = source_files[:max_files]

        # Phase 2: Chunk
        if progress_callback:
            progress_callback("chunking", 0, len(source_files))

        all_chunks: list[tuple[SourceFile, CodeChunk]] = []
        for i, sf in enumerate(source_files):
            try:
                source = sf.path.read_text(errors="replace")
            except (OSError, UnicodeDecodeError):
                continue
            chunks = self.chunker.chunk(source, sf.language)
            for chunk in chunks:
                all_chunks.append((sf, chunk))
            if progress_callback:
                progress_callback("chunking", i + 1, len(source_files))

        if not all_chunks:
            return {"language": language_name, "files": len(source_files), "chunks": 0}

        # Phase 3+4: Embed and store in streaming batches
        if hasattr(self.embedder.model, 'set_mode'):
            self.embedder.model.set_mode('document')

        total_chunks = len(all_chunks)
        if progress_callback:
            progress_callback("embedding", 0, total_chunks)

        batch_size = self.embedder.batch_size
        stored_count = 0
        t0 = time.time()

        for batch_start in range(0, total_chunks, batch_size):
            batch_items = all_chunks[batch_start : batch_start + batch_size]
            batch_texts = [chunk.text for _, chunk in batch_items]

            batch_embeddings = self.embedder.embed_batch(batch_texts)

            # Build records and store immediately
            records = []
            for (sf, chunk), embedding in zip(batch_items, batch_embeddings):
                records.append({
                    "chunk_id": str(uuid.uuid4()),
                    "language": sf.language,
                    "version": entry.version,
                    "file_path": sf.relative_path,
                    "repo": sf.repo,
                    "start_line": chunk.start_line,
                    "end_line": chunk.end_line,
                    "ast_type": chunk.ast_type,
                    "name": chunk.name,
                    "text": chunk.text,
                    "vector": embedding.tolist(),
                })
            self.store.insert(records)
            stored_count += len(records)

            if progress_callback:
                progress_callback("embedding", stored_count, total_chunks)

            # Print ETA after first batch
            if batch_start == 0 and total_chunks > batch_size:
                elapsed = time.time() - t0
                eta_sec = elapsed * (total_chunks / len(batch_items) - 1)
                if eta_sec > 60:
                    print(f" (ETA: {eta_sec/60:.0f}m for {total_chunks} chunks)", flush=True)
                else:
                    print(f" (ETA: {eta_sec:.0f}s for {total_chunks} chunks)", flush=True)

        # Update state
        for sf in source_files:
            try:
                mtime = sf.path.stat().st_mtime
            except OSError:
                mtime = 0
            self.state.mark_indexed(sf.relative_path, mtime, len([
                c for s, c in all_chunks if s is sf
            ]))

        self.state.mark_language(entry.name, entry.version, len(source_files), stored_count)
        self.state.save()

        if progress_callback:
            progress_callback("done", stored_count, stored_count)

        return {
            "language": language_name,
            "version": entry.version,
            "files": len(source_files),
            "chunks": stored_count,
        }

    def index_all(
        self,
        incremental: bool = True,
        languages: list[str] | None = None,
        progress_callback: Callable[[str, str, int, int], None] | None = None,
    ) -> list[dict]:
        """Index all languages (or a subset).

        Args:
            incremental: Skip already-indexed files.
            languages: Optional list of language names to index.
            progress_callback: Called with (language, phase, current, total).

        Returns:
            List of per-language result dicts.
        """
        if languages:
            entries = [self.registry.get(name) for name in languages]
            entries = [e for e in entries if e is not None and e.has_repo]
        else:
            entries = self.registry.with_repos()

        results = []
        for entry in entries:
            lang_cb = None
            if progress_callback:
                lang_cb = lambda phase, cur, tot, lang=entry.name: progress_callback(lang, phase, cur, tot)

            result = self.index_language(entry.name, incremental=incremental, progress_callback=lang_cb)
            results.append(result)

        return results

    def _filter_new(self, files: list[SourceFile]) -> list[SourceFile]:
        """Filter out files that haven't changed since last indexing."""
        new_files = []
        for sf in files:
            try:
                mtime = sf.path.stat().st_mtime
            except OSError:
                continue
            if not self.state.is_indexed(sf.relative_path, mtime):
                new_files.append(sf)
        return new_files
