#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/golang/go"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/golang/go.git "$REPO_DIR"
  fi
  cd "$REPO_DIR/src" && ./all.bash
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install go
else
  # Official method: download tarball from go.dev (https://go.dev/doc/install)
  GOVERSION=$(curl -sSL 'https://go.dev/VERSION?m=text' | head -1)
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64)  GOARCH="amd64" ;;
    aarch64) GOARCH="arm64" ;;
    armv*)   GOARCH="armv6l" ;;
    *)       GOARCH="amd64" ;;
  esac
  curl -fsSL "https://go.dev/dl/${GOVERSION}.linux-${GOARCH}.tar.gz" -o /tmp/go.tar.gz
  sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf /tmp/go.tar.gz
  rm -f /tmp/go.tar.gz
  # Add to PATH if not already there
  if ! grep -q '/usr/local/go/bin' "$HOME/.profile" 2>/dev/null; then
    echo 'export PATH=$PATH:/usr/local/go/bin' >> "$HOME/.profile"
  fi
  export PATH=$PATH:/usr/local/go/bin
fi
