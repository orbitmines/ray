#!/usr/bin/env bash
set -euo pipefail
# LFE - Lisp Flavoured Erlang
# Requires Erlang/OTP to be installed first
if ! command -v erl >/dev/null 2>&1; then
  echo "Erlang/OTP is required. Install Erlang first." >&2
  exit 1
fi
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing LFE from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/lfe/lfe"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/lfe/lfe.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  make
  sudo make install
  exit 0
fi
# LFE is typically installed from source
echo "Installing LFE from source (default method)..."
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/lfe/lfe"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/lfe/lfe.git "$REPO_DIR"
fi
cd "$REPO_DIR"
make
sudo make install
