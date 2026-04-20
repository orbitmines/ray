#!/usr/bin/env bash
set -euo pipefail
# Install Frege - https://github.com/Frege/frege
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/Frege/frege"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/Frege/frege.git "$REPO_DIR"
fi
# Download the Frege compiler jar
mkdir -p "$HOME/.frege"
VERSION="3.25.84"
curl -fsSL "https://github.com/Frege/frege/releases/download/${VERSION}/frege${VERSION}.jar" -o "$HOME/.frege/frege.jar" 2>/dev/null || {
  cd "$REPO_DIR" && ./gradlew build -x test
}
echo "Frege installed."
