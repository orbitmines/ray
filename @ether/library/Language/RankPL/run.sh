#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/tjitze/RankPL"
exec java -jar "$REPO_DIR/target/RankPL.jar" "$1"
