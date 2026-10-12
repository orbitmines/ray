#!/bin/bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
ether="$(cd "$here/../.." && pwd)"
ray() { (ulimit -s unlimited; cd "$ether/v0.ts" && ETHER="$ether" KINDS_AFTER=1 LOAD='$/x86/X86.ray,poc/interop/ints.ray,poc/interop/io.ray,poc/interop/write.rust.ray,poc/interop/read.c.ray,poc/interop/memory.ray' STEPS=${STEPS:-80000000} node --max-old-space-size=${HEAP_MB:-8000} --stack-size=60000 --import tsx "$here/$1" "${@:2}" 2>/dev/null); }
each() {
  local failed=0 count
  count=$(wc -l < "$here/${CORPUS:-corpus}/manifest.txt")
  local chunk="${CHUNK:-25}"
  for start in $(seq 1 "$chunk" "$count"); do
    local said
    said=$(RANGE="$start-$((start + chunk - 1))" ray machine.mts "$1" || true)
    if [ "$(grep -c '^ok' <<< "$said")" != "$(( (count - start + 1 < chunk ? count - start + 1 : chunk) * $(tr ',' '\n' <<< "$1" | wc -l) ))" ]; then failed=1; grep -v '^ok' <<< "$said" || echo "functions $start to $((start + chunk - 1)) stopped"; fi
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
  MC8a) python3 "$here/flow.py" --check ;;
  MC8b) CORPUS=corpus_flow each rewrite,assembly "MC8b every flow function read, written back byte for byte, its text objdump's" ;;
  MC8c) CORPUS=corpus_flow each flow "MC8c every flow function lifted to Ray with its jumps prints what gcc's object prints" ;;
  MC8d)
    rm -rf "$here/out/compiled_flow"
    CORPUS=corpus_flow each compile_flow "Ray compiled every flow function it lifted back into machine code through X86.ray"
    python3 "$here/native.py" --flow
    BYTES="$here/out/compiled_flow" CORPUS=corpus_flow each flow "MC8d every flow function Ray compiled lifts back and prints what gcc's object prints"
    ;;
  MC9a) python3 "$here/memory.py" --check ;;
  MC9b) CORPUS=corpus_memory each rewrite,assembly "MC9b every memory function read, written back byte for byte, its text objdump's" ;;
  MC9c) CORPUS=corpus_memory each memory_flow "MC9c every memory function lifted to Ray, its memory a list of bytes, prints what gcc's object prints" ;;
  MC9d)
    rm -rf "$here/out/compiled_memory"
    CORPUS=corpus_memory each compile_flow "Ray compiled every memory function it lifted back into machine code through X86.ray"
    python3 "$here/native.py" --memory
    BYTES="$here/out/compiled_memory" CORPUS=corpus_memory each memory_flow "MC9d every memory function Ray compiled lifts back and prints what gcc's object prints"
    ;;
  MC10a) python3 "$here/inflate/make.py" --check ;;
  MC10b|MC10c)
    mode=$([ "$1" = MC10b ] && echo rewrite,assembly || echo program)
    said=$(CORPUS=inflate STEPS=800000000 HEAP_MB=40000 ray machine.mts "$mode" || true)
    grep -v '^ok' <<< "$said" || true
    if grep -q '^FAIL' <<< "$said" || ! grep -q '^ok' <<< "$said"; then echo "$1 failed"; exit 1; fi
    [ "$1" = MC10b ] && echo "MC10b inflate (4615 bytes) read, written back byte for byte, its text objdump's" || echo "MC10c inflate lifted to Ray, five functions calling each other on one memory, decodes the DEFLATE corpus as gcc's object does and rejects the bad streams"
    ;;
  *) echo "usage: run.sh MC1|MC2|MC3|MC4|MC5|MC6|MC7|MC8a|MC8b|MC8c|MC8d|MC9a|MC9b|MC9c|MC9d|MC10a|MC10b|MC10c" >&2; exit 2 ;;
esac
