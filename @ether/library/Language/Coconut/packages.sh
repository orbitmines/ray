#!/usr/bin/env bash
set -euo pipefail

REGISTRY="https://pypi.org"

usage() {
  echo "Coconut Package Manager (pip / Python ecosystem)"
  echo ""
  echo "Coconut uses the Python/pip ecosystem for package management."
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
  if command -v pip &>/dev/null; then
    pip index versions "$query" 2>/dev/null || echo "Visit: $REGISTRY/search/?q=$query"
  else
    echo "pip not found. Search online:"
    echo "  $REGISTRY/search/?q=$query"
  fi
}

cmd_info() {
  local pkg="$1"
  if command -v pip &>/dev/null; then
    pip show "$pkg" 2>/dev/null || echo "Visit: $REGISTRY/project/$pkg/"
  else
    echo "pip not found. View online:"
    echo "  $REGISTRY/project/$pkg/"
  fi
}

cmd_install() {
  local pkg="$1"
  if command -v pip &>/dev/null; then
    pip install "$pkg"
  else
    echo "pip not found. Install Python first."
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
