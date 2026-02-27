#!/usr/bin/env bash
set -euo pipefail
# GNU Smalltalk - https://squeak.org/, https://www.gnu.org/software/smalltalk/
if [[ "$(uname)" == "Darwin" ]]; then
  brew install gnu-smalltalk
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y gnu-smalltalk
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y gnu-smalltalk
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm gnu-smalltalk
else
  echo "Unsupported package manager." >&2; exit 1
fi
