#!/bin/bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
ether="$(cd "$here/../.." && pwd)"
ray() { (ulimit -s unlimited; cd "$ether/v0.ts" && ETHER="$ether" KINDS_AFTER=1 LOAD='$/deflate/Deflate.ray' STEPS=80000000 node --max-old-space-size=12000 --stack-size=60000 --import tsx "$here/$1" "${@:2}" 2>/dev/null); }
each() {
  local failed=0
  for name in $(cut -d' ' -f1 "$here/corpus/manifest.txt"); do ONLY="$name" ray corpus.mts "$1" | grep -E '^(ok|FAIL)' || failed=1; done
  [ "$failed" = 0 ] && echo "$2" || { echo "some failed"; exit 1; }
}
case "${1:-}" in
  DP0) ray run.mts "$here/dp0.ray" ;;
  DP1) python3 "$here/make.py" --check ;;
  DP2) ray run.mts "$here/dp2.ray" ;;
  DP3) each read "DP3 every corpus stream read to what zlib inflates it to" ;;
  DP4) each rewrite "DP4 every corpus stream written back byte for byte" ;;
  DP5)
    ray run.mts "$here/dp5.ray"
    failed=0
    for name in $(ls "$here/inputs"); do ONLY="$name" ray corpus.mts write | grep -E '^(ok|FAIL)' || failed=1; done
    [ "$failed" = 0 ] && echo "DP5 every input written so zlib, and Ray, read it back" || { echo "some failed"; exit 1; }
    ;;
  DP6) ray corpus.mts reject ;;
  *) echo "usage: run.sh DP0|DP1|DP2|DP3|DP4|DP5|DP6" >&2; exit 2 ;;
esac
