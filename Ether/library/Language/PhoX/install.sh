#!/usr/bin/env bash
set -euo pipefail
echo "PhoX is a proof assistant."
echo "See https://raffalli.eu/phox/index.html for download and installation instructions."
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y phox || {
    echo "PhoX not found in repositories. Install from source at https://raffalli.eu/phox/" >&2; exit 1
  }
else
  echo "Install PhoX from https://raffalli.eu/phox/" >&2; exit 1
fi
