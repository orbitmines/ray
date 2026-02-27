#!/usr/bin/env bash
set -euo pipefail
python3 -c "import venture" 2>/dev/null || command -v venture >/dev/null 2>&1
