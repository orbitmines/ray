#!/usr/bin/env bash
set -euo pipefail

REGISTRY="https://godotengine.org/asset-library/asset"

usage() {
  echo "GDScript Package Manager (Godot Asset Library)"
  echo ""
  echo "Registry: $REGISTRY"
  echo ""
  echo "Usage: packages.sh <command> [args]"
  echo ""
  echo "Commands:"
  echo "  search <query>   Search for assets"
  echo "  info <asset>     Show asset information"
  echo "  install <asset>  Install an asset"
}

cmd_search() {
  local query="$1"
  echo "Search Godot Asset Library:"
  echo "  $REGISTRY?filter=$query"
}

cmd_info() {
  local asset="$1"
  echo "Asset info:"
  echo "  $REGISTRY?filter=$asset"
  echo ""
  echo "Or search by ID:"
  echo "  $REGISTRY/$asset"
}

cmd_install() {
  local asset="$1"
  echo "Install from Godot Editor > AssetLib tab, or download from:"
  echo "  $REGISTRY?filter=$asset"
  echo ""
  echo "Alternatively, download and extract into your project's addons/ directory."
}

case "${1:-}" in
  search)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh search <query>"; exit 1; }
    cmd_search "$1"
    ;;
  info)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh info <asset>"; exit 1; }
    cmd_info "$1"
    ;;
  install)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh install <asset>"; exit 1; }
    cmd_install "$1"
    ;;
  *)
    usage
    ;;
esac
