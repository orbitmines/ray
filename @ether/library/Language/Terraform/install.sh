#!/usr/bin/env bash
set -euo pipefail
# Terraform: infrastructure as code - https://www.terraform.io/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/hashicorp/terraform"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/hashicorp/terraform.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && go build -o "$HOME/.local/bin/terraform" .
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew tap hashicorp/tap && brew install hashicorp/tap/terraform
elif command -v apt-get >/dev/null 2>&1; then
  wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
  sudo apt-get update && sudo apt-get install -y terraform
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y dnf-plugins-core
  sudo dnf config-manager --add-repo https://rpm.releases.hashicorp.com/fedora/hashicorp.repo
  sudo dnf install -y terraform
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm terraform
else
  echo "Unsupported package manager." >&2; exit 1
fi
