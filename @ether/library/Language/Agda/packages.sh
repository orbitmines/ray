#!/usr/bin/env bash
set -euo pipefail

REGISTRIES=(
  "https://github.com/agda/agda-stdlib"
  "https://github.com/agda/agda-categories"
  "https://github.com/agda/cubical"
)

usage() {
  echo "Agda Package Sources:"
  for url in "${REGISTRIES[@]}"; do echo "  $url"; done
  echo
  echo "Community packages: https://wiki.portal.chalmers.se/agda/pmwiki.php?n=Libraries.Libraries"
  echo
  echo "Usage: packages.sh {search|info|install} <query>"
}

cmd_search() {
  local q="$1"
  echo "https://github.com/search?q=agda+$q&type=repositories"
  echo "https://github.com/agda/agda-stdlib/search?q=$q"
}

cmd_info() {
  local pkg="$1"
  echo "https://github.com/agda/$pkg"
}

cmd_install() {
  local pkg="$1"
  echo "Agda libraries are typically installed manually:"
  echo
  echo "  1. Clone the library:"
  echo "     git clone https://github.com/agda/$pkg.git"
  echo
  echo "  2. Register in ~/.agda/libraries:"
  echo "     /path/to/$pkg/$pkg.agda-lib"
  echo
  echo "  3. Add to ~/.agda/defaults:"
  echo "     $pkg"
  echo
  echo "  Standard library: https://github.com/agda/agda-stdlib"
}

case "${1:-}" in
  search)  shift; cmd_search "$1" ;;
  info)    shift; cmd_info "$1" ;;
  install) shift; cmd_install "$1" ;;
  *)       usage ;;
esac
