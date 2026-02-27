#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Python"
REGISTRIES=(
  "PyPI: https://pypi.org"
  "Anaconda: https://anaconda.org"
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
    pip index versions "$1" 2>/dev/null || echo "Visit: https://pypi.org/search/?q=$1"
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    pip show "$1" 2>/dev/null || pip index versions "$1" 2>/dev/null || echo "Visit: https://pypi.org/project/$1/"
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    pip install "$1"
    ;;
  *)
    show_usage
    ;;
esac
