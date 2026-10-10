#!/bin/bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
ether="$(cd "$here/../.." && pwd)"
case "${1:-}" in
  S0) cd "$ether/v0.ts" && ETHER="$ether" node --stack-size=60000 --import tsx "$here/run.mts" "$here/s0.ray" 2>/dev/null ;;
  *) echo "usage: run.sh S0" >&2; exit 2 ;;
esac
