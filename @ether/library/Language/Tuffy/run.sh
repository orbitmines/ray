#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/HazyResearch/tuffy"
exec java -jar "$REPO_DIR/tuffy.jar" "$@"
