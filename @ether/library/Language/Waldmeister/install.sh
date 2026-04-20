#!/usr/bin/env bash
set -euo pipefail
# Waldmeister - equational theorem prover
# https://www.waldmeister.org/
echo "Waldmeister must be downloaded from: https://www.waldmeister.org/"
echo "Download the binary distribution for your platform."
mkdir -p "$HOME/.local/bin"
OS="$(uname -s)"
ARCH="$(uname -m)"
if [[ "$OS" == "Linux" && "$ARCH" == "x86_64" ]]; then
  curl -fsSL "https://www.waldmeister.org/download/waldmeister-linux-x86_64" -o "$HOME/.local/bin/waldmeister" 2>/dev/null && \
    chmod +x "$HOME/.local/bin/waldmeister" || {
    echo "Could not auto-download. Visit https://www.waldmeister.org/" >&2
    exit 1
  }
else
  echo "Visit https://www.waldmeister.org/ for your platform." >&2
  exit 1
fi
