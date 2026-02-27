#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/analog-garage/dimple"
exec java -cp "$REPO_DIR/build/libs/*" com.analog.lyric.dimple.DimpleMain "$1"
