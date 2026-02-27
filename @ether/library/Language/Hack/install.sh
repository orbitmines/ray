#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing HHVM (Hack) from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/facebook/hhvm"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/facebook/hhvm.git "$REPO_DIR" --recurse-submodules
  fi
  cd "$REPO_DIR" && cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j"$(nproc)"
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew tap hhvm/hhvm && brew install hhvm
elif command -v apt-get >/dev/null 2>&1; then
  # Official HHVM installation for Ubuntu/Debian (https://docs.hhvm.com/hhvm/installation/linux)
  sudo apt-get update && sudo apt-get install -y software-properties-common apt-transport-https
  sudo apt-key adv --recv-keys --keyserver hkp://keyserver.ubuntu.com:80 0xB4112585D386EB94
  DISTRO=$(lsb_release -sc)
  sudo add-apt-repository "deb https://dl.hhvm.com/ubuntu ${DISTRO} main"
  sudo apt-get update && sudo apt-get install -y hhvm
elif command -v dnf >/dev/null 2>&1; then
  echo "HHVM does not officially support Fedora. Use --from-source." >&2; exit 1
elif command -v pacman >/dev/null 2>&1; then
  echo "HHVM does not officially support Arch. Use --from-source." >&2; exit 1
else
  echo "Unsupported package manager. Use --from-source." >&2; exit 1
fi
