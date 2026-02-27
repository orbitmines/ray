#!/usr/bin/env bash
set -euo pipefail

REGISTRIES=(
  "https://fortran-lang.org/packages/"
  "https://github.com/fortran-lang/fpm-registry"
)

usage() {
  echo "Fortran Package Registries:"
  for url in "${REGISTRIES[@]}"; do echo "  $url"; done
  echo
  echo "Usage: packages.sh {search|info|install} <query>"
}

cmd_search() {
  local q="$1"
  if command -v fpm &>/dev/null; then
    fpm list "$q"
  else
    echo "https://fortran-lang.org/packages/?q=$q"
    echo "https://github.com/fortran-lang/fpm-registry/search?q=$q"
  fi
}

cmd_info() {
  local pkg="$1"
  echo "https://fortran-lang.org/packages/$pkg/"
  echo "https://github.com/fortran-lang/$pkg"
}

cmd_install() {
  local pkg="$1"
  if command -v fpm &>/dev/null; then
    echo "Adding via fpm..."
    fpm add "$pkg"
  else
    echo "Install fpm (Fortran Package Manager) first:"
    echo "  https://fpm.fortran-lang.org/install/"
    echo
    echo "Then run:"
    echo "  fpm add $pkg"
    echo
    echo "Or add to fpm.toml:"
    echo "  [dependencies]"
    echo "  $pkg = { git = \"https://github.com/OWNER/$pkg.git\" }"
  fi
}

case "${1:-}" in
  search)  shift; cmd_search "$1" ;;
  info)    shift; cmd_info "$1" ;;
  install) shift; cmd_install "$1" ;;
  *)       usage ;;
esac
