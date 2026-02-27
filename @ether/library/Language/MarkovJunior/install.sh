#!/usr/bin/env bash
set -euo pipefail
# MarkovJunior - https://github.com/mxgmn/MarkovJunior
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/mxgmn/MarkovJunior"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/mxgmn/MarkovJunior.git "$REPO_DIR"
fi
cd "$REPO_DIR"
command -v dotnet >/dev/null 2>&1 || { echo ".NET SDK required." >&2; exit 1; }
dotnet build -c Release
