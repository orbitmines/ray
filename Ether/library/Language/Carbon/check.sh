#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/carbon-language/carbon-lang"
[[ -d "$REPO_DIR" ]] && command -v bazel >/dev/null 2>&1
