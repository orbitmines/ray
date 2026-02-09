#!/usr/bin/env bash
set -euo pipefail
if command -v par >/dev/null 2>&1; then
  exec par "$@"
fi
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/faiface/par-lang"
exec "$REPO_DIR/target/release/par" "$@"
