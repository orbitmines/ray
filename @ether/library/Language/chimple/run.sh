#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/analog-garage/chimple"
cd "$REPO_DIR"
java -cp "build/libs/*" "$1"
