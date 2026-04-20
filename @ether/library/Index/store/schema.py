"""LanceDB table schema definition for code chunks."""
from __future__ import annotations

import pyarrow as pa

from ..config import EMBEDDING_DIM

# Schema for the code chunks table
CHUNKS_SCHEMA = pa.schema([
    pa.field("chunk_id", pa.string()),
    pa.field("language", pa.string()),
    pa.field("version", pa.string()),
    pa.field("file_path", pa.string()),
    pa.field("repo", pa.string()),
    pa.field("start_line", pa.int32()),
    pa.field("end_line", pa.int32()),
    pa.field("ast_type", pa.string()),
    pa.field("name", pa.string()),
    pa.field("text", pa.string()),
    pa.field("vector", pa.list_(pa.float32(), EMBEDDING_DIM)),
])

TABLE_NAME = "code_chunks"
