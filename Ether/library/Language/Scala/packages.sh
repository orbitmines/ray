#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Scala"
REGISTRIES=(
  "Maven Central: https://search.maven.org"
  "Scaladex: https://index.scala-lang.org"
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
    echo "Visit: https://index.scala-lang.org/search?q=$1"
    echo "Visit: https://search.maven.org/search?q=$1"
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    echo "Visit: https://index.scala-lang.org/search?q=$1"
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    echo "Add to build.sbt:"
    echo "  libraryDependencies += \"org\" %% \"$1\" % \"version\""
    echo ""
    echo "Or search for exact coordinates at: https://index.scala-lang.org/search?q=$1"
    ;;
  *)
    show_usage
    ;;
esac
