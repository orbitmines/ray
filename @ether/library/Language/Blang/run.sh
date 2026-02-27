#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/UBC-Stat-ML/blangSDK"
cd "$REPO_DIR" && exec ./gradlew run --args="$1"
