#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Julia"
REGISTRIES=(
  "JuliaHub: https://juliahub.com"
  "General Registry: https://github.com/JuliaRegistries/General"
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
    if command -v julia &>/dev/null; then
      julia -e "using Pkg; results = Pkg.Registry.find(\"$1\"); for r in results; println(r); end" 2>/dev/null || echo "Visit: https://juliahub.com/ui/Packages?q=$1"
    else
      echo "Visit: https://juliahub.com/ui/Packages?q=$1"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    echo "Visit: https://juliahub.com/ui/Packages/General/$1"
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    julia -e "using Pkg; Pkg.add(\"$1\")"
    ;;
  *)
    show_usage
    ;;
esac
