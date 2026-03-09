#!/usr/bin/env bash
set -euo pipefail
if command -v wy >/dev/null 2>&1; then
  exec wy run "$1"
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/Whiley/WhileyCompiler"
  exec "$REPO_DIR/bin/wy" run "$1"
fi
