#!/usr/bin/env bash
set -euo pipefail
# Install Factor - https://factorcode.org/ https://github.com/factor/factor
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/factor/factor"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/factor/factor.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && make && ./build.sh update
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install factor
elif command -v apt-get >/dev/null 2>&1; then
  # Download official binary release
  ARCH=$(uname -m)
  if [[ "$ARCH" == "x86_64" ]]; then
    curl -fsSL "https://downloads.factorcode.org/releases/0.99/factor-linux-x86-64-0.99.tar.gz" -o /tmp/factor.tar.gz
    sudo mkdir -p /opt/factor && sudo tar -C /opt/factor --strip-components=1 -xzf /tmp/factor.tar.gz
    rm -f /tmp/factor.tar.gz
    sudo ln -sf /opt/factor/factor /usr/local/bin/factor-lang
  else
    echo "Build from source for non-x86_64: FROM_SOURCE=true" >&2; exit 1
  fi
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm factor-lang
else
  echo "Unsupported package manager. Use FROM_SOURCE=true." >&2; exit 1
fi
