#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install sass/sass/sass
elif command -v npm >/dev/null 2>&1; then
  npm install -g sass
else
  echo "Install Node.js first, then: npm install -g sass" >&2; exit 1
fi
