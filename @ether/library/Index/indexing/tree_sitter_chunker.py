"""AST-based code chunking using tree-sitter.

Parses source files into semantic chunks (functions, classes, methods, etc.)
using tree-sitter grammars for 150+ languages.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

# Language name -> tree-sitter language module name
_LANG_TO_TS = {
    "Python": "python",
    "JavaScript": "javascript",
    "TypeScript": "typescript",
    "Rust": "rust",
    "C": "c",
    "C++": "cpp",
    "Go": "go",
    "Java": "java",
    "Ruby": "ruby",
    "Haskell": "haskell",
    "C#": "c_sharp",
    "Swift": "swift",
    "Kotlin": "kotlin",
    "Scala": "scala",
    "PHP": "php",
    "Lua": "lua",
    "R": "r",
    "Julia": "julia",
    "Elixir": "elixir",
    "Erlang": "erlang",
    "OCaml": "ocaml",
    "Zig": "zig",
    "Bash": "bash",
    "CSS": "css",
    "HTML": "html",
    "SQL": "sql",
    "TOML": "toml",
    "YAML": "yaml",
    "JSON": "json",
}

# AST node types that represent meaningful code units
CHUNK_NODE_TYPES = {
    "function_definition",
    "function_declaration",
    "method_definition",
    "method_declaration",
    "class_definition",
    "class_declaration",
    "struct_definition",
    "struct_declaration",
    "enum_definition",
    "enum_declaration",
    "interface_declaration",
    "trait_item",
    "impl_item",
    "module_declaration",
    "function_item",
    "const_item",
    "static_item",
    "type_alias",
    "type_declaration",
    # Go
    "function_declaration",
    "method_declaration",
    "type_declaration",
    # Haskell
    "function",
    "signature",
    # Ruby
    "method",
    "class",
    "module",
    # JavaScript/TypeScript
    "arrow_function",
    "generator_function",
    "generator_function_declaration",
    "export_statement",
    "lexical_declaration",
}


@dataclass
class CodeChunk:
    """A semantic code chunk extracted from a source file."""
    text: str
    start_line: int
    end_line: int
    ast_type: str
    name: str


class TreeSitterChunker:
    """Chunks source code using tree-sitter AST parsing."""

    def __init__(self):
        self._parsers: dict[str, object] = {}
        self._available: set[str] | None = None

    def supports(self, language: str) -> bool:
        """Check if tree-sitter supports this language."""
        return language in _LANG_TO_TS and self._try_get_language(language) is not None

    def supported_languages(self) -> list[str]:
        """Return list of languages with available tree-sitter grammars."""
        if self._available is None:
            self._available = set()
            for lang in _LANG_TO_TS:
                if self._try_get_language(lang) is not None:
                    self._available.add(lang)
        return sorted(self._available)

    def chunk(self, source: str, language: str, min_lines: int = 5, max_lines: int = 100) -> list[CodeChunk]:
        """Parse source code and extract semantic chunks.

        Args:
            source: Source code text.
            language: Language name (e.g. "Python").
            min_lines: Minimum chunk size in lines.
            max_lines: Maximum chunk size in lines (large functions get split).

        Returns:
            List of CodeChunk objects.
        """
        parser = self._get_parser(language)
        if parser is None:
            return []

        import tree_sitter
        tree = parser.parse(source.encode("utf-8"))
        chunks = []
        self._extract_chunks(tree.root_node, source, chunks, min_lines, max_lines)

        # If no semantic chunks found, return the whole file as one chunk
        if not chunks and source.strip():
            lines = source.split("\n")
            chunks.append(CodeChunk(
                text=source,
                start_line=1,
                end_line=len(lines),
                ast_type="file",
                name="",
            ))

        return chunks

    def _extract_chunks(self, node, source: str, chunks: list[CodeChunk],
                       min_lines: int, max_lines: int):
        """Recursively extract code chunks from AST nodes."""
        # Skip root-level nodes (e.g. Python's 'module', Ruby's 'program')
        is_root = node.parent is None
        if not is_root and node.type in CHUNK_NODE_TYPES:
            start_line = node.start_point[0] + 1  # 1-indexed
            end_line = node.end_point[0] + 1
            num_lines = end_line - start_line + 1

            if num_lines >= min_lines:
                text = source[node.start_byte:node.end_byte]
                name = self._extract_name(node)

                if num_lines <= max_lines:
                    chunks.append(CodeChunk(
                        text=text,
                        start_line=start_line,
                        end_line=end_line,
                        ast_type=node.type,
                        name=name,
                    ))
                else:
                    # Split large chunks - first try to extract children
                    child_chunks = []
                    for child in node.children:
                        self._extract_chunks(child, source, child_chunks, min_lines, max_lines)

                    if child_chunks:
                        chunks.extend(child_chunks)
                    else:
                        # Can't split further, include the whole thing
                        chunks.append(CodeChunk(
                            text=text,
                            start_line=start_line,
                            end_line=end_line,
                            ast_type=node.type,
                            name=name,
                        ))
                return  # Don't recurse into already-extracted nodes

        # Recurse into children
        for child in node.children:
            self._extract_chunks(child, source, chunks, min_lines, max_lines)

    def _extract_name(self, node) -> str:
        """Extract the name of a function/class/etc from its AST node."""
        for child in node.children:
            if child.type in ("identifier", "name", "property_identifier",
                            "type_identifier", "field_identifier"):
                return child.text.decode("utf-8") if isinstance(child.text, bytes) else child.text
        return ""

    def _get_parser(self, language: str):
        """Get or create a tree-sitter parser for a language."""
        if language in self._parsers:
            return self._parsers[language]

        ts_lang = self._try_get_language(language)
        if ts_lang is None:
            return None

        import tree_sitter
        parser = tree_sitter.Parser(ts_lang)
        self._parsers[language] = parser
        return parser

    def _try_get_language(self, language: str):
        """Try to load a tree-sitter language grammar."""
        ts_name = _LANG_TO_TS.get(language)
        if ts_name is None:
            return None

        try:
            import tree_sitter
            mod = __import__(f"tree_sitter_{ts_name}")
            capsule = mod.language()
            # tree-sitter >= 0.23 returns PyCapsule, wrap with Language()
            if not isinstance(capsule, tree_sitter.Language):
                capsule = tree_sitter.Language(capsule)
            return capsule
        except (ImportError, AttributeError, TypeError):
            return None
