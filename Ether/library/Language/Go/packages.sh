#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Go"
REGISTRIES=(
  "pkg.go.dev: https://pkg.go.dev"
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
    echo "Visit: https://pkg.go.dev/search?q=$1"
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    go list -m -json "$1"@latest 2>/dev/null || echo "Visit: https://pkg.go.dev/$1"
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    go install "$1"@latest
    ;;
  *)
    show_usage
    ;;
esac
