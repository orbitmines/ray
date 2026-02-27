#!/usr/bin/env bash
set -euo pipefail
# Michelson - Tezos smart contract language
# https://tezos.gitlab.io/active/michelson.html
# Installed via the Octez client (tezos-client)
if [[ "$(uname)" == "Darwin" ]]; then
  brew install tezos
elif command -v apt-get >/dev/null 2>&1; then
  sudo add-apt-repository -y ppa:serokell/tezos 2>/dev/null || true
  sudo apt-get update && sudo apt-get install -y tezos-client
elif command -v dnf >/dev/null 2>&1; then
  echo "Install Octez from: https://tezos.gitlab.io/introduction/howtoget.html" >&2
  exit 1
elif command -v pacman >/dev/null 2>&1; then
  echo "Install Octez from: https://tezos.gitlab.io/introduction/howtoget.html" >&2
  exit 1
else
  echo "Unsupported platform. See: https://tezos.gitlab.io/introduction/howtoget.html" >&2
  exit 1
fi
