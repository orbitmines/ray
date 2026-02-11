#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Cadence"
REGISTRIES=(
  "Flow GitHub: https://github.com/onflow"
  "FlowDiver: https://flowdiver.io"
)

show_usage() {
  echo "Package manager for $LANG_NAME"
  echo ""
  echo "Note: Cadence uses Flow's dependency management via flow.json."
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
    echo "Visit: https://github.com/search?q=cadence+$1&type=repositories"
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    echo "Visit: https://github.com/search?q=cadence+$1&type=repositories"
    echo "Check flow.json in the repository for contract details."
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    echo "Add to flow.json contracts section:"
    echo "  \"$1\": { \"source\": \"./contracts/$1.cdc\", \"aliases\": {} }"
    echo ""
    echo "Or install via Flow CLI:"
    echo "  flow dependencies install"
    ;;
  *)
    show_usage
    ;;
esac
