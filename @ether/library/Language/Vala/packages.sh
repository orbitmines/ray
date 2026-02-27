#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  search)
    shift
    [[ $# -lt 1 ]] && { echo "Usage: packages.sh search <query>"; exit 1; }
    echo "Vala uses system libraries via pkg-config."
    echo "Search Valadoc:"
    echo "  https://valadoc.org/search?q=$1"
    ;;
  *)
    echo "Vala uses system libraries via pkg-config."
    echo "Browse GNOME libraries: https://valadoc.org"
    ;;
esac
