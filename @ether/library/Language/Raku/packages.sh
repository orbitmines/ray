#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Raku"
REGISTRIES=(
  "Raku Land: https://raku.land"
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
    if command -v zef &>/dev/null; then
      zef search "$@"
    else
      echo "Visit: https://raku.land/?q=$1"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    if command -v zef &>/dev/null; then
      zef info "$1"
    else
      echo "Visit: https://raku.land/zef:$1"
    fi
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    zef install "$1"
    ;;
  *)
    show_usage
    ;;
esac
