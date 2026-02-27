#!/usr/bin/env bash
set -euo pipefail
if command -v twelf-server >/dev/null 2>&1; then
  exec twelf-server "$@"
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/standardml/twelf"
  exec "$REPO_DIR/bin/twelf-server" "$@"
fi
