#!/usr/bin/env bash
set -euo pipefail
# Install Effekt - https://effekt-lang.org/ https://github.com/effekt-lang/effekt
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/effekt-lang/effekt"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/effekt-lang/effekt.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && sbt assemble
  exit 0
fi
# Install via npm (official method)
npm install -g @aspect-build/effekt 2>/dev/null || npm install -g effekt 2>/dev/null || {
  echo "Trying sbt build..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/effekt-lang/effekt"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/effekt-lang/effekt.git "$REPO_DIR"
  fi
  cd "$REPO_DIR" && sbt assemble
}
