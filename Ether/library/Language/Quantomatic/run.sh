#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/zxcalc/quantomatic"
exec java -jar "$REPO_DIR/gui/dist/quantomatic.jar" "$1"
