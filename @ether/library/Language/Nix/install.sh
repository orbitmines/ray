#!/usr/bin/env bash
set -euo pipefail
if command -v nix >/dev/null 2>&1; then
  echo "Nix is already installed."
  exit 0
fi
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install --no-confirm
