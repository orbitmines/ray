#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing K Framework from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/kframework/k"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/kframework/k.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && mvn package -DskipTests
  exit 0
fi
# Official install (https://kframework.org/)
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y curl
  curl -fsSL https://github.com/kframework/k/releases/latest/download/kframework_amd64.deb -o /tmp/kframework.deb
  sudo dpkg -i /tmp/kframework.deb || sudo apt-get install -f -y
  rm -f /tmp/kframework.deb
elif [[ "$(uname)" == "Darwin" ]]; then
  brew tap kframework/k && brew install kframework
elif command -v pacman >/dev/null 2>&1; then
  curl -fsSL https://github.com/kframework/k/releases/latest/download/kframework-git-x86_64.pkg.tar.zst -o /tmp/kframework.pkg.tar.zst
  sudo pacman -U --noconfirm /tmp/kframework.pkg.tar.zst
  rm -f /tmp/kframework.pkg.tar.zst
else
  echo "Unsupported package manager. Use --from-source." >&2; exit 1
fi
