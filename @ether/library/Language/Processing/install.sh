#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install --cask processing
elif command -v apt-get >/dev/null 2>&1; then
  echo "Download Processing from https://processing.org/download" >&2
  echo "Or install processing-java via:" >&2
  curl -fsSL https://processing.org/download -o /tmp/processing.tgz
  tar -xzf /tmp/processing.tgz -C "$HOME/.local/share/" && rm -f /tmp/processing.tgz
  ln -sf "$HOME/.local/share/processing-"*/processing-java "$HOME/.local/bin/processing-java"
else
  echo "Download Processing from https://processing.org/download" >&2
  exit 1
fi
