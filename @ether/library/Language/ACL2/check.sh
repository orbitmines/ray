#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/acl2/acl2"
[[ -x "$REPO_DIR/saved_acl2" ]] || command -v acl2 &>/dev/null
