#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/lhartikk/ArnoldC"
ARNOLDC_JAR=$(find "$REPO_DIR" -name "ArnoldC*.jar" 2>/dev/null | head -1)
if [[ -n "$ARNOLDC_JAR" ]]; then
  exec java -jar "$ARNOLDC_JAR" "$1"
else
  echo "ArnoldC jar not found. Run install.sh first." >&2; exit 1
fi
