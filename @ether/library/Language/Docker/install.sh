#!/usr/bin/env bash
set -euo pipefail
# Official install: https://docs.docker.com/engine/install/
if [[ "$(uname)" == "Darwin" ]]; then
  brew install --cask docker
elif command -v apt-get >/dev/null 2>&1; then
  # Docker's official apt repository (not docker.io from Ubuntu repos)
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER"
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y dnf-plugins-core
  sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
  sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo systemctl enable --now docker
  sudo usermod -aG docker "$USER"
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm docker docker-compose
  sudo systemctl enable --now docker
  sudo usermod -aG docker "$USER"
else
  echo "Unsupported package manager." >&2; exit 1
fi
