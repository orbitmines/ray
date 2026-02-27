#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/thephoeron/quipper-language"
[[ -d "$REPO_DIR" ]] && command -v ghc >/dev/null 2>&1
