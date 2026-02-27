#!/usr/bin/env bash
set -euo pipefail
# Install Enso - https://github.com/enso-org/enso
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/enso-org/enso"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/enso-org/enso.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && sbt engine-runner/assembly
  exit 0
fi
# Download release binary
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  ARCH="amd64" ;;
  aarch64) ARCH="aarch64" ;;
esac
VERSION=$(curl -sSL https://api.github.com/repos/enso-org/enso/releases/latest | grep tag_name | cut -d'"' -f4)
curl -fsSL "https://github.com/enso-org/enso/releases/download/${VERSION}/enso-engine-${VERSION#enso-}-${OS}-${ARCH}.tar.gz" -o /tmp/enso.tar.gz
sudo mkdir -p /opt/enso && sudo tar -C /opt/enso --strip-components=1 -xzf /tmp/enso.tar.gz
rm -f /tmp/enso.tar.gz
echo "Enso installed to /opt/enso"
