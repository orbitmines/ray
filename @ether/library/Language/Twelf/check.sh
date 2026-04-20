#!/usr/bin/env bash
command -v twelf-server >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/standardml/twelf"
  [[ -x "$REPO_DIR/bin/twelf-server" ]]
}
