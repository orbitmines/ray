#!/usr/bin/env bash
set -euo pipefail
# Vienna Development Method - Overture Tool: https://www.overturetool.org/
# Overture is a Java-based IDE/tool for VDM
if [[ "$(uname)" == "Darwin" ]]; then
  brew install --cask overture || true
fi
# Download Overture release for all platforms
RELEASE_URL="https://github.com/overturetool/overture/releases/latest"
DOWNLOAD_URL=$(curl -sSL "$RELEASE_URL" | grep -oP 'href="[^"]*\.jar"' | head -1 | cut -d'"' -f2)
if [[ -n "${DOWNLOAD_URL:-}" ]]; then
  mkdir -p "$HOME/.local/lib/overture"
  curl -fsSL "https://github.com${DOWNLOAD_URL}" -o "$HOME/.local/lib/overture/overture.jar"
else
  echo "Download Overture manually from: https://www.overturetool.org/" >&2
  exit 1
fi
