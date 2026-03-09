#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/CogComp/saul"
[[ -d "$REPO_DIR" ]] && command -v sbt >/dev/null 2>&1
