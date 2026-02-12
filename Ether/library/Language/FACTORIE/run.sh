#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/factorie/factorie"
exec scala -cp "$REPO_DIR/target/classes:$REPO_DIR/target/dependency/*" "$1"
