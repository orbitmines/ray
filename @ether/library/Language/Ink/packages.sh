#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="ink!"
REGISTRIES=(
  "crates.io (Rust ecosystem): https://crates.io"
)

show_usage() {
  echo "Package manager for $LANG_NAME"
  echo ""
  echo "Note: ink! uses the Rust/Cargo ecosystem."
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
    if command -v cargo &>/dev/null; then
      cargo search ink-"$@"
    else
      echo "Visit: https://crates.io/search?q=ink-$1"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    echo "Visit: https://crates.io/crates/$1"
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    echo "Add to Cargo.toml [dependencies]:"
    echo "  $1 = \"VERSION\""
    echo ""
    echo "Then run: cargo build"
    ;;
  *)
    show_usage
    ;;
esac
