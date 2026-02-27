#!/usr/bin/env bash
set -euo pipefail
FILE="$1"
BASENAME="$(basename "$FILE" .asm)"
nasm -f elf32 "$FILE" -o "/tmp/${BASENAME}.o" && \
  ld -m elf_i386 "/tmp/${BASENAME}.o" -o "/tmp/${BASENAME}" && \
  "/tmp/${BASENAME}"
