#!/usr/bin/env bash
set -euo pipefail

REGISTRY="https://lib.haxe.org"

usage() {
  echo "Haxe Package Manager (haxelib)"
  echo ""
  echo "Registry: $REGISTRY"
  echo ""
  echo "Usage: packages.sh <command> [args]"
  echo ""
  echo "Commands:"
  echo "  search <query>   Search for libraries"
  echo "  info <lib>       Show library information"
  echo "  install <lib>    Install a library"
}

cmd_search() {
  if command -v haxelib &>/dev/null; then
    haxelib search "$@"
  else
    echo "haxelib not found. Search online:"
    echo "  $REGISTRY"
  fi
}

cmd_info() {
  local lib="$1"
  if command -v haxelib &>/dev/null; then
    haxelib info "$lib"
  else
    echo "haxelib not found. View online:"
    echo "  $REGISTRY/p/$lib"
  fi
}

cmd_install() {
  local lib="$1"
  if command -v haxelib &>/dev/null; then
    haxelib install "$lib"
  else
    echo "haxelib not found. Install Haxe first:"
    echo "  https://haxe.org/download/"
  fi
}

case "${1:-}" in
  search)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh search <query>"; exit 1; }
    cmd_search "$@"
    ;;
  info)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh info <lib>"; exit 1; }
    cmd_info "$1"
    ;;
  install)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh install <lib>"; exit 1; }
    cmd_install "$1"
    ;;
  *)
    usage
    ;;
esac
