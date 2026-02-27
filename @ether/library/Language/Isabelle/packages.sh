#!/usr/bin/env bash
set -euo pipefail

REGISTRY="https://www.isa-afp.org"

usage() {
  echo "Isabelle Package Registry (Archive of Formal Proofs):"
  echo "  $REGISTRY"
  echo
  echo "Usage: packages.sh {search|info|install} <query>"
}

cmd_search() {
  local q="$1"
  echo "https://www.isa-afp.org/search?q=$q"
}

cmd_info() {
  local pkg="$1"
  echo "https://www.isa-afp.org/entries/$pkg.html"
}

cmd_install() {
  local pkg="$1"
  echo "To use an AFP entry in Isabelle:"
  echo
  echo "  1. Download the AFP: https://www.isa-afp.org/download/"
  echo
  echo "  2. Set AFP as component in etc/settings:"
  echo "     init_component /path/to/afp/thys"
  echo
  echo "  3. Import in your theory:"
  echo "     imports \"$pkg.Theory_Name\""
  echo
  echo "  Entry page: https://www.isa-afp.org/entries/$pkg.html"
}

case "${1:-}" in
  search)  shift; cmd_search "$1" ;;
  info)    shift; cmd_info "$1" ;;
  install) shift; cmd_install "$1" ;;
  *)       usage ;;
esac
