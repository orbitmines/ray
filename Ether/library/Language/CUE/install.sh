#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install cue-lang/tap/cue
elif command -v go >/dev/null 2>&1; then
  go install cuelang.org/go/cmd/cue@latest
else
  # Download binary release
  OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
  esac
  VERSION=$(curl -fsSL https://api.github.com/repos/cue-lang/cue/releases/latest | grep tag_name | cut -d'"' -f4)
  curl -fsSL "https://github.com/cue-lang/cue/releases/download/${VERSION}/cue_${VERSION}_${OS}_${ARCH}.tar.gz" | \
    sudo tar -xz -C /usr/local/bin cue
fi
