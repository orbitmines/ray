#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/brownplt/pyret-lang"
exec node "$REPO_DIR/build/phaseA/pyret.jarr" --run "$1"
