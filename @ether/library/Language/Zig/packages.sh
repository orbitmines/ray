#!/usr/bin/env bash
set -euo pipefail

REGISTRIES=(
  "https://astrolabe.pm"
  "https://github.com/zigtools"
)

usage() {
  echo "Zig Package Registries:"
  for url in "${REGISTRIES[@]}"; do echo "  $url"; done
  echo
  echo "Usage: packages.sh {search|info|install} <query>"
}

cmd_search() {
  local q="$1"
  echo "https://astrolabe.pm/?q=$q"
}

cmd_info() {
  local pkg="$1"
  echo "https://astrolabe.pm/packages/$pkg"
}

cmd_install() {
  local pkg="$1"
  echo "Add to build.zig.zon dependencies:"
  echo
  echo "  .dependencies = .{"
  echo "      .$pkg = .{"
  echo "          .url = \"https://github.com/OWNER/$pkg/archive/REF.tar.gz\","
  echo "          .hash = \"...\","
  echo "      },"
  echo "  },"
  echo
  echo "Then in build.zig:"
  echo "  const dep = b.dependency(\"$pkg\", .{});"
  echo
  echo "Find packages: https://astrolabe.pm/?q=$pkg"
}

case "${1:-}" in
  search)  shift; cmd_search "$1" ;;
  info)    shift; cmd_info "$1" ;;
  install) shift; cmd_install "$1" ;;
  *)       usage ;;
esac
