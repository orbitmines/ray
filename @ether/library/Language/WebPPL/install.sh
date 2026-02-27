#!/usr/bin/env bash
set -euo pipefail
# WebPPL - probabilistic programming language - http://webppl.org/
# Requires Node.js
command -v node >/dev/null 2>&1 || { echo "Node.js is required for WebPPL." >&2; exit 1; }
npm install -g webppl
