#!/usr/bin/env bash
set -euo pipefail
# JavaDoc is included with the JDK. Install Java to get javadoc.
if [[ "$(uname)" == "Darwin" ]]; then
  brew install openjdk
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y default-jdk
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y java-latest-openjdk-devel
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm jdk-openjdk
else
  echo "Unsupported package manager." >&2; exit 1
fi
