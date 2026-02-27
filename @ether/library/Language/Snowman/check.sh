#!/usr/bin/env bash
command -v snowman >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/KeyboardFire/snowman-lang"
  [[ -x "$REPO_DIR/snowman" ]]
}
