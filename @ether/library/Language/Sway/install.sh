#!/usr/bin/env bash
set -euo pipefail
# Sway: Fuel blockchain smart contract language - https://fuellabs.github.io/sway/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/FuelLabs/sway"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/FuelLabs/sway.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && cargo build --release
  exit 0
fi
# Install fuelup (Fuel toolchain manager) which includes forc
curl -fsSL https://install.fuel.network | sh
