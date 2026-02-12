#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/mrakgr/The-Spiral-Language"
exec dotnet run --project "$REPO_DIR" -- "$@"
