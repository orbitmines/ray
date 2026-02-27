#!/usr/bin/env bash
set -euo pipefail
command -v nqthm >/dev/null 2>&1 || {
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/John-Nagle/nqthm"
  [[ -d "$REPO_DIR" ]]
}
