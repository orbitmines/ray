#!/usr/bin/env bash
set -euo pipefail

LANG_NAME="Perl"
REGISTRIES=(
  "MetaCPAN: https://metacpan.org"
  "CPAN: https://www.cpan.org"
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
    if command -v cpan &>/dev/null; then
      cpan -D "$1" 2>/dev/null || echo "Visit: https://metacpan.org/search?q=$1"
    else
      echo "Visit: https://metacpan.org/search?q=$1"
    fi
    ;;
  info)
    [[ $# -eq 0 ]] && { echo "Usage: $0 info <package>"; exit 1; }
    if command -v perldoc &>/dev/null; then
      perldoc "$1" 2>/dev/null || echo "Visit: https://metacpan.org/pod/$1"
    else
      echo "Visit: https://metacpan.org/pod/$1"
    fi
    ;;
  install)
    [[ $# -eq 0 ]] && { echo "Usage: $0 install <package>"; exit 1; }
    if command -v cpanm &>/dev/null; then
      cpanm "$1"
    elif command -v cpan &>/dev/null; then
      cpan "$1"
    else
      echo "Install cpanminus first: curl -L https://cpanmin.us | perl - --sudo App::cpanminus"
    fi
    ;;
  *)
    show_usage
    ;;
esac
