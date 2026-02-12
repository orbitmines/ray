#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Tact"
REGISTRIES=(
  "npm (TON ecosystem): https://www.npmjs.com"
)

show_usage() {
  echo "Package manager for $LANG_NAME"
  echo ""
  echo "Note: Tact uses the npm ecosystem for package distribution."
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
    if command -v npm &>/dev/null; then
      npm search tact-"$@"
    else
      echo "Visit: https://www.npmjs.com/search?q=tact-$1"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    if command -v npm &>/dev/null; then
      npm info "$1"
    else
      echo "Visit: https://www.npmjs.com/package/$1"
    fi
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    npm install "$1"
    ;;
  *)
    show_usage
    ;;
esac
