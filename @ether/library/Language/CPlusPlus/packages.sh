#!/usr/bin/env bash
set -euo pipefail

REGISTRIES=(
  "https://conan.io/center"
  "https://vcpkg.io/en/packages"
)

usage() {
  echo "C++ Package Registries:"
  for url in "${REGISTRIES[@]}"; do echo "  $url"; done
  echo
  echo "Usage: packages.sh {search|info|install} <query>"
}

cmd_search() {
  local q="$1"
  echo "https://conan.io/center?search=$q"
  echo "https://vcpkg.io/en/packages?query=$q"
}

cmd_info() {
  local pkg="$1"
  echo "https://conan.io/center/recipes/$pkg"
  echo "https://vcpkg.io/en/package/$pkg"
}

cmd_install() {
  local pkg="$1"
  if command -v conan &>/dev/null; then
    echo "Installing via Conan..."
    conan install "$pkg"
  elif command -v vcpkg &>/dev/null; then
    echo "Installing via vcpkg..."
    vcpkg install "$pkg"
  else
    echo "No package manager found. Install manually:"
    echo "  Conan:  https://conan.io/center/recipes/$pkg"
    echo "  vcpkg:  https://vcpkg.io/en/package/$pkg"
  fi
}

case "${1:-}" in
  search)  shift; cmd_search "$1" ;;
  info)    shift; cmd_info "$1" ;;
  install) shift; cmd_install "$1" ;;
  *)       usage ;;
esac
