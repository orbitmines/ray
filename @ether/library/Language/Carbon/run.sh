#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/carbon-language/carbon-lang"
cd "$REPO_DIR"
bazel run //explorer -- "$1"
