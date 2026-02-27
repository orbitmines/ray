#!/usr/bin/env bash
set -euo pipefail
# Install Flutter - https://flutter.dev/ https://docs.flutter.dev/get-started/install
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/flutter/flutter"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/flutter/flutter.git "$REPO_DIR"
  fi
  export PATH="$REPO_DIR/bin:$PATH"
  flutter doctor
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install --cask flutter
else
  # Official: clone the Flutter repo
  FLUTTER_DIR="$HOME/.flutter-sdk"
  if [[ -d "$FLUTTER_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$FLUTTER_DIR" pull || true
  else
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/flutter/flutter.git "$FLUTTER_DIR" -b stable
  fi
  if ! grep -q '.flutter-sdk/bin' "$HOME/.profile" 2>/dev/null; then
    echo 'export PATH="$HOME/.flutter-sdk/bin:$PATH"' >> "$HOME/.profile"
  fi
  export PATH="$FLUTTER_DIR/bin:$PATH"
  flutter doctor
fi
