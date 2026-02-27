"""Paths, constants, and configuration for the Index system."""
import json
from pathlib import Path

# Root of the project (where ./ether lives)
PROJECT_ROOT = Path(__file__).resolve().parents[3]

# Core paths
ETHER_DIR = PROJECT_ROOT / ".ether"
CACHE_DIR = ETHER_DIR / "cache"
INDEX_TSV = CACHE_DIR / "index.tsv"
EXTERNAL_DIR = ETHER_DIR / "external"
LANG_SCRIPTS_DIR = PROJECT_ROOT / "Ether" / "library" / "Language"

# Index storage paths
INDEX_DIR = ETHER_DIR / "index"
VECTORS_DIR = INDEX_DIR / "vectors"
MODELS_DIR = INDEX_DIR / "models"
MODELS_CONFIG = INDEX_DIR / "models.json"
STATE_DIR = INDEX_DIR / "state"
INDEX_STATE_FILE = STATE_DIR / "index_state.json"

# Tinygrad reference models (for LLaMA)
TINYGRAD_DIR = PROJECT_ROOT / ".orbitmines" / "external" / "github.com" / "tinygrad" / "tinygrad"

# Embedding dimensions
EMBEDDING_DIM = 768

# Indexing defaults
DEFAULT_BATCH_SIZE = 256
DEFAULT_CHUNK_MAX_LINES = 100
DEFAULT_CHUNK_MIN_LINES = 5

# API defaults
DEFAULT_API_HOST = "0.0.0.0"
DEFAULT_API_PORT = 8420

# Search defaults
DEFAULT_SEARCH_LIMIT = 20
DEFAULT_RERANK_CANDIDATES = 100

# Default model config
DEFAULT_MODELS_CONFIG = {
    "indexing": "coderank-embed-tinygrad",
    "reranking": "nomic-embed-code-7b",
    "models": {
        "coderank-embed": {
            "type": "sentence_transformer",
            "hf_name": "nomic-ai/CodeRankEmbed",
            "path": "",
            "size": "137M",
            "hidden_size": 768,
            "max_position_embeddings": 8192,
            "query_prefix": "search_query: ",
            "document_prefix": "search_document: ",
        },
        "nomic-embed-code-7b": {
            "type": "sentence_transformer",
            "hf_name": "nomic-ai/nomic-embed-code",
            "path": "",
            "size": "7B",
            "hidden_size": 3584,
            "max_position_embeddings": 8192,
            "query_prefix": "search_query: ",
            "document_prefix": "search_document: ",
            "pooling": "last_token",
        },
        "coderank-embed-tinygrad": {
            "type": "nomic_bert",
            "path": str(MODELS_DIR / "CodeRankEmbed"),
            "size": "137M",
            "hidden_size": 768,
            "intermediate_size": 3072,
            "num_attention_heads": 12,
            "num_hidden_layers": 12,
            "max_position_embeddings": 8192,
            "vocab_size": 30528,
            "rotary_emb_fraction": 1.0,
            "rotary_emb_base": 1000,
            "query_prefix": "search_query: ",
            "document_prefix": "search_document: ",
        },
        "llama-3-8b": {
            "type": "llama",
            "path": "",
            "size": "8B",
        },
    },
}

# File extension to language mapping (populated from index.tsv at runtime)
EXTENSION_MAP: dict[str, list[str]] = {}


def ensure_dirs():
    """Create required directories if they don't exist."""
    for d in [INDEX_DIR, VECTORS_DIR, MODELS_DIR, STATE_DIR]:
        d.mkdir(parents=True, exist_ok=True)


def load_models_config() -> dict:
    """Load model configuration, creating default if needed."""
    ensure_dirs()
    if MODELS_CONFIG.exists():
        with open(MODELS_CONFIG) as f:
            return json.load(f)
    save_models_config(DEFAULT_MODELS_CONFIG)
    return DEFAULT_MODELS_CONFIG.copy()


def save_models_config(config: dict):
    """Save model configuration."""
    ensure_dirs()
    with open(MODELS_CONFIG, "w") as f:
        json.dump(config, f, indent=2)
