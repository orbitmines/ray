#!/usr/bin/env bash
set -euo pipefail

REGISTRY="https://core.tcl-lang.org/tcllib/doc/trunk/embedded/md/toc.md"

usage() {
  echo "Tcl Package Manager (tcllib + Teapot)"
  echo ""
  echo "Registry: $REGISTRY"
  echo ""
  echo "Usage: packages.sh <command> [args]"
  echo ""
  echo "Commands:"
  echo "  search <query>   Search for packages"
  echo "  info <pkg>       Show package information"
  echo "  install <pkg>    Install a package"
}

cmd_search() {
  local query="$1"
  echo "Search tcllib packages:"
  echo "  $REGISTRY"
  echo ""
  echo "Search ActiveState Teapot (if available):"
  if command -v teacup &>/dev/null; then
    teacup search "$query"
  else
    echo "  teacup not found. Visit: https://core.tcl-lang.org/tcllib/"
  fi
}

cmd_info() {
  local pkg="$1"
  echo "Package: $pkg"
  echo "  tcllib docs: $REGISTRY"
  if command -v teacup &>/dev/null; then
    teacup describe "$pkg"
  fi
}

cmd_install() {
  local pkg="$1"
  if command -v teacup &>/dev/null; then
    teacup install "$pkg"
  else
    echo "teacup not found. Install options:"
    echo ""
    echo "  Debian/Ubuntu:  sudo apt install tcllib"
    echo "  macOS (brew):   brew install tcllib"
    echo "  ActiveTcl:      https://www.activestate.com/products/tcl/"
    echo ""
    echo "For individual packages, teacup (from ActiveTcl) is recommended."
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
