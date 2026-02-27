#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/lhartikk/ArnoldC"
ARNOLDC_JAR=$(find "$REPO_DIR" -name "ArnoldC*.jar" 2>/dev/null | head -1)
[[ -n "$ARNOLDC_JAR" ]] && command -v java &>/dev/null
