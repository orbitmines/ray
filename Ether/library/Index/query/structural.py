"""Tree-sitter AST structural comparison (second pass after semantic search).

Extracts language-agnostic structural features and computes similarity.
"""
from __future__ import annotations

import math
from typing import Any

from .results import ComparisonResult


def extract_features(code: str, language: str) -> dict:
    """Extract language-agnostic structural features from code.

    Features:
    - param_count: Number of parameters (for functions)
    - nesting_depth: Maximum nesting depth
    - cyclomatic_complexity: Approximation of cyclomatic complexity
    - control_flow: Set of control flow patterns used
    - line_count: Number of non-empty lines
    - has_recursion: Whether function appears to call itself
    - has_loop: Whether code contains loops
    - has_conditional: Whether code contains conditionals
    """
    features: dict[str, Any] = {
        "line_count": len([l for l in code.split("\n") if l.strip()]),
        "param_count": 0,
        "nesting_depth": 0,
        "cyclomatic_complexity": 1,
        "control_flow": [],
        "has_loop": False,
        "has_conditional": False,
        "has_recursion": False,
    }

    try:
        from ..indexing.tree_sitter_chunker import TreeSitterChunker, _LANG_TO_TS
        chunker = TreeSitterChunker()
        if not chunker.supports(language):
            return _extract_features_heuristic(code, features)

        import tree_sitter
        ts_name = _LANG_TO_TS.get(language)
        if ts_name is None:
            return _extract_features_heuristic(code, features)

        mod = __import__(f"tree_sitter_{ts_name}")
        lang = mod.language()
        parser = tree_sitter.Parser(lang)
        tree = parser.parse(code.encode("utf-8"))

        _analyze_node(tree.root_node, features, 0)
    except (ImportError, Exception):
        return _extract_features_heuristic(code, features)

    return features


def compare(code_a: str, lang_a: str, code_b: str, lang_b: str) -> ComparisonResult:
    """Compare two code fragments structurally.

    Args:
        code_a: First code fragment.
        lang_a: Language of first fragment.
        code_b: Second code fragment.
        lang_b: Language of second fragment.

    Returns:
        ComparisonResult with similarity score and feature breakdown.
    """
    features_a = extract_features(code_a, lang_a)
    features_b = extract_features(code_b, lang_b)

    similarity = _compute_similarity(features_a, features_b)

    return ComparisonResult(
        similarity=similarity,
        features_a=features_a,
        features_b=features_b,
        details={
            "param_match": features_a["param_count"] == features_b["param_count"],
            "depth_diff": abs(features_a["nesting_depth"] - features_b["nesting_depth"]),
            "complexity_diff": abs(features_a["cyclomatic_complexity"] - features_b["cyclomatic_complexity"]),
            "control_flow_overlap": len(
                set(features_a["control_flow"]) & set(features_b["control_flow"])
            ),
        },
    )


def _analyze_node(node, features: dict, depth: int):
    """Recursively analyze AST nodes to extract features."""
    features["nesting_depth"] = max(features["nesting_depth"], depth)

    node_type = node.type

    # Count parameters
    if node_type in ("parameters", "formal_parameters", "parameter_list"):
        features["param_count"] = max(features["param_count"], len([
            c for c in node.children
            if c.type not in ("(", ")", ",", "comment")
        ]))

    # Track control flow
    if node_type in ("if_statement", "if_expression", "conditional_expression"):
        features["has_conditional"] = True
        features["cyclomatic_complexity"] += 1
        if "if" not in features["control_flow"]:
            features["control_flow"].append("if")

    elif node_type in ("for_statement", "for_expression", "for_in_statement"):
        features["has_loop"] = True
        features["cyclomatic_complexity"] += 1
        if "for" not in features["control_flow"]:
            features["control_flow"].append("for")

    elif node_type in ("while_statement", "while_expression"):
        features["has_loop"] = True
        features["cyclomatic_complexity"] += 1
        if "while" not in features["control_flow"]:
            features["control_flow"].append("while")

    elif node_type in ("match_statement", "match_expression", "switch_statement"):
        features["cyclomatic_complexity"] += 1
        if "match" not in features["control_flow"]:
            features["control_flow"].append("match")

    elif node_type in ("try_statement", "try_expression"):
        if "try" not in features["control_flow"]:
            features["control_flow"].append("try")

    elif node_type in ("return_statement",):
        if "return" not in features["control_flow"]:
            features["control_flow"].append("return")

    elif node_type in ("yield_expression", "yield_statement"):
        if "yield" not in features["control_flow"]:
            features["control_flow"].append("yield")

    # Detect nesting for block-like nodes
    is_block = node_type in (
        "block", "statement_block", "compound_statement", "body",
        "function_body", "class_body", "do_block",
    )

    for child in node.children:
        _analyze_node(child, features, depth + (1 if is_block else 0))


def _extract_features_heuristic(code: str, features: dict) -> dict:
    """Heuristic feature extraction when tree-sitter is unavailable."""
    lines = code.split("\n")
    for line in lines:
        stripped = line.strip()
        if any(kw in stripped for kw in ("if ", "if(", "elif ", "else if")):
            features["has_conditional"] = True
            features["cyclomatic_complexity"] += 1
        if any(kw in stripped for kw in ("for ", "for(", "while ", "while(", "loop ")):
            features["has_loop"] = True
            features["cyclomatic_complexity"] += 1
    return features


def _compute_similarity(a: dict, b: dict) -> float:
    """Compute structural similarity score between 0 and 1."""
    scores = []

    # Parameter count similarity
    if a["param_count"] == b["param_count"]:
        scores.append(1.0)
    else:
        diff = abs(a["param_count"] - b["param_count"])
        scores.append(max(0, 1.0 - diff * 0.2))

    # Nesting depth similarity
    depth_diff = abs(a["nesting_depth"] - b["nesting_depth"])
    scores.append(max(0, 1.0 - depth_diff * 0.15))

    # Cyclomatic complexity similarity
    max_cc = max(a["cyclomatic_complexity"], b["cyclomatic_complexity"], 1)
    min_cc = min(a["cyclomatic_complexity"], b["cyclomatic_complexity"], 1)
    scores.append(min_cc / max_cc)

    # Control flow overlap (Jaccard similarity)
    set_a = set(a.get("control_flow", []))
    set_b = set(b.get("control_flow", []))
    if set_a or set_b:
        scores.append(len(set_a & set_b) / len(set_a | set_b))
    else:
        scores.append(1.0)

    # Line count similarity
    max_lines = max(a["line_count"], b["line_count"], 1)
    min_lines = min(a["line_count"], b["line_count"], 1)
    scores.append(min_lines / max_lines)

    # Boolean feature matches
    bool_features = ["has_loop", "has_conditional", "has_recursion"]
    matches = sum(1 for f in bool_features if a.get(f) == b.get(f))
    scores.append(matches / len(bool_features))

    return sum(scores) / len(scores)
