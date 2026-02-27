#!/usr/bin/env bash
set -euo pipefail
# Install Elm - https://guide.elm-lang.org/install/elm.html
if [[ "$(uname)" == "Darwin" ]]; then
  brew install elm
else
  # Official binary installer
  npm install -g elm 2>/dev/null || {
    ARCH=$(uname -m)
    if [[ "$ARCH" == "x86_64" ]]; then
      curl -fsSL https://github.com/elm/compiler/releases/latest/download/binary-for-linux-64-bit.gz | gzip -d > /tmp/elm
      chmod +x /tmp/elm && sudo mv /tmp/elm /usr/local/bin/elm
    else
      echo "Elm official binaries are x86_64 only on Linux. Use npm: npm install -g elm" >&2; exit 1
    fi
  }
fi
