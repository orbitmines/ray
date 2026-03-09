#!/usr/bin/env bash
set -euo pipefail
# Official method: choosenim - https://nim-lang.org/install_unix.html
if [[ "$(uname)" == "Darwin" ]]; then
  brew install nim
else
  curl https://nim-lang.org/choosenim/init.sh -sSf | sh -s -- -y
fi
