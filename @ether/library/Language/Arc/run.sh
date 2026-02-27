#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/arclanguage/anarern"
cd "$REPO_DIR"
exec racket -f as.scm -e "(load \"$1\")"
