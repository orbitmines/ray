#!/usr/bin/env bash
set -euo pipefail

REGISTRY="https://reservoir.lean-lang.org"

usage() {
  echo "Lean Package Registry:"
  echo "  $REGISTRY"
  echo
  echo "Usage: packages.sh {search|info|install} <query>"
}

cmd_search() {
  local q="$1"
  echo "https://reservoir.lean-lang.org/?q=$q"
}

cmd_info() {
  local pkg="$1"
  echo "https://reservoir.lean-lang.org/packages/$pkg"
}

cmd_install() {
  local pkg="$1"
  echo "Add to lakefile.lean:"
  echo
  echo "  require $pkg from git"
  echo "    \"https://github.com/OWNER/$pkg\" @ \"main\""
  echo
  echo "Then run: lake update"
  echo
  echo "Find package details: https://reservoir.lean-lang.org/?q=$pkg"
}

case "${1:-}" in
  search)  shift; cmd_search "$1" ;;
  info)    shift; cmd_info "$1" ;;
  install) shift; cmd_install "$1" ;;
  *)       usage ;;
esac
