#!/usr/bin/env bash
set -euo pipefail
# Mojo - https://docs.modular.com/mojo/manual/get-started
# Official install via modular CLI
if [[ "$(uname)" == "Darwin" ]]; then
  brew install modular
  modular install mojo
elif [[ "$(uname)" == "Linux" ]]; then
  curl -ssL https://magic.modular.com | bash
  export PATH="$HOME/.modular/bin:$PATH"
  magic install mojo
else
  echo "Unsupported platform." >&2; exit 1
fi
