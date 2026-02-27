#!/usr/bin/env bash
set -euo pipefail
# Mizar - https://mizar.uwb.edu.pl/
# Download from official site
echo "Downloading Mizar from official site..."
MIZAR_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/mizar"
mkdir -p "$MIZAR_DIR"
if [[ "$(uname)" == "Linux" ]]; then
  curl -sSL "https://mizar.uwb.edu.pl/~softadm/pub/system/x86_64-linux/mizar-latest-linux.tar" -o "$MIZAR_DIR/mizar.tar"
  cd "$MIZAR_DIR" && tar xf mizar.tar
  sudo cp bin/* /usr/local/bin/ 2>/dev/null || cp bin/* "$HOME/.local/bin/"
elif [[ "$(uname)" == "Darwin" ]]; then
  echo "Mizar does not provide official macOS binaries."
  echo "See: https://mizar.uwb.edu.pl/"
  exit 1
fi
