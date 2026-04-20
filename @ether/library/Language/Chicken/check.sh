#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/igorto/chicken-js"
[[ -d "$REPO_DIR" ]] && ( command -v node >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1 )
