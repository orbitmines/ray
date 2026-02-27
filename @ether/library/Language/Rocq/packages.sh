#!/usr/bin/env bash
set -euo pipefail

REGISTRIES=(
  "https://opam.ocaml.org/packages/"
  "https://github.com/coq-community"
)

usage() {
  echo "Rocq (Coq) Package Registries:"
  for url in "${REGISTRIES[@]}"; do echo "  $url"; done
  echo
  echo "Usage: packages.sh {search|info|install} <query>"
}

cmd_search() {
  local q="$1"
  if command -v opam &>/dev/null; then
    opam search "coq-$q"
  else
    echo "https://opam.ocaml.org/packages/?q=coq-$q"
    echo "https://github.com/coq-community?q=$q"
  fi
}

cmd_info() {
  local pkg="$1"
  if command -v opam &>/dev/null; then
    opam show "coq-$pkg"
  else
    echo "https://opam.ocaml.org/packages/coq-$pkg/"
  fi
}

cmd_install() {
  local pkg="$1"
  if command -v opam &>/dev/null; then
    echo "Installing via opam..."
    opam install "coq-$pkg"
  else
    echo "Install opam first, then run:"
    echo "  opam install coq-$pkg"
    echo
    echo "Or browse: https://opam.ocaml.org/packages/coq-$pkg/"
  fi
}

case "${1:-}" in
  search)  shift; cmd_search "$1" ;;
  info)    shift; cmd_info "$1" ;;
  install) shift; cmd_install "$1" ;;
  *)       usage ;;
esac
