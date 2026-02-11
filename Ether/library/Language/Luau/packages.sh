#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Luau"
REGISTRIES=(
  "LuaRocks: https://luarocks.org"
)

show_usage() {
  echo "Package manager for $LANG_NAME (uses Lua ecosystem)"
  echo ""
  echo "Registries:"
  for r in "${REGISTRIES[@]}"; do echo "  $r"; done
  echo ""
  echo "Usage: $0 {search|info|install} <package>"
}

cmd="${1:-}"
shift || true

case "$cmd" in
  search)
    [[ $# -eq 0 ]] && { echo "Usage: $0 search <query>"; exit 1; }
    if command -v luarocks &>/dev/null; then
      luarocks search "$@"
    else
      echo "Visit: https://luarocks.org/search?q=$1"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    if command -v luarocks &>/dev/null; then
      luarocks show "$1"
    else
      echo "Visit: https://luarocks.org/modules?q=$1"
    fi
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    luarocks install "$1"
    ;;
  *)
    show_usage
    ;;
esac
