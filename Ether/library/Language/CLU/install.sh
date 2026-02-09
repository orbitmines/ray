#!/usr/bin/env bash
set -euo pipefail
# CLU is a historical language by Barbara Liskov. PCLU is a portable implementation.
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/nbuwe/pclu"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/nbuwe/pclu.git "$REPO_DIR"
fi
cd "$REPO_DIR"
make || echo "CLU build may require additional configuration." >&2
