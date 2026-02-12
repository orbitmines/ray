#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Swift"
REGISTRIES=(
  "Swift Package Index: https://swiftpackageindex.com"
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
    echo "Visit: https://swiftpackageindex.com/search?query=$1"
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    echo "Visit: https://swiftpackageindex.com/search?query=$1"
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    echo "Add to Package.swift dependencies:"
    echo "  .package(url: \"https://github.com/OWNER/$1.git\", from: \"VERSION\")"
    echo ""
    echo "Find the URL at: https://swiftpackageindex.com/search?query=$1"
    ;;
  *)
    show_usage
    ;;
esac
