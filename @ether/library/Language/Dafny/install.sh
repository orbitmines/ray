#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install dafny
elif command -v dotnet >/dev/null 2>&1; then
  dotnet tool install --global dafny
else
  # Download binary release
  OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
  esac
  VERSION=$(curl -fsSL https://api.github.com/repos/dafny-lang/dafny/releases/latest | grep tag_name | cut -d'"' -f4 | sed 's/^v//')
  curl -fsSL "https://github.com/dafny-lang/dafny/releases/download/v${VERSION}/dafny-${VERSION}-${ARCH}-ubuntu-20.04.zip" -o /tmp/dafny.zip
  sudo unzip -o /tmp/dafny.zip -d /opt/dafny
  sudo ln -sf /opt/dafny/dafny/dafny /usr/local/bin/dafny
  rm -f /tmp/dafny.zip
fi
