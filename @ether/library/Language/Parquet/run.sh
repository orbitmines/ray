#!/usr/bin/env bash
set -euo pipefail
if command -v parquet-tools >/dev/null 2>&1; then
  exec parquet-tools show "$@"
fi
exec python3 -c "import pyarrow.parquet as pq; import sys; print(pq.read_table(sys.argv[1]).to_pandas())" "$@"
