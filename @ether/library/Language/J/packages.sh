#!/usr/bin/env bash
set -euo pipefail

REGISTRY="https://code.jsoftware.com/wiki/Pacman"

usage() {
  echo "J Package Manager (Addon Manager / Pacman)"
  echo ""
  echo "Registry: $REGISTRY"
  echo ""
  echo "Usage: packages.sh <command> [args]"
  echo ""
  echo "Commands:"
  echo "  search <query>   Search for addons"
  echo "  info <addon>     Show addon information"
  echo "  install <addon>  Install an addon"
}

cmd_search() {
  local query="$1"
  echo "Search J addons:"
  echo "  $REGISTRY"
  echo "  https://code.jsoftware.com/wiki/Addons"
  echo ""
  echo "In the J console, run:"
  echo "  load 'pacman'"
  echo "  showlist ''"
}

cmd_info() {
  local addon="$1"
  echo "Addon: $addon"
  echo "  https://code.jsoftware.com/wiki/Addons"
  echo ""
  echo "In the J console, run:"
  echo "  load 'pacman'"
  echo "  showpkg '$addon'"
}

cmd_install() {
  local addon="$1"
  echo "In the J console, run:"
  echo "  load 'pacman'"
  echo "  install '$addon'"
}

case "${1:-}" in
  search)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh search <query>"; exit 1; }
    cmd_search "$1"
    ;;
  info)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh info <addon>"; exit 1; }
    cmd_info "$1"
    ;;
  install)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh install <addon>"; exit 1; }
    cmd_install "$1"
    ;;
  *)
    usage
    ;;
esac
