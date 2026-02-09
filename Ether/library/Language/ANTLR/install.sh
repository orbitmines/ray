#!/usr/bin/env bash
set -euo pipefail
# ANTLR - parser generator - https://www.antlr.org/
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/antlr/antlr4"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/antlr/antlr4.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  mvn clean install -DskipTests || true
  exit 0
fi
if [[ "$(uname)" == "Darwin" ]]; then
  brew install antlr
elif command -v pip3 &>/dev/null; then
  pip3 install antlr4-tools
elif command -v pip &>/dev/null; then
  pip install antlr4-tools
else
  # Fallback: download jar directly
  INSTALL_DIR="${ETHER_EXTERNAL_DIR:-$HOME/.local/share}/antlr"
  mkdir -p "$INSTALL_DIR"
  curl -fSL -o "$INSTALL_DIR/antlr.jar" "https://www.antlr.org/download/antlr-4.13.1-complete.jar" || {
    echo "Failed to download ANTLR." >&2; exit 1
  }
  echo "ANTLR installed at $INSTALL_DIR/antlr.jar"
  echo "Run with: java -jar $INSTALL_DIR/antlr.jar"
fi
