#!/usr/bin/env bash
set -euo pipefail

REGISTRY="https://alire.ada.dev"

usage() {
  echo "Ada Package Registry (Alire):"
  echo "  $REGISTRY"
  echo
  echo "Usage: packages.sh {search|info|install} <query>"
}

cmd_search() {
  if command -v alr &>/dev/null; then
    alr search "$@"
  else
    echo "https://alire.ada.dev/crates?q=$1"
  fi
}

cmd_info() {
  local pkg="$1"
  if command -v alr &>/dev/null; then
    alr show "$pkg"
  else
    echo "https://alire.ada.dev/crates/$pkg"
  fi
}

cmd_install() {
  local pkg="$1"
  if command -v alr &>/dev/null; then
    echo "Getting via Alire..."
    alr get "$pkg"
  else
    echo "Install Alire first: https://alire.ada.dev"
    echo
    echo "Then run:"
    echo "  alr get $pkg"
    echo
    echo "Or add dependency:"
    echo "  alr with $pkg"
    echo
    echo "Browse: https://alire.ada.dev/crates/$pkg"
  fi
}

case "${1:-}" in
  search)  shift; cmd_search "$@" ;;
  info)    shift; cmd_info "$1" ;;
  install) shift; cmd_install "$1" ;;
  *)       usage ;;
esac
