#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/ReactiveX/RxJava"
[[ -d "$REPO_DIR" ]] && command -v java >/dev/null 2>&1
