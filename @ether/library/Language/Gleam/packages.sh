#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Gleam"
REGISTRIES=(
  "Hex (Gleam): https://hex.pm"
  "Gleam Packages: https://packages.gleam.run"
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
    if command -v gleam &>/dev/null; then
      gleam hex search "$@" 2>/dev/null || echo "Visit: https://hex.pm/packages?search=$1"
    else
      echo "Visit: https://hex.pm/packages?search=$1"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    echo "Visit: https://hex.pm/packages/$1"
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    gleam add "$1"
    ;;
  *)
    show_usage
    ;;
esac
