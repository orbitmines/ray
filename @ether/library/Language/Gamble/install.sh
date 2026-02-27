#!/usr/bin/env bash
set -euo pipefail
# Install Gamble - https://github.com/rmculpepper/gamble
# Gamble is a Racket package for probabilistic programming
if command -v raco >/dev/null 2>&1; then
  raco pkg install --auto gamble
else
  echo "Racket is required. Install Racket first, then: raco pkg install gamble" >&2; exit 1
fi
