#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Motoko"
REGISTRIES=(
  "Mops: https://mops.one"
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
    if command -v mops &>/dev/null; then
      mops search "$@"
    else
      echo "Visit: https://mops.one/?q=$1"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    echo "Visit: https://mops.one/$1"
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    if command -v mops &>/dev/null; then
      mops add "$1"
    else
      echo "mops not found. Install it first:"
      echo "  npm install -g ic-mops"
      echo ""
      echo "Then run: mops add $1"
    fi
    ;;
  *)
    show_usage
    ;;
esac
