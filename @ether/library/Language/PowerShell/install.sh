#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing PowerShell from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/PowerShell/PowerShell"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/PowerShell/PowerShell.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  dotnet build
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install powershell/tap/powershell
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y wget apt-transport-https software-properties-common
  source /etc/os-release
  wget -q "https://packages.microsoft.com/config/ubuntu/$VERSION_ID/packages-microsoft-prod.deb"
  sudo dpkg -i packages-microsoft-prod.deb
  rm packages-microsoft-prod.deb
  sudo apt-get update && sudo apt-get install -y powershell
elif command -v dnf >/dev/null 2>&1; then
  sudo rpm --import https://packages.microsoft.com/keys/microsoft.asc
  sudo dnf install -y powershell
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm powershell-bin 2>/dev/null || {
    echo "Install powershell-bin from AUR." >&2; exit 1
  }
else
  echo "Unsupported package manager. Use --from-source." >&2; exit 1
fi
