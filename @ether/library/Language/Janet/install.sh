#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Janet from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/janet-lang/janet"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/janet-lang/janet.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && make -j"$(nproc)" && sudo make install
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install janet
elif command -v apt-get >/dev/null 2>&1; then
  # Install from GitHub releases (https://janet-lang.org/docs/index.html)
  VERSION=$(curl -sSL https://api.github.com/repos/janet-lang/janet/releases/latest | grep '"tag_name"' | sed 's/.*"v\(.*\)".*/\1/')
  curl -fsSL "https://github.com/janet-lang/janet/releases/download/v${VERSION}/janet-v${VERSION}-linux-x64.tar.gz" -o /tmp/janet.tar.gz
  sudo tar -xzf /tmp/janet.tar.gz -C /usr/local --strip-components=1
  rm -f /tmp/janet.tar.gz
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y janet
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm janet
else
  echo "Unsupported package manager. Use --from-source." >&2; exit 1
fi
