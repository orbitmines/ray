#!/usr/bin/env bash
set -euo pipefail
# Hoon - Urbit's programming language
if [[ "$(uname)" == "Darwin" ]]; then
  brew install urbit
elif command -v apt-get >/dev/null 2>&1; then
  echo "Download Urbit runtime from https://urbit.org/getting-started" >&2
  echo "Linux install: curl -L https://urbit.org/install/linux-x86_64/latest | tar xzk --transform='s/.*/urbit/g'" >&2
  exit 1
else
  echo "Download Urbit runtime from https://urbit.org/getting-started" >&2; exit 1
fi
