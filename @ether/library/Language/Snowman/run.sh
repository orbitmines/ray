#!/usr/bin/env bash
set -euo pipefail
if command -v snowman >/dev/null 2>&1; then
  exec snowman "$@"
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/KeyboardFire/snowman-lang"
  exec "$REPO_DIR/snowman" "$@"
fi
