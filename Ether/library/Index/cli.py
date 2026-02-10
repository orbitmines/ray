"""CLI entry point for ./ether Language ... commands.

Usage:
  python -m Ether.library.Index.cli Language.Python index
  python -m Ether.library.Index.cli Language search "binary search tree"
  python -m Ether.library.Index.cli Language server
  python -m Ether.library.Index.cli Language stats
  python -m Ether.library.Index.cli Language models
"""
from __future__ import annotations

import argparse
import json
import sys


def main(argv: list[str] | None = None):
    args = argv or sys.argv[1:]

    if not args:
        _print_usage()
        sys.exit(1)

    command = args[0]
    rest = args[1:]

    if command == "index":
        _cmd_index(rest)
    elif command == "search":
        _cmd_search(rest)
    elif command == "server":
        _cmd_server(rest)
    elif command == "stats":
        _cmd_stats(rest)
    elif command == "models":
        _cmd_models(rest)
    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        _print_usage()
        sys.exit(1)


def _print_usage():
    print("Usage: ether Language <command> [options]")
    print()
    print("Commands:")
    print("  index [--lang NAME] [--version VER] [--full]   Index source code")
    print("  search <query> [--lang NAME] [--limit N]       Search code")
    print("  search --file PATH --cross-lang                Find equivalents")
    print("  server [--port PORT]                           Start API server")
    print("  stats                                          Show index statistics")
    print("  models [--use NAME --for TASK]                 List/switch models")


def _cmd_index(args: list[str]):
    parser = argparse.ArgumentParser(prog="ether Language index")
    parser.add_argument("--lang", help="Language to index (default: all)")
    parser.add_argument("--version", help="Version override")
    parser.add_argument("--full", action="store_true", help="Full reindex (not incremental)")
    parser.add_argument("--max-files", type=int, default=0, help="Max files to index (0=all)")
    opts = parser.parse_args(args)

    from .config import ensure_dirs
    from .models import ModelRegistry
    from .models.embedder import CodeEmbedder
    from .store.vector_store import VectorStore
    from .indexing.registry import LanguageRegistry
    from .indexing.chunker import Chunker
    from .indexing.pipeline import IndexingPipeline

    ensure_dirs()
    registry = LanguageRegistry()
    registry.load()

    model_registry = ModelRegistry()
    try:
        index_model = model_registry.get_indexing_model()
    except Exception as e:
        print(f"Error loading model: {e}", file=sys.stderr)
        print("Download model weights first. See README for instructions.", file=sys.stderr)
        sys.exit(1)

    embedder = CodeEmbedder(index_model)
    store = VectorStore()
    pipeline = IndexingPipeline(
        registry=registry, embedder=embedder, store=store, chunker=Chunker(),
    )

    def progress(phase, cur, tot):
        if tot > 0:
            print(f"\r  {phase}: {cur}/{tot}", end="", flush=True)
        else:
            print(f"\r  {phase}...", end="", flush=True)

    if opts.lang:
        print(f"Indexing {opts.lang}...")
        result = pipeline.index_language(
            opts.lang, version=opts.version,
            incremental=not opts.full, max_files=opts.max_files,
            progress_callback=progress,
        )
        print()
        print(f"  Files: {result.get('files', 0)}")
        print(f"  Chunks: {result.get('chunks', 0)}")
        if result.get("version"):
            print(f"  Version: {result['version']}")
    else:
        print("Indexing all languages...")
        def lang_progress(lang, phase, cur, tot):
            if tot > 0:
                print(f"\r  [{lang}] {phase}: {cur}/{tot}", end="", flush=True)

        results = pipeline.index_all(incremental=not opts.full, progress_callback=lang_progress)
        print()
        total_files = sum(r.get("files", 0) for r in results)
        total_chunks = sum(r.get("chunks", 0) for r in results)
        indexed = [r for r in results if r.get("chunks", 0) > 0]
        print(f"  Languages indexed: {len(indexed)}")
        print(f"  Total files: {total_files}")
        print(f"  Total chunks: {total_chunks}")


def _cmd_search(args: list[str]):
    parser = argparse.ArgumentParser(prog="ether Language search")
    parser.add_argument("query", nargs="?", help="Search query")
    parser.add_argument("--lang", help="Filter to language")
    parser.add_argument("--version", help="Filter to version")
    parser.add_argument("--limit", type=int, default=20, help="Max results")
    parser.add_argument("--file", help="File to find equivalents for")
    parser.add_argument("--cross-lang", action="store_true", help="Cross-language search")
    parser.add_argument("--rerank", action="store_true", help="Rerank results with larger model")
    opts = parser.parse_args(args)

    if not opts.query and not opts.file:
        print("Error: provide a query or --file", file=sys.stderr)
        sys.exit(1)

    from .models import ModelRegistry
    from .store.vector_store import VectorStore
    from .query.semantic import SemanticSearch
    from .query.cross_lang import CrossLanguageFinder

    model_registry = ModelRegistry()
    try:
        index_model = model_registry.get_indexing_model()
    except Exception as e:
        print(f"Error loading model: {e}", file=sys.stderr)
        sys.exit(1)

    store = VectorStore()

    if opts.file:
        # Cross-language equivalence search
        from pathlib import Path
        code = Path(opts.file).read_text()
        # Try to detect language from extension
        ext = Path(opts.file).suffix
        from .indexing.registry import LanguageRegistry
        reg = LanguageRegistry()
        reg.load()
        ext_map = reg.build_extension_map()
        source_lang = ext_map.get(ext, ["Unknown"])[0] if ext in ext_map else "Unknown"
        if opts.lang:
            source_lang = opts.lang

        rerank_model = None
        try:
            rerank_model = model_registry.get_reranking_model()
        except Exception:
            pass

        finder = CrossLanguageFinder(index_model, store, rerank_model)
        result = finder.find_equivalents(
            code=code, source_language=source_lang,
            limit=opts.limit, rerank=rerank_model is not None,
        )
        print(f"Equivalents for {source_lang} code ({len(result.equivalents)} found):")
        for r in result.equivalents:
            print(f"  {r.summary()}")
    else:
        if opts.rerank:
            # Load reranking model and use CrossLanguageFinder
            rerank_model = None
            try:
                print("Loading reranking model...", flush=True)
                rerank_model = model_registry.get_reranking_model()
            except Exception as e:
                print(f"Warning: Could not load reranking model: {e}", file=sys.stderr)
                print("Falling back to standard search.", file=sys.stderr)

            if rerank_model and rerank_model is not index_model:
                finder = CrossLanguageFinder(index_model, store, rerank_model)
                result = finder.find_equivalents(
                    code=opts.query, source_language="__query__",
                    limit=opts.limit, rerank=True, structural=False,
                    target_languages=[opts.lang] if opts.lang else None,
                )
                results = result.equivalents
            else:
                search = SemanticSearch(index_model, store)
                results = search.search(
                    query=opts.query, limit=opts.limit,
                    language=opts.lang, version=opts.version,
                )
        else:
            search = SemanticSearch(index_model, store)
            results = search.search(
                query=opts.query, limit=opts.limit,
                language=opts.lang, version=opts.version,
            )
        print(f"Results ({len(results)} found):")
        for r in results:
            print(f"  {r.summary()}")
            if len(r.text) > 200:
                print(f"    {r.text[:200]}...")
            else:
                print(f"    {r.text}")
            print()


def _cmd_server(args: list[str]):
    parser = argparse.ArgumentParser(prog="ether Language server")
    parser.add_argument("--port", type=int, default=8420, help="Port (default: 8420)")
    parser.add_argument("--host", default="0.0.0.0", help="Host (default: 0.0.0.0)")
    opts = parser.parse_args(args)

    print(f"Starting Ether Code Index API on {opts.host}:{opts.port}")
    from .api.server import run
    run(host=opts.host, port=opts.port)


def _cmd_stats(args: list[str]):
    from .store.vector_store import VectorStore
    store = VectorStore()
    stats = store.stats()
    print("Index Statistics:")
    print(f"  Total chunks: {stats.get('total_chunks', 0):,}")
    print(f"  Languages: {stats.get('languages', 0)}")
    print(f"  Repos: {stats.get('repos', 0)}")

    if stats.get("total_chunks", 0) > 0:
        print()
        print("Per-language:")
        for entry in store.languages():
            print(f"  {entry['language']}: {entry['count']:,} chunks")


def _cmd_models(args: list[str]):
    parser = argparse.ArgumentParser(prog="ether Language models")
    parser.add_argument("--use", help="Model name to switch to")
    parser.add_argument("--for", dest="task", choices=["index", "rerank"], help="Task to assign model to")
    opts = parser.parse_args(args)

    from .models import ModelRegistry
    mr = ModelRegistry()

    if opts.use and opts.task:
        task_name = "indexing" if opts.task == "index" else "reranking"
        try:
            mr.select(opts.use, task_name)
            print(f"Switched {task_name} model to: {opts.use}")
        except (KeyError, ValueError) as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    elif opts.use or opts.task:
        print("Error: --use and --for must both be specified", file=sys.stderr)
        sys.exit(1)
    else:
        config = mr.config
        print("Models:")
        print(f"  Indexing: {config.get('indexing', 'none')}")
        print(f"  Reranking: {config.get('reranking', 'none')}")
        print()
        print("Available models:")
        for name, info in config.get("models", {}).items():
            marker = ""
            if name == config.get("indexing"):
                marker += " [indexing]"
            if name == config.get("reranking"):
                marker += " [reranking]"
            print(f"  {name} ({info.get('size', '?')}){marker}")


if __name__ == "__main__":
    main()
