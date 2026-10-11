#!/bin/bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
ether="$(cd "$here/../.." && pwd)"
ray() { (ulimit -s unlimited; cd "$ether/v0.ts" && ETHER="$ether" KINDS_AFTER=1 LOAD='$/x86/X86.ray,poc/interop/ints.ray,poc/machine/wrapping.ray,poc/interop/io.ray,poc/interop/write.rust.ray,poc/interop/read.c.ray' STEPS=80000000 node --max-old-space-size=8000 --stack-size=60000 --import tsx "$here/$1" "${@:2}" 2>/dev/null); }
each() {
  local failed=0 count
  count=$(wc -l < "$here/corpus/manifest.txt")
  for start in $(seq 1 25 "$count"); do
    local said
    said=$(RANGE="$start-$((start + 24))" ray machine.mts "$1" || true)
    if [ "$(grep -c '^ok' <<< "$said")" != "$(( count - start + 1 < 25 ? count - start + 1 : 25 ))" ]; then failed=1; grep -v '^ok' <<< "$said" || echo "functions $start to $((start + 24)) stopped"; fi
  done
  [ "$failed" = 0 ] && echo "$2 ($count functions)" || { echo "some failed"; exit 1; }
}
case "${1:-}" in
  MC1) python3 "$here/make.py" --check ;;
  MC2) each rewrite "MC2 every function read and written back byte for byte" ;;
  MC3) each assembly "MC3 every function's text is objdump's, line for line" ;;
  MC4) each lift "MC4 every function lifted from its machine code answers what its C source computes" ;;
  MC5)
    rm -rf "$here/out/rust"
    each rust "Ray wrote Rust from every function's machine code"
    python3 "$here/check.py" "${INPUTS:-30}"
    ;;
  MC6) each assemble "MC6 every function's objdump text, read as Ray, is written as gcc's bytes" ;;
  MC7)
    rm -rf "$here/out/compiled"
    each compile "Ray compiled every function's C into machine code through X86.ray"
    python3 "$here/native.py" "${INPUTS:-30}"
    BYTES="$here/out/compiled" each inverse "MC7 every function's compiled bytes lift back to the function its C was read to"
    ;;
  *) echo "usage: run.sh MC1|MC2|MC3|MC4|MC5|MC6|MC7" >&2; exit 2 ;;
esac
