#!/usr/bin/env bash
set -euo pipefail
# JSON5 is a data format. Install the reference parser via npm.
if command -v npm >/dev/null 2>&1; then
  npm install -g json5
else
  echo "npm is required to install the JSON5 CLI. Install Node.js first." >&2
  exit 1
fi
