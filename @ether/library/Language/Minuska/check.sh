#!/usr/bin/env bash
command -v minuska >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/h0nzZik/minuska"
  [[ -d "$REPO_DIR" ]]
}
