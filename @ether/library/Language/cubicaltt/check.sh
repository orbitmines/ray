#!/usr/bin/env bash
set -euo pipefail
command -v cubical >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/mortberg/cubicaltt"
  [[ -d "$REPO_DIR" ]]
}
