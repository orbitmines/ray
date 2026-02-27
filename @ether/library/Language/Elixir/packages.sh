#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Elixir"
REGISTRIES=(
  "Hex: https://hex.pm"
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
    if command -v mix &>/dev/null; then
      mix hex.search "$@"
    else
      echo "Visit: https://hex.pm/packages?search=$1"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    if command -v mix &>/dev/null; then
      mix hex.info "$1"
    else
      echo "Visit: https://hex.pm/packages/$1"
    fi
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    echo "Add to mix.exs deps:"
    echo "  {:$1, \"~> VERSION\"}"
    echo ""
    echo "Then run: mix deps.get"
    echo "Details: https://hex.pm/packages/$1"
    ;;
  *)
    show_usage
    ;;
esac
