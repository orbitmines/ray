#!/usr/bin/env bash
set -euo pipefail
command -v wy >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/Whiley/WhileyCompiler"
  [[ -x "$REPO_DIR/bin/wy" ]]
}
