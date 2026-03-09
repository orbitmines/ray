"""Model implementations and registry."""
from .registry import ModelRegistry, register_model_type
from .sentence_transformer import SentenceTransformerModel
from .nomic_bert import NomicBertModel
from .llama_embed import LlamaEmbedModel

# Register built-in model types
register_model_type("sentence_transformer", SentenceTransformerModel)
register_model_type("nomic_bert", NomicBertModel)
register_model_type("llama", LlamaEmbedModel)
