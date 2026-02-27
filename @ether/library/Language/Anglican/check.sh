#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/probprog/anglican"
[[ -d "$REPO_DIR" ]] && command -v lein &>/dev/null
