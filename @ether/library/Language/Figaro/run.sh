#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/charles-river-analytics/figaro"
cd "$REPO_DIR" && sbt "runMain $1"
