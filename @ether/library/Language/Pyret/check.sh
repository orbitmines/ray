#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/brownplt/pyret-lang"
[[ -d "$REPO_DIR" ]] && command -v node >/dev/null 2>&1
