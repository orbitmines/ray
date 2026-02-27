#!/usr/bin/env bash
set -euo pipefail
FILE="$1"
BASENAME="$(basename "$FILE" .asm)"
if [[ "$(uname)" == "Darwin" ]]; then
  nasm -f macho64 "$FILE" -o "/tmp/${BASENAME}.o" && \
    ld -macosx_version_min 10.7 -lSystem "/tmp/${BASENAME}.o" -o "/tmp/${BASENAME}" && \
    "/tmp/${BASENAME}"
else
  nasm -f elf64 "$FILE" -o "/tmp/${BASENAME}.o" && \
    ld "/tmp/${BASENAME}.o" -o "/tmp/${BASENAME}" && \
    "/tmp/${BASENAME}"
fi
