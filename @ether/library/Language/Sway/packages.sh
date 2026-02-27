#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Sway"
REGISTRIES=(
  "forc.pub: https://forc.pub"
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
    echo "Visit: https://forc.pub/?search=$1"
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    echo "Visit: https://forc.pub/$1"
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    if command -v forc &>/dev/null; then
      forc install "$1"
    else
      echo "Add to Forc.toml [dependencies]:"
      echo "  $1 = { git = \"https://github.com/OWNER/$1\", branch = \"master\" }"
      echo ""
      echo "Then run: forc build"
    fi
    ;;
  *)
    show_usage
    ;;
esac
