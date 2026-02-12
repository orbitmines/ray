#!/usr/bin/env bash
command -v luau >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/luau-lang/luau"
  [[ -x "$REPO_DIR/build/luau" ]]
}
