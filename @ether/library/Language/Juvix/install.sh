#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Juvix from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/anoma/juvix"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/anoma/juvix.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && stack build && stack install
  exit 0
fi
# Official install (https://docs.juvix.org/latest/howto/installing/)
if [[ "$(uname)" == "Darwin" ]]; then
  brew tap anoma/juvix && brew install juvix
else
  # Install prebuilt from GitHub releases
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64)  JUVIX_ARCH="linux-x86_64" ;;
    aarch64) JUVIX_ARCH="linux-aarch64" ;;
    *)       echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
  esac
  VERSION=$(curl -sSL https://api.github.com/repos/anoma/juvix/releases/latest | grep '"tag_name"' | sed 's/.*"v\(.*\)".*/\1/')
  curl -fsSL "https://github.com/anoma/juvix/releases/download/v${VERSION}/juvix-${JUVIX_ARCH}" -o /tmp/juvix
  chmod +x /tmp/juvix && sudo mv /tmp/juvix /usr/local/bin/juvix
fi
