#!/usr/bin/env bash
set -euo pipefail
AS=riscv64-linux-gnu-as
LD=riscv64-linux-gnu-ld
command -v "$AS" >/dev/null 2>&1 || { AS=riscv64-unknown-elf-as; LD=riscv64-unknown-elf-ld; }
TMPDIR=$(mktemp -d)
"$AS" -o "$TMPDIR/out.o" "$1"
"$LD" -o "$TMPDIR/out" "$TMPDIR/out.o"
exec qemu-riscv64 "$TMPDIR/out"
