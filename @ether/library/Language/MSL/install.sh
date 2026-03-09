#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname)" == "Darwin" ]]; then
  if ! xcode-select -p >/dev/null 2>&1; then
    xcode-select --install
  fi
  echo "MSL (Metal Shading Language) is available via Xcode command line tools."
else
  echo "MSL (Metal Shading Language) is only supported on macOS." >&2; exit 1
fi
