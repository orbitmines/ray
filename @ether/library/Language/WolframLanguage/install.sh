#!/usr/bin/env bash
set -euo pipefail
# Wolfram Language / Mathematica
# https://www.wolfram.com/engine/ (free for developers)
# The Wolfram Engine can be installed for non-commercial use
echo "Wolfram Language requires a license."
echo "Free Wolfram Engine: https://www.wolfram.com/engine/"
if [[ "$(uname)" == "Darwin" ]]; then
  brew install --cask wolfram-engine 2>/dev/null || {
    echo "Download from: https://www.wolfram.com/engine/" >&2
    exit 1
  }
else
  echo "Download from: https://www.wolfram.com/engine/" >&2
  echo "Or install Mathematica from: https://www.wolfram.com/mathematica/" >&2
  exit 1
fi
