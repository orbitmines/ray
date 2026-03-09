#!/usr/bin/env bash
set -euo pipefail
# ACL2 - A Computational Logic for Applicative Common Lisp
if [[ "${FROM_SOURCE:-false}" == "true" ]] || true; then
  # ACL2 is typically built from source
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/acl2/acl2"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/acl2/acl2.git "$REPO_DIR"
  fi
  # Ensure SBCL is installed as the Common Lisp implementation
  if ! command -v sbcl &>/dev/null; then
    if [[ "$(uname)" == "Darwin" ]]; then
      brew install sbcl
    elif command -v apt-get &>/dev/null; then
      sudo apt-get update && sudo apt-get install -y sbcl
    elif command -v dnf &>/dev/null; then
      sudo dnf install -y sbcl
    elif command -v pacman &>/dev/null; then
      sudo pacman -S --noconfirm sbcl
    else
      echo "Please install SBCL first." >&2; exit 1
    fi
  fi
  cd "$REPO_DIR"
  make LISP=sbcl
fi
