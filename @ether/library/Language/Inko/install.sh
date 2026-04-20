#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Inko from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/inko-lang/inko"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/inko-lang/inko.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cargo build --release && cp target/release/inko "$HOME/.local/bin/"
  exit 0
fi
# Official install via ivm or cargo (https://inko-lang.org/install/)
if [[ "$(uname)" == "Darwin" ]]; then
  brew install inko
elif command -v cargo >/dev/null 2>&1; then
  cargo install inko
elif command -v apt-get >/dev/null 2>&1; then
  # Use prebuilt from GitHub releases
  VERSION=$(curl -sSL https://api.github.com/repos/inko-lang/inko/releases/latest | grep '"tag_name"' | sed 's/.*"v\(.*\)".*/\1/')
  curl -fsSL "https://github.com/inko-lang/inko/releases/download/v${VERSION}/inko-${VERSION}-linux-amd64.tar.gz" -o /tmp/inko.tar.gz
  sudo tar -xzf /tmp/inko.tar.gz -C /usr/local/bin/
  rm -f /tmp/inko.tar.gz
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm inko
else
  echo "Unsupported package manager. Install Rust/Cargo and use: cargo install inko" >&2; exit 1
fi
