#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Gleam from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/gleam-lang/gleam"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/gleam-lang/gleam.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cargo build --release && cp target/release/gleam "$HOME/.local/bin/"
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install gleam
elif command -v apt-get >/dev/null 2>&1; then
  # Official: install via prebuilt binaries from GitHub releases
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64)  GLEAM_ARCH="x86_64-unknown-linux-musl" ;;
    aarch64) GLEAM_ARCH="aarch64-unknown-linux-musl" ;;
    *)       echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
  esac
  VERSION=$(curl -sSL https://api.github.com/repos/gleam-lang/gleam/releases/latest | grep '"tag_name"' | sed 's/.*"v\(.*\)".*/\1/')
  curl -fsSL "https://github.com/gleam-lang/gleam/releases/download/v${VERSION}/gleam-v${VERSION}-${GLEAM_ARCH}.tar.gz" -o /tmp/gleam.tar.gz
  sudo tar -xzf /tmp/gleam.tar.gz -C /usr/local/bin/
  rm -f /tmp/gleam.tar.gz
elif command -v dnf >/dev/null 2>&1; then
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64)  GLEAM_ARCH="x86_64-unknown-linux-musl" ;;
    aarch64) GLEAM_ARCH="aarch64-unknown-linux-musl" ;;
    *)       echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
  esac
  VERSION=$(curl -sSL https://api.github.com/repos/gleam-lang/gleam/releases/latest | grep '"tag_name"' | sed 's/.*"v\(.*\)".*/\1/')
  curl -fsSL "https://github.com/gleam-lang/gleam/releases/download/v${VERSION}/gleam-v${VERSION}-${GLEAM_ARCH}.tar.gz" -o /tmp/gleam.tar.gz
  sudo tar -xzf /tmp/gleam.tar.gz -C /usr/local/bin/
  rm -f /tmp/gleam.tar.gz
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm gleam
else
  echo "Unsupported package manager. Use --from-source." >&2; exit 1
fi
