#!/bin/bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
ether="$(cd "$here/../.." && pwd)"
out="$here/out"
mkdir -p "$out"
ray() { (cd "$ether/v0.ts" && ETHER="$ether" POC="$here" node --stack-size=60000 --import tsx "$here/run.mts" "$@" 2>/dev/null); }
case "${1:-}" in
  S0) ray "$here/s0.ray" ;;
  S1)
    gcc -std=c11 -Wall -Werror "$here/add.c" "$here/oracle.c" -o "$out/oracle-c"
    "$out/oracle-c" < "$here/inputs.txt" > "$out/oracle.txt"
    diff "$here/expected/oracle.txt" "$out/oracle.txt"
    echo "S1 oracle: $(wc -l < "$out/oracle.txt") sums match expected/oracle.txt"
    ;;
  A1) ray "$here/io.ray" "$here/c.ray" "$here/a1.ray" ;;
  A2) ray "$here/io.ray" "$here/c.ray" "$here/a2.ray" ;;
  *) echo "usage: run.sh S0|S1|A1|A2" >&2; exit 2 ;;
esac
