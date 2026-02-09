#!/usr/bin/env bash
set -euo pipefail
# min - https://h3rald.com/min/
# https://github.com/h3rald/min
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/h3rald/min"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/h3rald/min.git "$REPO_DIR"
fi
cd "$REPO_DIR"
command -v nim >/dev/null 2>&1 || { echo "Nim required. Install via: curl https://nim-lang.org/choosenim/init.sh -sSf | sh" >&2; exit 1; }
nimble build -y
sudo cp min /usr/local/bin/ 2>/dev/null || cp min "$HOME/.local/bin/"
