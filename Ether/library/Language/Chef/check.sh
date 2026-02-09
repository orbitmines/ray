#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/joostrijneveld/Chef"
[[ -d "$REPO_DIR" ]] && command -v python3 >/dev/null 2>&1
