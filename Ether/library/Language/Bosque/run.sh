#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/microsoft/BosqueLanguage"
exec node "$REPO_DIR/ref_impl/src/runtimes/exegen/exegen.js" "$1"
