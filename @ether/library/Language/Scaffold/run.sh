#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/epiqc/ScaffCC"
exec "$REPO_DIR/scaffold.sh" "$1"
