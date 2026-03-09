#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Ruby"
REGISTRIES=(
  "RubyGems: https://rubygems.org"
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
    if command -v gem &>/dev/null; then
      gem search "$@"
    else
      echo "Visit: https://rubygems.org/search?query=$1"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    if command -v gem &>/dev/null; then
      gem info "$1"
    else
      echo "Visit: https://rubygems.org/gems/$1"
    fi
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    gem install "$1"
    ;;
  *)
    show_usage
    ;;
esac
