#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/cdiggins/cat-language"
cd "$REPO_DIR"
dotnet run -- "$1"
