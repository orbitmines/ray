#!/usr/bin/env bash
set -euo pipefail
# Troll: dice rolling language - https://hjemmesider.diku.dk/~torbenm/Troll/
# Download pre-built binary or compile from source (requires SML)
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y smlnj
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm smlnj
elif [[ "$(uname)" == "Darwin" ]]; then
  brew install smlnj
fi
TROLL_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/troll"
mkdir -p "$TROLL_DIR"
curl -fSL "https://hjemmesider.diku.dk/~torbenm/Troll/Troll.zip" -o "$TROLL_DIR/Troll.zip" || {
  echo "Download Troll manually from https://hjemmesider.diku.dk/~torbenm/Troll/" >&2
  exit 1
}
cd "$TROLL_DIR" && unzip -o Troll.zip
