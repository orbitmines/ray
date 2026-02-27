#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Cairo"
REGISTRIES=(
  "GitHub (primary): https://github.com/search?q=language%3Acairo&type=repositories"
  "scarbs.xyz (emerging): https://scarbs.xyz"
)

show_usage() {
  echo "Package manager for $LANG_NAME"
  echo ""
  echo "Note: Cairo uses Scarb for dependency management. Most packages are distributed via GitHub."
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
    echo "Visit: https://github.com/search?q=language%3Acairo+$1&type=repositories"
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    echo "Visit: https://github.com/search?q=language%3Acairo+$1&type=repositories"
    echo "Check Scarb.toml in the repository for version and dependency info."
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    echo "Add to Scarb.toml [dependencies]:"
    echo "  $1 = { git = \"https://github.com/OWNER/$1\" }"
    echo ""
    echo "Then run: scarb build"
    ;;
  *)
    show_usage
    ;;
esac
