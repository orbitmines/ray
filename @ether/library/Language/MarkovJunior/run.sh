#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/mxgmn/MarkovJunior"
cp "$1" "$REPO_DIR/resources/" 2>/dev/null || true
cd "$REPO_DIR" && dotnet run -c Release
