#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/zxcalc/quizx"
cd "$REPO_DIR"
exec cargo run --release -- "$1"
