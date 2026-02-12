#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing DirectX Shader Compiler from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/microsoft/DirectXShaderCompiler"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/microsoft/DirectXShaderCompiler.git "$REPO_DIR" --recurse-submodules
  fi
  cd "$REPO_DIR" && cmake -B build -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$HOME/.local" && cmake --build build -j"$(nproc)" && cmake --install build
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install dxc
elif command -v apt-get >/dev/null 2>&1; then
  # Install prebuilt from GitHub releases
  ARCH=$(uname -m)
  VERSION=$(curl -sSL https://api.github.com/repos/microsoft/DirectXShaderCompiler/releases/latest | grep '"tag_name"' | sed 's/.*"\(.*\)".*/\1/')
  curl -fsSL "https://github.com/microsoft/DirectXShaderCompiler/releases/download/${VERSION}/linux_dxc_${VERSION#v}.x86_64.tar.gz" -o /tmp/dxc.tar.gz
  sudo mkdir -p /usr/local/dxc && sudo tar -xzf /tmp/dxc.tar.gz -C /usr/local/dxc
  sudo ln -sf /usr/local/dxc/bin/dxc /usr/local/bin/dxc
  rm -f /tmp/dxc.tar.gz
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm directx-shader-compiler
else
  echo "Unsupported package manager. Use --from-source." >&2; exit 1
fi
