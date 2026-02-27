#!/usr/bin/env bash
set -euo pipefail
FILE="$1"
BASE="${FILE%.*}"
if command -v aarch64-linux-gnu-as &>/dev/null; then
  aarch64-linux-gnu-as -o "$BASE.o" "$FILE"
  aarch64-linux-gnu-ld -o "$BASE" "$BASE.o"
  exec qemu-aarch64 -L /usr/aarch64-linux-gnu "$BASE"
elif command -v arm-linux-gnueabihf-as &>/dev/null; then
  arm-linux-gnueabihf-as -o "$BASE.o" "$FILE"
  arm-linux-gnueabihf-ld -o "$BASE" "$BASE.o"
  exec qemu-arm -L /usr/arm-linux-gnueabihf "$BASE"
else
  echo "No ARM assembler found." >&2; exit 1
fi
