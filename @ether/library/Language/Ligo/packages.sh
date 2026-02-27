#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Ligo"
REGISTRIES=(
  "Ligo Packages: https://packages.ligolang.org"
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
    if command -v ligo &>/dev/null; then
      ligo install --list 2>/dev/null || echo "Visit: https://packages.ligolang.org/?q=$1"
    else
      echo "Visit: https://packages.ligolang.org/?q=$1"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    echo "Visit: https://packages.ligolang.org/package/$1"
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    if command -v ligo &>/dev/null; then
      ligo install "$1"
    else
      echo "ligo not found. Install it first:"
      echo "  https://ligolang.org/docs/intro/installation"
      echo ""
      echo "Then run: ligo install $1"
    fi
    ;;
  *)
    show_usage
    ;;
esac
