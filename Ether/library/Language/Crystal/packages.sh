#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Crystal"
REGISTRIES=(
  "Shardbox: https://shardbox.org"
)

show_usage() {
  echo "Package manager for $LANG_NAME"
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
    echo "Visit: https://shardbox.org/search?query=$1"
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    if command -v shards &>/dev/null; then
      shards info "$1" 2>/dev/null || echo "Visit: https://shardbox.org/search?query=$1"
    else
      echo "Visit: https://shardbox.org/search?query=$1"
    fi
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    echo "Add to shard.yml dependencies:"
    echo "  dependencies:"
    echo "    $1:"
    echo "      github: OWNER/$1"
    echo ""
    echo "Then run: shards install"
    echo "Find the repo at: https://shardbox.org/search?query=$1"
    ;;
  *)
    show_usage
    ;;
esac
