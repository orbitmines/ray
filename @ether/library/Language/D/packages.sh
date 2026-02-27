#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="D"
REGISTRIES=(
  "DUB Registry: https://code.dlang.org"
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
    if command -v dub &>/dev/null; then
      dub search "$@"
    else
      echo "Visit: https://code.dlang.org/?search=$1"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    echo "Visit: https://code.dlang.org/packages/$1"
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    if command -v dub &>/dev/null; then
      dub fetch "$1"
    else
      echo "Install dub first, then run: dub fetch $1"
    fi
    ;;
  *)
    show_usage
    ;;
esac
