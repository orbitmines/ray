#!/usr/bin/env bash
set -euo pipefail
# Install Elvish - https://elv.sh/ https://github.com/elves/elvish
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/elves/elvish"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/elves/elvish.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && go build -o elvish ./cmd/elvish && sudo mv elvish /usr/local/bin/
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install elvish
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y elvish
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y elvish
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm elvish
else
  echo "Unsupported package manager. Use FROM_SOURCE=true." >&2; exit 1
fi
