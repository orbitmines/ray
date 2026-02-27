#!/usr/bin/env bash
command -v magmide >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/magmide/magmide"
  [[ -x "$REPO_DIR/target/release/magmide" ]]
}
