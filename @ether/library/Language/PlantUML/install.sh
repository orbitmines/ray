#!/usr/bin/env bash
set -euo pipefail
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing PlantUML from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/plantuml/plantuml"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/plantuml/plantuml.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  ./gradlew build
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install plantuml
elif command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y plantuml
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y plantuml
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --noconfirm plantuml
else
  echo "Unsupported package manager. Use --from-source." >&2; exit 1
fi
