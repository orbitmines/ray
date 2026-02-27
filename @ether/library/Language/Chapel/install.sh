#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install chapel
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y chapel || {
    REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/chapel-lang/chapel"
    if [[ -d "$REPO_DIR/.git" ]]; then
      GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
    else
      mkdir -p "$(dirname "$REPO_DIR")"
      GIT_TERMINAL_PROMPT=0 git clone https://github.com/chapel-lang/chapel.git "$REPO_DIR"
    fi
    cd "$REPO_DIR"
    source util/quickstart/setchplenv.bash
    make -j"$(nproc)"
  }
elif command -v dnf >/dev/null 2>&1; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/chapel-lang/chapel"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/chapel-lang/chapel.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  source util/quickstart/setchplenv.bash
  make -j"$(nproc)"
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm chapel || {
    echo "Chapel not in repos. Build from source." >&2; exit 1
  }
else
  echo "Unsupported platform." >&2; exit 1
fi
