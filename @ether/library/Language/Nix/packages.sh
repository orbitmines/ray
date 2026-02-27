#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Nix"
REGISTRIES=(
  "Nix Packages: https://search.nixos.org/packages"
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
    if command -v nix &>/dev/null; then
      nix search nixpkgs "$@" 2>/dev/null || echo "Visit: https://search.nixos.org/packages?query=$1"
    else
      echo "Visit: https://search.nixos.org/packages?query=$1"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    if command -v nix &>/dev/null; then
      nix eval "nixpkgs#$1.meta" --json 2>/dev/null || echo "Visit: https://search.nixos.org/packages?query=$1"
    else
      echo "Visit: https://search.nixos.org/packages?query=$1"
    fi
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    if command -v nix &>/dev/null && nix profile list &>/dev/null; then
      nix profile install "nixpkgs#$1"
    elif command -v nix-env &>/dev/null; then
      nix-env -iA "nixpkgs.$1"
    else
      echo "Nix is not installed. Visit: https://nixos.org/download.html"
    fi
    ;;
  *)
    show_usage
    ;;
esac
