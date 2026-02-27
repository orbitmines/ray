#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Aiken"
REGISTRIES=(
  "Aiken Ecosystem: https://aiken-lang.org/ecosystem"
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
    if command -v aiken &>/dev/null; then
      aiken packages search "$@"
    else
      echo "Visit: https://aiken-lang.org/ecosystem"
      echo "Search GitHub: https://github.com/search?q=aiken+$1&type=repositories"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    echo "Visit: https://aiken-lang.org/ecosystem"
    echo "Check: https://github.com/search?q=aiken+$1&type=repositories"
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    if command -v aiken &>/dev/null; then
      aiken packages add "$1"
    else
      echo "aiken not found. Install it first:"
      echo "  cargo install aiken"
      echo ""
      echo "Then run: aiken packages add $1"
    fi
    ;;
  *)
    show_usage
    ;;
esac
