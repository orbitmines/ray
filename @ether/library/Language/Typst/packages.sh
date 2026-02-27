#!/usr/bin/env bash
set -euo pipefail

REGISTRY="https://packages.typst.app"

usage() {
  echo "Typst Package Manager (Typst Universe)"
  echo ""
  echo "Registry: $REGISTRY"
  echo ""
  echo "Usage: packages.sh <command> [args]"
  echo ""
  echo "Commands:"
  echo "  search <query>   Search for packages"
  echo "  info <pkg>       Show package information"
  echo "  install <pkg>    Install a package (add import to .typ file)"
}

cmd_search() {
  local query="$1"
  echo "Search Typst Universe:"
  echo "  $REGISTRY/?q=$query"
}

cmd_info() {
  local pkg="$1"
  echo "Package info:"
  echo "  $REGISTRY/preview/$pkg"
}

cmd_install() {
  local pkg="$1"
  echo "Add to your .typ file:"
  echo "  #import \"@preview/$pkg:VERSION\""
  echo ""
  echo "Replace VERSION with the desired version (e.g., 0.1.0)."
  echo "Typst downloads packages automatically on compilation."
  echo ""
  echo "Find available versions at: $REGISTRY/preview/$pkg"
}

case "${1:-}" in
  search)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh search <query>"; exit 1; }
    cmd_search "$1"
    ;;
  info)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh info <pkg>"; exit 1; }
    cmd_info "$1"
    ;;
  install)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh install <pkg>"; exit 1; }
    cmd_install "$1"
    ;;
  *)
    usage
    ;;
esac
