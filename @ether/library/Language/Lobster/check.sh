#!/usr/bin/env bash
command -v lobster >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/aardappel/lobster"
  [[ -x "$REPO_DIR/dev/lobster" ]]
}
