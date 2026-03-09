#!/usr/bin/env bash
set -euo pipefail
if command -v leo >/dev/null 2>&1; then
  exec leo "$1"
else
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/leoprover/Leo-III"
  JAR=$(ls "$REPO_DIR"/target/scala-*/Leo-III-assembly-*.jar 2>/dev/null | head -1)
  exec java -jar "$JAR" "$1"
fi
