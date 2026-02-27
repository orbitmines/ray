#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Noir"
REGISTRIES=(
  "GitHub (primary): https://github.com/search?q=noir+lang&type=repositories"
)

show_usage() {
  echo "Package manager for $LANG_NAME"
  echo ""
  echo "Note: Noir uses Nargo for dependency management. Packages are distributed via GitHub."
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
    echo "Visit: https://github.com/search?q=noir+$1&type=repositories"
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    echo "Visit: https://github.com/search?q=noir+$1&type=repositories"
    echo "Check Nargo.toml in the repository for version and dependency info."
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    echo "Add to Nargo.toml [dependencies]:"
    echo "  $1 = { tag = \"v0.1.0\", git = \"https://github.com/OWNER/$1\" }"
    echo ""
    echo "Then run: nargo check"
    ;;
  *)
    show_usage
    ;;
esac
