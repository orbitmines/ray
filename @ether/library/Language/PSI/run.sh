#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/eth-sri/psi"
exec "$REPO_DIR/psi" "$1"
