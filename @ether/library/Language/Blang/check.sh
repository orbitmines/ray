#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/UBC-Stat-ML/blangSDK"
[[ -d "$REPO_DIR" ]] && command -v java >/dev/null 2>&1
