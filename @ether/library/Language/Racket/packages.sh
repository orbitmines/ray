#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Racket"
REGISTRIES=(
  "Racket Packages: https://pkgs.racket-lang.org"
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
    if command -v raco &>/dev/null; then
      raco pkg search "$@" 2>/dev/null || echo "Visit: https://pkgs.racket-lang.org/search?q=$1"
    else
      echo "Visit: https://pkgs.racket-lang.org/search?q=$1"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    echo "Visit: https://pkgs.racket-lang.org/package/$1"
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    raco pkg install "$1"
    ;;
  *)
    show_usage
    ;;
esac
