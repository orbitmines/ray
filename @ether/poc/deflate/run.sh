#!/bin/bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
ether="$(cd "$here/../.." && pwd)"
ray() { (ulimit -s unlimited; cd "$ether/v0.ts" && ETHER="$ether" KINDS_AFTER=1 LOAD='$/deflate/Deflate.ray' STEPS=80000000 node --max-old-space-size=12000 --stack-size=60000 --import tsx "$here/$1" "${@:2}" 2>/dev/null); }
case "${1:-}" in
  DP0) ray run.mts "$here/dp0.ray" ;;
  DP1) python3 "$here/make.py" --check ;;
  DP2) ray run.mts "$here/dp2.ray" ;;
  DP3) ray corpus.mts read ;;
  DP4) ray corpus.mts rewrite ;;
  *) echo "usage: run.sh DP0|DP1|DP2|DP3|DP4" >&2; exit 2 ;;
esac
