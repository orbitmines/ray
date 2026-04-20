#!/usr/bin/env bash
command -v linearml >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/pikatchu/LinearML"
  [[ -x "$REPO_DIR/linearml" ]]
}
