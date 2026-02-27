#!/usr/bin/env bash
set -euo pipefail
# Icon programming language
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Icon from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/icon-src"
  mkdir -p "$REPO_DIR" && cd "$REPO_DIR"
  curl -LO https://www.cs.arizona.edu/icon/ftp/packages/unix/icon-v951src.tgz
  tar xzf icon-v951src.tgz
  cd icon-v951src
  make Configure name=linux
  make
  sudo make Install dest=/usr/local
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  echo "Icon is not in Homebrew. Use --from-source or visit https://www.cs.arizona.edu/icon/" >&2; exit 1
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y icon
elif command -v pacman >/dev/null 2>&1; then
  echo "Check AUR for icon: yay -S icon" >&2; exit 1
else
  echo "Unsupported package manager. Use --from-source or visit https://www.cs.arizona.edu/icon/" >&2; exit 1
fi
