#!/usr/bin/env bash
set -euo pipefail
# Bazel - build tool by Google
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/bazelbuild/bazel"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/bazelbuild/bazel.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && ./compile.sh
  sudo cp output/bazel /usr/local/bin/ || cp output/bazel "$HOME/.local/bin/"
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install bazel
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y apt-transport-https curl gnupg
  curl -fsSL https://bazel.build/bazel-release.pub.gpg | gpg --dearmor >bazel-archive-keyring.gpg
  sudo mv bazel-archive-keyring.gpg /usr/share/keyrings/
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/bazel-archive-keyring.gpg] https://storage.googleapis.com/bazel-apt stable jdk1.8" | sudo tee /etc/apt/sources.list.d/bazel.list
  sudo apt-get update && sudo apt-get install -y bazel
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y dnf-plugins-core
  sudo dnf copr enable -y vbatts/bazel
  sudo dnf install -y bazel
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm bazel
else
  echo "No package manager found. Use FROM_SOURCE=true." >&2; exit 1
fi
