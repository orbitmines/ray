"""FastAPI endpoint handlers."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# --- Request/Response Models ---

class SearchRequest(BaseModel):
    query: str
    language: Optional[str] = None
    version: Optional[str] = None
    ast_type: Optional[str] = None
    repo: Optional[str] = None
    limit: int = 20

class FindEquivalentsRequest(BaseModel):
    code: str
    source_language: str
    limit: int = 20
    rerank: bool = True
    structural: bool = True
    target_languages: Optional[list[str]] = None

class CompareRequest(BaseModel):
    code_a: str
    language_a: str
    code_b: str
    language_b: str

class IndexRequest(BaseModel):
    languages: Optional[list[str]] = None
    incremental: bool = True

class ModelSelectRequest(BaseModel):
    model: str
    task: str  # "indexing" or "reranking"


# --- Lazy-loaded shared state ---

_state = {}

def _get_state():
    """Lazy-initialize shared components."""
    if "initialized" in _state:
        return _state

    from ..config import load_models_config
    from ..models import ModelRegistry
    from ..store.vector_store import VectorStore
    from ..indexing.registry import LanguageRegistry
    from ..indexing.chunker import Chunker
    from ..models.embedder import CodeEmbedder
    from ..indexing.pipeline import IndexingPipeline
    from ..query.semantic import SemanticSearch
    from ..query.cross_lang import CrossLanguageFinder

    registry = LanguageRegistry()
    registry.load()

    model_registry = ModelRegistry()
    store = VectorStore()

    _state["registry"] = registry
    _state["model_registry"] = model_registry
    _state["store"] = store

    # Try to load models - may fail if weights not downloaded
    try:
        index_model = model_registry.get_indexing_model()
        _state["search"] = SemanticSearch(index_model, store)
        _state["embedder"] = CodeEmbedder(index_model)

        rerank_model = None
        try:
            rerank_model = model_registry.get_reranking_model()
        except Exception:
            pass
        _state["cross_lang"] = CrossLanguageFinder(index_model, store, rerank_model)

        _state["pipeline"] = IndexingPipeline(
            registry=registry,
            embedder=CodeEmbedder(index_model),
            store=store,
            chunker=Chunker(),
        )
    except Exception as e:
        _state["model_error"] = str(e)

    _state["initialized"] = True
    return _state


# --- Endpoints ---

@router.get("/health")
async def health():
    return {"status": "ok"}


@router.post("/search")
async def search(req: SearchRequest):
    state = _get_state()
    if "search" not in state:
        raise HTTPException(503, detail=f"Models not loaded: {state.get('model_error', 'unknown')}")

    results = state["search"].search(
        query=req.query,
        limit=req.limit,
        language=req.language,
        version=req.version,
        ast_type=req.ast_type,
        repo=req.repo,
    )
    return {"results": [r.to_dict() for r in results]}


@router.post("/find-equivalents")
async def find_equivalents(req: FindEquivalentsRequest):
    state = _get_state()
    if "cross_lang" not in state:
        raise HTTPException(503, detail=f"Models not loaded: {state.get('model_error', 'unknown')}")

    result = state["cross_lang"].find_equivalents(
        code=req.code,
        source_language=req.source_language,
        limit=req.limit,
        rerank=req.rerank,
        structural=req.structural,
        target_languages=req.target_languages,
    )
    return result.to_dict()


@router.post("/compare")
async def compare_code(req: CompareRequest):
    from ..query.structural import compare
    result = compare(req.code_a, req.language_a, req.code_b, req.language_b)
    return result.to_dict()


@router.get("/languages")
async def list_languages():
    state = _get_state()
    return {"languages": state["store"].languages()}


@router.post("/index")
async def trigger_index(req: IndexRequest):
    state = _get_state()
    if "pipeline" not in state:
        raise HTTPException(503, detail=f"Models not loaded: {state.get('model_error', 'unknown')}")

    results = state["pipeline"].index_all(
        incremental=req.incremental,
        languages=req.languages,
    )
    return {"results": results}


@router.get("/models")
async def list_models():
    state = _get_state()
    mr = state["model_registry"]
    return {
        "indexing": mr.indexing_model_name,
        "reranking": mr.reranking_model_name,
        "models": mr.list_models(),
    }


@router.post("/models/select")
async def select_model(req: ModelSelectRequest):
    state = _get_state()
    try:
        state["model_registry"].select(req.model, req.task)
    except (KeyError, ValueError) as e:
        raise HTTPException(400, detail=str(e))
    return {"status": "ok", "task": req.task, "model": req.model}


@router.get("/stats")
async def stats():
    state = _get_state()
    return state["store"].stats()
