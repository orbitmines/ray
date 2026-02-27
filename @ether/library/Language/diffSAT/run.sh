#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/MatthiasNickworX/diffSAT"
JAR=$(ls "$REPO_DIR"/target/scala-*/diffSAT*.jar 2>/dev/null | head -1)
if [[ -n "${JAR:-}" ]]; then
  exec java -jar "$JAR" "$1"
else
  exec diffSAT "$1"
fi
