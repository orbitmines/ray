"""Walk .ether/external/ to discover source files for indexing."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from .registry import LanguageEntry

# Directories to skip during crawling
SKIP_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "__pycache__", ".tox",
    ".eggs", "*.egg-info", "vendor", "third_party", "dist", "build",
    ".cache", ".mypy_cache", ".pytest_cache", ".ruff_cache",
}

# Max file size to index (1MB)
MAX_FILE_SIZE = 1_000_000


@dataclass
class SourceFile:
    """A discovered source file ready for chunking."""
    path: Path
    language: str
    repo: str
    relative_path: str  # Path relative to the repo root


class SourceCrawler:
    """Discovers source files in cloned repos."""

    def __init__(self, extension_map: dict[str, list[str]]):
        """
        Args:
            extension_map: Map from file extension (e.g. '.py') to language names.
        """
        self._ext_map = extension_map
        # Build reverse: set of all known extensions for fast lookup
        self._known_exts = set(extension_map.keys())

    def crawl_entry(self, entry: LanguageEntry) -> list[SourceFile]:
        """Crawl a single language entry's repo."""
        repo_path = entry.repo_path
        if repo_path is None or not repo_path.exists():
            return []

        # Derive the repo identifier from github_url
        repo_id = entry.github_url.rstrip("/")
        if repo_id.startswith("https://"):
            repo_id = repo_id[len("https://"):]

        files = []
        for source_file in self._walk_dir(repo_path, entry.name, repo_id):
            files.append(source_file)
        return files

    def crawl_entries(self, entries: list[LanguageEntry]) -> list[SourceFile]:
        """Crawl multiple language entries' repos."""
        files = []
        for entry in entries:
            files.extend(self.crawl_entry(entry))
        return files

    def _walk_dir(self, root: Path, language: str, repo: str) -> list[SourceFile]:
        """Walk directory tree, yielding matching source files."""
        results = []
        for dirpath, dirnames, filenames in os.walk(root):
            # Prune skipped directories in-place
            dirnames[:] = [
                d for d in dirnames
                if d not in SKIP_DIRS and not d.endswith(".egg-info")
            ]

            for fname in filenames:
                fpath = Path(dirpath) / fname
                ext = self._get_extension(fname)
                if ext not in self._known_exts:
                    continue

                # Check this extension maps to the expected language
                langs_for_ext = self._ext_map.get(ext, [])
                if language not in langs_for_ext:
                    continue

                # Skip files that are too large
                try:
                    if fpath.stat().st_size > MAX_FILE_SIZE:
                        continue
                except OSError:
                    continue

                rel_path = str(fpath.relative_to(root))
                results.append(SourceFile(
                    path=fpath,
                    language=language,
                    repo=repo,
                    relative_path=rel_path,
                ))
        return results

    @staticmethod
    def _get_extension(filename: str) -> str:
        """Get file extension including the dot, handling compound extensions."""
        # Handle compound extensions like .ray.txt
        name = filename
        exts = []
        while True:
            base, ext = os.path.splitext(name)
            if not ext:
                break
            exts.insert(0, ext)
            name = base
        # Return the primary extension (last one)
        if exts:
            return exts[-1]
        return ""
