#!/usr/bin/env bash
set -euo pipefail

REGISTRY="https://www.swi-prolog.org/pack/list"

usage() {
  echo "Prolog Package Manager (SWI-Prolog Pack System)"
  echo ""
  echo "Registry: $REGISTRY"
  echo ""
  echo "Usage: packages.sh <command> [args]"
  echo ""
  echo "Commands:"
  echo "  search <query>   Search for packs"
  echo "  info <pack>      Show pack information"
  echo "  install <pack>   Install a pack"
}

cmd_search() {
  local query="$1"
  if command -v swipl &>/dev/null; then
    swipl -g "pack_search('$query'), halt" 2>/dev/null || echo "Visit: $REGISTRY?p=$query"
  else
    echo "swipl not found. Search online:"
    echo "  $REGISTRY?p=$query"
  fi
}

cmd_info() {
  local pack="$1"
  echo "Pack info: $REGISTRY?p=$pack"
}

cmd_install() {
  local pack="$1"
  if command -v swipl &>/dev/null; then
    swipl -g "pack_install('$pack', [interactive(false)]), halt"
  else
    echo "swipl not found. Install SWI-Prolog first."
    exit 1
  fi
}

case "${1:-}" in
  search)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh search <query>"; exit 1; }
    cmd_search "$1"
    ;;
  info)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh info <pack>"; exit 1; }
    cmd_info "$1"
    ;;
  install)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh install <pack>"; exit 1; }
    cmd_install "$1"
    ;;
  *)
    usage
    ;;
esac
