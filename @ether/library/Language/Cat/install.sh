#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/cdiggins/cat-language"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/cdiggins/cat-language.git "$REPO_DIR"
fi
echo "Cat language cloned to $REPO_DIR. It requires .NET to build."
if command -v dotnet >/dev/null 2>&1; then
  cd "$REPO_DIR"
  dotnet build || true
fi
