#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/zxcalc/quizx"
[[ -d "$REPO_DIR" ]] && command -v cargo >/dev/null 2>&1
