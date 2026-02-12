#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  echo "CUDA is not supported on macOS. Use NVIDIA GPU on Linux." >&2; exit 1
elif command -v apt-get >/dev/null 2>&1; then
  # Follow NVIDIA official instructions for Ubuntu/Debian
  sudo apt-get update && sudo apt-get install -y nvidia-cuda-toolkit
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y cuda
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm cuda
else
  echo "Unsupported platform. See https://developer.nvidia.com/cuda-downloads" >&2; exit 1
fi
