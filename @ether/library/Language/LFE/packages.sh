#!/usr/bin/env bash
set -euo pipefail

REGISTRY="https://hex.pm"

usage() {
  echo "LFE Package Manager (hex.pm / Erlang ecosystem)"
  echo ""
  echo "LFE (Lisp Flavoured Erlang) uses the Erlang/hex ecosystem."
  echo ""
  echo "Registry: $REGISTRY"
  echo ""
  echo "Usage: packages.sh <command> [args]"
  echo ""
  echo "Commands:"
  echo "  search <query>   Search for packages"
  echo "  info <pkg>       Show package information"
  echo "  install <pkg>    Install a package"
}

cmd_search() {
  if command -v rebar3 &>/dev/null; then
    rebar3 hex search "$@"
  else
    local query="$1"
    echo "rebar3 not found. Search online:"
    echo "  $REGISTRY/packages?search=$query"
  fi
}

cmd_info() {
  local pkg="$1"
  echo "Package info:"
  echo "  $REGISTRY/packages/$pkg"
}

cmd_install() {
  local pkg="$1"
  echo "Add to your rebar.config deps:"
  echo ""
  echo "  {deps, ["
  echo "    {$pkg, \"VERSION\"}"
  echo "  ]}."
  echo ""
  echo "Then run: rebar3 get-deps"
  echo ""
  echo "Find available versions at: $REGISTRY/packages/$pkg"
}

case "${1:-}" in
  search)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh search <query>"; exit 1; }
    cmd_search "$@"
    ;;
  info)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh info <pkg>"; exit 1; }
    cmd_info "$1"
    ;;
  install)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh install <pkg>"; exit 1; }
    cmd_install "$1"
    ;;
  *)
    usage
    ;;
esac
