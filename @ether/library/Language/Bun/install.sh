#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  brew install oven-sh/bun/bun
else
  curl -fsSL https://bun.sh/install | bash
fi
