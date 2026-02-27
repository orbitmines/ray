#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Elm"
REGISTRIES=(
  "Elm Packages: https://package.elm-lang.org"
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
    echo "Visit: https://package.elm-lang.org/?q=$1"
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    echo "Visit: https://package.elm-lang.org/packages/$1/latest"
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    elm install "$1"
    ;;
  *)
    show_usage
    ;;
esac
