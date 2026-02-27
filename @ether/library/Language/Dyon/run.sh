#!/usr/bin/env bash
set -euo pipefail
if command -v dyon_interactive >/dev/null 2>&1; then
  exec dyon_interactive "$1"
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/PistonDevelopers/dyon"
  exec "$REPO_DIR/target/release/dyon_interactive" "$1"
fi
