#!/bin/bash
# The fast tier: each kind of claim of the three proofs once, on a few cases, in a few processes (each boots the language,
# about 11 s). The full corpora are `deflate/run.sh`, `interop/run.sh` and `machine/run.sh`, run before a step is called done.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
ether="$(cd "$here/.." && pwd)"
started=$(date +%s)
failed=0
ray() { (ulimit -s unlimited; cd "$ether/v0.ts" && ETHER="$ether" POC="$here/interop" KINDS_AFTER=1 STEPS=80000000 node --max-old-space-size=8000 --stack-size=60000 --import tsx "$@" 2>/dev/null); }
said() { local name="$1" out="$2"; local bad; bad=$(grep -c '^FAIL' <<< "$out"); local good; good=$(grep -c '^ok' <<< "$out"); [ "$bad" = 0 ] && [ "$good" -gt 0 ] || failed=1; printf '%-44s %3s ok %3s failed %4ss\n' "$name" "$good" "$bad" "$(( $(date +%s) - started ))"; grep '^FAIL' <<< "$out" | head -3; }
said "DEFLATE probes and RFC cases (DP0, DP2)" "$(LOAD='$/Deflate.project.ray' ray "$here/deflate/run.mts" "$here/deflate/dp0.ray" "$here/deflate/dp2.ray")"
said "DEFLATE rejects (DP6)" "$(LOAD='$/Deflate.project.ray' ray "$here/deflate/corpus.mts" reject)"
said "DEFLATE stored and fixed streams (DP3, DP4)" "$(ONLY=hello.txt.0.default,hello.txt.1.default,one.txt.1.default LOAD='$/Deflate.project.ray' ray "$here/deflate/corpus.mts" read; ONLY=hello.txt.0.default,hello.txt.1.default LOAD='$/Deflate.project.ray' ray "$here/deflate/corpus.mts" rewrite)"
said "interop C and Python readers (N0, N1, N2)" "$(ray "$here/interop/run.mts" "$here/interop/ints.ray" "$here/interop/n0.ray" "$here/interop/io.ray" "$here/interop/read.c.ray" "$here/interop/n1.ray" "$here/interop/read.python.ray" "$here/interop/n2.ray")"
python3 "$here/machine/make.py" --check > /dev/null || { failed=1; echo "MC1 the corpus moved"; }
said "machine code, 8 functions (MC2, MC3, MC4, MC6)" "$(RANGE=1-8 LOAD='$/x86/X86.ray,poc/interop/ints.ray,poc/machine/wrapping.ray' ray "$here/machine/machine.mts" rewrite,assembly,lift,assemble)"
rm -rf "$here/machine/out/rust"
said "machine code to Rust, 8 functions (MC5)" "$(RANGE=1-8 LOAD='$/x86/X86.ray,poc/interop/ints.ray,poc/machine/wrapping.ray,poc/interop/io.ray,poc/interop/write.rust.ray' ray "$here/machine/machine.mts" rust)"
said "  linked against gcc's objects" "$(python3 "$here/machine/check.py" 30 8 | sed 's/^MC5/ok   MC5/')"
rm -rf "$here/machine/out/compiled"
said "C compiled to machine code by Ray, 8 functions (MC7)" "$(RANGE=1-8 LOAD='$/x86/X86.ray,poc/interop/ints.ray,poc/machine/wrapping.ray,poc/interop/io.ray,poc/interop/read.c.ray' ray "$here/machine/machine.mts" compile)"
said "  run natively against gcc's objects" "$(python3 "$here/machine/native.py" 30 8 | sed 's/^MC7/ok   MC7/')"
said "  read back and lifted to the same function" "$(BYTES="$here/machine/out/compiled" RANGE=1-8 LOAD='$/x86/X86.ray,poc/interop/ints.ray,poc/machine/wrapping.ray,poc/interop/io.ray,poc/interop/read.c.ray' ray "$here/machine/machine.mts" inverse)"
echo "quick tier $([ "$failed" = 0 ] && echo passed || echo FAILED) in $(( $(date +%s) - started ))s"
exit $failed
