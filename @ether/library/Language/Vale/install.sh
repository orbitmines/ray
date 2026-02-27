#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Vale from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/ValeLang/Vale"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/ValeLang/Vale.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  cmake -B build && cmake --build build
  exit 0
fi
# Official: download release from https://vale.dev/
OS="$(uname -s)"
ARCH="$(uname -m)"
if [[ "$OS" == "Darwin" ]]; then
  PLATFORM="mac"
elif [[ "$OS" == "Linux" ]]; then
  PLATFORM="linux"
else
  echo "Unsupported platform. Use --from-source." >&2; exit 1
fi
RELEASE_URL=$(curl -sSL https://api.github.com/repos/ValeLang/Vale/releases/latest | grep "browser_download_url.*${PLATFORM}" | head -1 | cut -d'"' -f4)
if [[ -z "$RELEASE_URL" ]]; then
  echo "Could not find release for platform $PLATFORM. Use --from-source." >&2; exit 1
fi
mkdir -p "$HOME/.local/bin"
curl -fsSL "$RELEASE_URL" -o /tmp/vale-release.zip
unzip -o /tmp/vale-release.zip -d "$HOME/.local/bin/vale"
rm -f /tmp/vale-release.zip
