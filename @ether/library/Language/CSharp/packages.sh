#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="C#"
REGISTRIES=(
  "NuGet: https://www.nuget.org"
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
    if command -v dotnet &>/dev/null; then
      dotnet package search "$@" 2>/dev/null || echo "Visit: https://www.nuget.org/packages?q=$1"
    else
      echo "Visit: https://www.nuget.org/packages?q=$1"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    echo "Visit: https://www.nuget.org/packages/$1"
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    dotnet add package "$1"
    ;;
  *)
    show_usage
    ;;
esac
