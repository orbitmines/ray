#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/sarsko/CreuSAT"
if [[ -f "$REPO_DIR/target/release/CreuSAT" ]]; then
  exec "$REPO_DIR/target/release/CreuSAT" "$1"
else
  exec "$REPO_DIR/target/release/creusat" "$1"
fi
