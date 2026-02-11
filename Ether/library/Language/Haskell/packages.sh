#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Haskell"
REGISTRIES=(
  "Hackage: https://hackage.haskell.org"
  "Stackage: https://www.stackage.org"
)

show_usage() {
  echo "Package manager for $LANG_NAME"
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
    if command -v cabal &>/dev/null; then
      cabal info "$1"
    else
      echo "Visit: https://hackage.haskell.org/package/$1"
    fi
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    cabal install "$1"
    ;;
  *)
    show_usage
    ;;
esac
