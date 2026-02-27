#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/nbuwe/pclu"
exec "$REPO_DIR/bin/pclu" "$1"
