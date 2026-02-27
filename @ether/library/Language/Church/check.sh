#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/probmods/webchurch"
[[ -d "$REPO_DIR/node_modules" ]] && command -v node >/dev/null 2>&1
