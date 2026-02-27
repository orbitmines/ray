"""Fallback line-based chunking for languages without tree-sitter support.

Splits source code on blank-line boundaries into chunks.
"""
from __future__ import annotations

from dataclasses import dataclass

from .tree_sitter_chunker import CodeChunk


class LineChunker:
    """Splits source code into chunks at blank-line boundaries."""

    def chunk(self, source: str, min_lines: int = 5, max_lines: int = 100) -> list[CodeChunk]:
        """Split source into chunks at blank-line boundaries.

        Args:
            source: Source code text.
            min_lines: Minimum chunk size in lines.
            max_lines: Maximum chunk size in lines.

        Returns:
            List of CodeChunk objects.
        """
        if not source.strip():
            return []

        lines = source.split("\n")
        chunks = []
        current_start = 0
        current_lines: list[str] = []
        blank_count = 0

        for i, line in enumerate(lines):
            stripped = line.strip()
            if not stripped:
                blank_count += 1
                current_lines.append(line)
                # Split at double blank lines, or if we've exceeded max_lines
                if (blank_count >= 2 or len(current_lines) >= max_lines) and len(current_lines) >= min_lines:
                    text = "\n".join(current_lines).rstrip()
                    if text.strip():
                        chunks.append(CodeChunk(
                            text=text,
                            start_line=current_start + 1,
                            end_line=current_start + len(current_lines),
                            ast_type="block",
                            name="",
                        ))
                    current_start = i + 1
                    current_lines = []
                    blank_count = 0
            else:
                blank_count = 0
                current_lines.append(line)

                # Force split at max_lines
                if len(current_lines) >= max_lines:
                    text = "\n".join(current_lines)
                    chunks.append(CodeChunk(
                        text=text,
                        start_line=current_start + 1,
                        end_line=current_start + len(current_lines),
                        ast_type="block",
                        name="",
                    ))
                    current_start = i + 1
                    current_lines = []
                    blank_count = 0

        # Don't forget the last chunk
        if current_lines:
            text = "\n".join(current_lines).rstrip()
            if text.strip() and len(current_lines) >= min_lines:
                chunks.append(CodeChunk(
                    text=text,
                    start_line=current_start + 1,
                    end_line=current_start + len(current_lines),
                    ast_type="block",
                    name="",
                ))
            elif text.strip() and not chunks:
                # If this is the only content and it's too small, include it anyway
                chunks.append(CodeChunk(
                    text=text,
                    start_line=current_start + 1,
                    end_line=current_start + len(current_lines),
                    ast_type="block",
                    name="",
                ))

        return chunks
