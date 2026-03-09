#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/arclanguage/anarern"
[[ -f "$REPO_DIR/as.scm" ]] && command -v racket &>/dev/null
