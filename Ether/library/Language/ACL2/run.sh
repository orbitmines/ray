#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/acl2/acl2"
if [[ -x "$REPO_DIR/saved_acl2" ]]; then
  exec "$REPO_DIR/saved_acl2" < "$1"
else
  exec acl2 < "$1"
fi
