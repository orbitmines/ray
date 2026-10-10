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
  N1) ray "$here/io.ray" "$here/ints.ray" "$here/read.c.ray" "$here/n1.ray" ;;
  N2) ray "$here/io.ray" "$here/ints.ray" "$here/read.python.ray" "$here/n2.ray" ;;
  N3)
    rm -rf "$out/corpus"
    python3 "$here/gen.py" --count "${COUNT:-40}" --seed "${SEED:-1}" --mutate "${MUTATE:-0}" --out "$out/corpus"
    ray "$here/io.ray" "$here/ints.ray" "$here/read.c.ray" "$here/read.python.ray" "$out/corpus/claims.ray" > "$out/n3.txt" || true
    grep "^FAIL" "$out/n3.txt" || true
    echo "N3 $(grep -c '^ok' "$out/n3.txt") ok, $(grep -c '^FAIL' "$out/n3.txt") failed, over ${COUNT:-40} functions (seed ${SEED:-1})"
    ! grep -q "^FAIL" "$out/n3.txt"
    ;;
  N4)
    rm -rf "$out/corpus"
    python3 "$here/gen.py" --count "${COUNT:-40}" --seed "${SEED:-1}" --out "$out/corpus"
    ray "$here/io.ray" "$here/ints.ray" "$here/read.c.ray" "$here/write.rust.ray" "$out/corpus/writes.ray" > /dev/null || true
    python3 "$here/check.py" --corpus "$out/corpus" --inputs "${INPUTS:-30}" --seed "${SEED:-1}"
    ;;
  N5)
    rm -rf "$out/corpus"
    python3 "$here/gen.py" --count "${COUNT:-40}" --seed "${SEED:-1}" --out "$out/corpus"
    ray "$here/io.ray" "$here/ints.ray" "$here/read.python.ray" "$here/write.c.ray" "$out/corpus/writes_c.ray" > /dev/null || true
    python3 "$here/check.py" --corpus "$out/corpus" --inputs "${INPUTS:-30}" --seed "${SEED:-1}" --track b
    ;;
  N6)
    "$0" S1 > /dev/null
    rm -f "$out/add.abi.rs"
    ray "$here/io.ray" "$here/ints.ray" "$here/read.c.ray" "$here/write.rust.ray" "$here/n6.ray" > /dev/null || true
    rustc --edition 2021 --crate-type staticlib --crate-name ray_add -O "$out/add.abi.rs" -o "$out/libadd.a"
    gcc "$here/oracle.c" "$out/libadd.a" -lpthread -ldl -lm -o "$out/oracle-rust"
    "$out/oracle-rust" < "$here/inputs.txt" > "$out/oracle-rust.txt"
    diff "$here/expected/oracle.txt" "$out/oracle-rust.txt"
    echo "N6 the unchanged oracle.c linked to Ray's Rust add (no add.c) prints expected/oracle.txt"
    rm -rf "$out/corpus"
    python3 "$here/gen.py" --count "${COUNT:-40}" --seed "${SEED:-1}" --out "$out/corpus"
    ray "$here/io.ray" "$here/ints.ray" "$here/read.c.ray" "$here/write.rust.ray" "$out/corpus/writes_abi.ray" > /dev/null || true
    python3 "$here/check.py" --corpus "$out/corpus" --inputs "${INPUTS:-30}" --seed "${SEED:-1}" --track drop
    ;;
  *) echo "usage: run.sh S0|S1|A1|A2|A3|A4|A5|N0|N1|N2|N3|N4|N5|N6" >&2; exit 2 ;;
esac
