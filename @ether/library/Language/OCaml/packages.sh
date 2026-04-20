#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="OCaml"
REGISTRIES=(
  "opam: https://opam.ocaml.org"
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
    if command -v opam &>/dev/null; then
      opam search "$@"
    else
      echo "Visit: https://opam.ocaml.org/packages/?q=$1"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    if command -v opam &>/dev/null; then
      opam show "$1"
    else
      echo "Visit: https://opam.ocaml.org/packages/$1/"
    fi
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    opam install "$1"
    ;;
  *)
    show_usage
    ;;
esac
