#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/catseye/Beatnik"
if [[ -d "$REPO_DIR" ]]; then
  # Try to find an interpreter in the repo
  if [[ -f "$REPO_DIR/impl/beatnik.py" ]]; then
    exec python3 "$REPO_DIR/impl/beatnik.py" "$1"
  elif [[ -f "$REPO_DIR/src/beatnik" ]]; then
    exec "$REPO_DIR/src/beatnik" "$1"
  else
    echo "Beatnik interpreter not found in $REPO_DIR." >&2; exit 1
  fi
else
  echo "Beatnik is not installed. Run install.sh first." >&2; exit 1
fi
