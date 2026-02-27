#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/stripe/rainier"
[[ -d "$REPO_DIR" ]] && command -v sbt >/dev/null 2>&1
