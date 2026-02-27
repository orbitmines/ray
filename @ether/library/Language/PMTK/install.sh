#!/usr/bin/env bash
set -euo pipefail
echo "Installing PMTK3 from source..."
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/probml/pmtk3"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  GIT_TERMINAL_PROMPT=0 git clone https://github.com/probml/pmtk3.git "$REPO_DIR"
fi
echo "PMTK3 cloned to $REPO_DIR. Requires MATLAB or GNU Octave."
