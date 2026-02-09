#!/usr/bin/env bash
set -euo pipefail
python3 -c "import avro" 2>/dev/null || command -v avro-tools >/dev/null 2>&1
