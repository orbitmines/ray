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
  A3)
    rm -f "$out/add.rs"
    ray "$here/io.ray" "$here/c.ray" "$here/rust.o.ray" "$here/a3.ray"
    diff "$here/expected/add.rs" "$out/add.rs"
    echo "A3 out/add.rs matches expected/add.rs"
    ;;
  A4)
    "$0" A3 > /dev/null
    rm -f "$out/main-rs"
    rustc --edition 2021 "$here/main.rs" -o "$out/main-rs"
    if nm "$out/main-rs" | grep -qE ' [A-Za-z] add$'; then echo "A4 main-rs holds a C-ABI add symbol" >&2; exit 1; fi
    test "$(echo "2 3" | "$out/main-rs")" = "5"
    test "$(echo "2147483647 1" | "$out/main-rs")" = "out of domain"
    echo "A4 main-rs built by rustc alone (no C object, no library, no C-ABI add symbol); 2 3 gives 5, 2147483647 1 is out of domain"
    ;;
  A5)
    "$0" S1 > /dev/null
    "$0" A4 > /dev/null
    "$out/main-rs" < "$here/inputs.txt" > "$out/rust.txt"
    diff "$out/oracle.txt" "$out/rust.txt"
    echo "A5 the Rust Ray wrote and the C gcc compiled agree on all $(wc -l < "$out/rust.txt") inputs"
    ;;
  N0) ray "$here/ints.ray" "$here/n0.ray" ;;
  *) echo "usage: run.sh S0|S1|A1|A2|A3|A4|A5|N0" >&2; exit 2 ;;
esac
