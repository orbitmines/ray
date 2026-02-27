#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/BayesianLogic/blog"
if [[ -x "$REPO_DIR/dblog" ]]; then
  exec "$REPO_DIR/dblog" "$1"
elif [[ -x "$REPO_DIR/blog" ]]; then
  exec "$REPO_DIR/blog" "$1"
else
  echo "BLOG interpreter not found. Run install.sh first." >&2; exit 1
fi
