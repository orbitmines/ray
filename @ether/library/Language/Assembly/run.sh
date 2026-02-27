#!/usr/bin/env bash
set -euo pipefail
FILE="$1"
BASE="${FILE%.*}"
if command -v nasm &>/dev/null; then
  nasm -f elf64 -o "$BASE.o" "$FILE"
  ld -o "$BASE" "$BASE.o"
  exec "$BASE"
elif command -v yasm &>/dev/null; then
  yasm -f elf64 -o "$BASE.o" "$FILE"
  ld -o "$BASE" "$BASE.o"
  exec "$BASE"
else
  as -o "$BASE.o" "$FILE"
  ld -o "$BASE" "$BASE.o"
  exec "$BASE"
fi
