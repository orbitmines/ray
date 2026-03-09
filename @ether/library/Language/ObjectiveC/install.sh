#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  if ! xcode-select -p >/dev/null 2>&1; then
    xcode-select --install
  fi
  echo "Objective-C is available via Xcode command line tools."
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y gobjc gnustep-devel
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y gcc-objc gnustep-base-devel
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm gcc-objc gnustep-base
else
  echo "Unsupported package manager." >&2; exit 1
fi
