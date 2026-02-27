#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/JonathanGorard/Categorica"
[[ -d "$REPO_DIR" ]] && command -v wolframscript >/dev/null 2>&1
