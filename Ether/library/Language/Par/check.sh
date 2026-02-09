#!/usr/bin/env bash
set -euo pipefail
command -v par >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/faiface/par-lang"
  [[ -x "$REPO_DIR/target/release/par" ]]
}
