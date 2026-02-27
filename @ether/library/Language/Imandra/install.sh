#!/usr/bin/env bash
set -euo pipefail
# Official installation via the Imandra installer (https://docs.imandra.ai/imandra-docs/notebooks/installation/)
if [[ "$(uname)" == "Darwin" ]] || [[ "$(uname)" == "Linux" ]]; then
  bash <(curl -s "https://storage.googleapis.com/imandra-do/install.sh")
else
  echo "Unsupported platform. See https://www.imandra.ai/ for installation." >&2
  exit 1
fi
