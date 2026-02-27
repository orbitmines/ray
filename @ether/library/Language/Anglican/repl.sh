#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/probprog/anglican"
cd "$REPO_DIR"
exec lein repl
