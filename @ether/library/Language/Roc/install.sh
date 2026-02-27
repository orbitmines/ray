#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/roc-lang/roc"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/roc-lang/roc.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  cargo build --release
  sudo cp target/release/roc /usr/local/bin/ || cp target/release/roc "$HOME/.local/bin/"
  exit 0
fi
# Official install via nightly release
ARCH=$(uname -m)
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
if [[ "$OS" == "darwin" ]]; then
  curl -fsSL "https://github.com/roc-lang/roc/releases/latest/download/roc-nightly-macos_${ARCH}.tar.gz" | tar xz -C /tmp
else
  curl -fsSL "https://github.com/roc-lang/roc/releases/latest/download/roc-nightly-linux_${ARCH}.tar.gz" | tar xz -C /tmp
fi
sudo cp /tmp/roc_nightly*/roc /usr/local/bin/ || cp /tmp/roc_nightly*/roc "$HOME/.local/bin/"
