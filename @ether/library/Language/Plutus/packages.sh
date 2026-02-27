#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Plutus"
REGISTRIES=(
  "Hackage (Haskell ecosystem): https://hackage.haskell.org"
)

show_usage() {
  echo "Package manager for $LANG_NAME"
  echo ""
  echo "Note: Plutus uses the Haskell/Cabal ecosystem."
  echo ""
  echo "Registries:"
  for r in "${REGISTRIES[@]}"; do echo "  $r"; done
  echo ""
  echo "Usage: $0 {search|info|install} <package>"
}

cmd="${1:-}"
shift || true

case "$cmd" in
  search)
    [[ $# -eq 0 ]] && { echo "Usage: $0 search <query>"; exit 1; }
    if command -v cabal &>/dev/null; then
      cabal list "$@"
    else
      echo "Visit: https://hackage.haskell.org/packages/search?terms=$1"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    echo "Visit: https://hackage.haskell.org/package/$1"
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    echo "Add to your .cabal file build-depends:"
    echo "  build-depends: $1"
    echo ""
    echo "Then run: cabal build"
    ;;
  *)
    show_usage
    ;;
esac
