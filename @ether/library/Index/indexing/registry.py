"""Parse index.tsv into LanguageEntry objects."""
from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from pathlib import Path

from ..config import INDEX_TSV, EXTERNAL_DIR


@dataclass
class LanguageEntry:
    name: str
    aliases: str
    category: str
    extensions: list[str]
    urls: list[str]
    github_url: str
    dir_name: str
    version: str = ""

    @property
    def repo_path(self) -> Path | None:
        """Path to the cloned repo in .ether/external/."""
        if not self.github_url:
            return None
        # github.com/owner/repo -> .ether/external/github.com/owner/repo
        url = self.github_url.rstrip("/")
        if url.startswith("https://"):
            url = url[len("https://"):]
        return EXTERNAL_DIR / url

    @property
    def has_repo(self) -> bool:
        p = self.repo_path
        return p is not None and p.exists()

    def resolve_version(self) -> str:
        """Resolve version from git tag or commit SHA."""
        if self.version:
            return self.version
        repo = self.repo_path
        if repo is None or not repo.exists():
            return "unknown"
        try:
            result = subprocess.run(
                ["git", "describe", "--tags", "--abbrev=0"],
                cwd=repo, capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip()
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass
        try:
            result = subprocess.run(
                ["git", "rev-parse", "--short", "HEAD"],
                cwd=repo, capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip()
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass
        return "unknown"


class LanguageRegistry:
    """Parses index.tsv and provides lookup by name/alias."""

    def __init__(self, tsv_path: Path | None = None):
        self.tsv_path = tsv_path or INDEX_TSV
        self.entries: list[LanguageEntry] = []
        self._by_name: dict[str, LanguageEntry] = {}
        self._by_dir_name: dict[str, LanguageEntry] = {}

    def load(self) -> list[LanguageEntry]:
        """Parse the TSV file into LanguageEntry objects."""
        self.entries = []
        self._by_name = {}
        self._by_dir_name = {}

        if not self.tsv_path.exists():
            raise FileNotFoundError(f"Index TSV not found: {self.tsv_path}")

        with open(self.tsv_path) as f:
            for line in f:
                line = line.rstrip("\n")
                if not line:
                    continue
                # TSV format: name\taliases\tcategory\textensions\turls\tgithub_url\tdir_name
                # Use split with explicit tab - fields may be empty
                parts = line.split("\t")
                while len(parts) < 7:
                    parts.append("")

                name = parts[0]
                aliases = parts[1]
                category = parts[2]
                extensions = [e.strip() for e in parts[3].split(",") if e.strip()]
                urls = [u.strip() for u in parts[4].split(",") if u.strip()]
                github_url = parts[5].strip()
                dir_name = parts[6].strip()

                entry = LanguageEntry(
                    name=name,
                    aliases=aliases,
                    category=category,
                    extensions=extensions,
                    urls=urls,
                    github_url=github_url,
                    dir_name=dir_name,
                )
                self.entries.append(entry)
                self._by_name[name.lower()] = entry
                if dir_name:
                    self._by_dir_name[dir_name.lower()] = entry
                # Also index by aliases
                if aliases:
                    for alias in aliases.split(","):
                        alias = alias.strip()
                        if alias:
                            self._by_name[alias.lower()] = entry

        return self.entries

    def get(self, name: str) -> LanguageEntry | None:
        """Look up a language by name, alias, or dir_name."""
        key = name.lower()
        return self._by_name.get(key) or self._by_dir_name.get(key)

    def languages(self) -> list[LanguageEntry]:
        """Return only Language category entries."""
        return [e for e in self.entries if e.category == "Language"]

    def with_repos(self) -> list[LanguageEntry]:
        """Return entries that have cloned repos."""
        return [e for e in self.entries if e.has_repo]

    def with_extensions(self) -> list[LanguageEntry]:
        """Return entries that have file extensions defined."""
        return [e for e in self.entries if e.extensions]

    def build_extension_map(self) -> dict[str, list[str]]:
        """Build a map from file extension to language names."""
        ext_map: dict[str, list[str]] = {}
        for entry in self.entries:
            for ext in entry.extensions:
                ext_map.setdefault(ext, []).append(entry.name)
        return ext_map
