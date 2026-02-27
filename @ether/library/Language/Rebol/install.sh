#!/usr/bin/env bash
set -euo pipefail
# Rebol / Red
if [[ "${FROM_SOURCE:-false}" == "true" ]]; then
  echo "Installing Rebol 3 (Ren-C) from source..."
  REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/metaeducation/ren-c"
  if [[ -d "$REPO_DIR/.git" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
  else
    mkdir -p "$(dirname "$REPO_DIR")"
    GIT_TERMINAL_PROMPT=0 git clone https://github.com/metaeducation/ren-c.git "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  make -j"$(nproc)"
  sudo cp build/r3 /usr/local/bin/r3
  exit 0
fi
echo "Rebol is not available via standard package managers."
echo "Download Rebol 2: http://www.rebol.com/download.html"
echo "Download Rebol 3 (Ren-C): https://github.com/metaeducation/ren-c/releases"
echo ""
echo "After downloading, place the binary in your PATH." >&2
exit 1
