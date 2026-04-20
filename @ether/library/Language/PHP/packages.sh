#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="PHP"
REGISTRIES=(
  "Packagist: https://packagist.org"
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
    if command -v composer &>/dev/null; then
      composer search "$@"
    else
      echo "Visit: https://packagist.org/?query=$1"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    if command -v composer &>/dev/null; then
      composer show "$1" 2>/dev/null || echo "Visit: https://packagist.org/packages/$1"
    else
      echo "Visit: https://packagist.org/packages/$1"
    fi
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    composer require "$1"
    ;;
  *)
    show_usage
    ;;
esac
