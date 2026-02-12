#!/usr/bin/env bash
command -v terra >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/terralang/terra"
  [[ -x "$REPO_DIR/build/bin/terra" ]]
}
