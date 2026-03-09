#!/usr/bin/env bash
set -euo pipefail
# Inform 7 - interactive fiction language
if [[ "$(uname)" == "Darwin" ]]; then
  echo "Download Inform 7 from https://ganelson.github.io/inform-website/" >&2
  echo "macOS app available at: https://ganelson.github.io/inform-website/downloads.html" >&2
  exit 1
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y inform7 || {
    echo "inform7 not in repos. Download from https://ganelson.github.io/inform-website/" >&2; exit 1
  }
elif command -v pacman >/dev/null 2>&1; then
  echo "Check AUR for inform7: yay -S inform7" >&2; exit 1
else
  echo "Download Inform 7 from https://ganelson.github.io/inform-website/" >&2; exit 1
fi
