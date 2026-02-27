#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/Wikipedia/brainloller"
exec python3 "$REPO_DIR/brainloller.py" "$1"
