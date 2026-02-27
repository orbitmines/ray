#!/usr/bin/env bash
set -euo pipefail

REGISTRY="https://mesonbuild.com/Wrapdb-projects.html"

usage() {
  echo "Meson Package Manager (WrapDB)"
  echo ""
  echo "Registry: $REGISTRY"
  echo ""
  echo "Usage: packages.sh <command> [args]"
  echo ""
  echo "Commands:"
  echo "  search <query>   Search for wraps"
  echo "  info <wrap>      Show wrap information"
  echo "  install <wrap>   Install a wrap"
}

cmd_search() {
  if command -v meson &>/dev/null; then
    meson wrap search "$@"
  else
    echo "meson not found. Search online:"
    echo "  $REGISTRY"
  fi
}

cmd_info() {
  local wrap="$1"
  if command -v meson &>/dev/null; then
    meson wrap info "$wrap"
  else
    echo "meson not found. View online:"
    echo "  $REGISTRY"
  fi
}

cmd_install() {
  local wrap="$1"
  if command -v meson &>/dev/null; then
    meson wrap install "$wrap"
  else
    echo "meson not found. Install Meson first:"
    echo "  pip install meson"
    echo "  https://mesonbuild.com/Getting-meson.html"
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
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh info <wrap>"; exit 1; }
    cmd_info "$1"
    ;;
  install)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh install <wrap>"; exit 1; }
    cmd_install "$1"
    ;;
  *)
    usage
    ;;
esac
