#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Clojure"
REGISTRIES=(
  "Clojars: https://clojars.org"
  "Maven Central: https://search.maven.org"
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
    if command -v lein &>/dev/null; then
      lein search "$@"
    else
      echo "Visit: https://clojars.org/search?q=$1"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    echo "Visit: https://clojars.org/$1"
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    echo "Add to deps.edn:"
    echo "  :deps {$1/$ {:mvn/version \"VERSION\"}}"
    echo ""
    echo "Or add to project.clj:"
    echo "  [$1 \"VERSION\"]"
    echo ""
    echo "Find the version at: https://clojars.org/$1"
    ;;
  *)
    show_usage
    ;;
esac
