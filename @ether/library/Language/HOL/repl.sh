#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/HOL-Theorem-Prover/HOL"
if command -v hol >/dev/null 2>&1; then
  exec hol
else
  exec "$REPO_DIR/bin/hol"
fi
