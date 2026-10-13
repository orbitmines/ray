#!/bin/bash
# Fetches the vendors' own descriptions the .asm readers read, into .ether/external/ (not kept in the repository).
# Arm's A64 release is Arm's own licence and is fetched by hand: see ASL/tests/a64.ray.
cd "$(git rev-parse --show-toplevel)" && mkdir -p .ether/external && cd .ether/external || exit 1
fetch () { [ -d "$1" ] || git clone -q --filter=blob:none "$2" "$1"; git -C "$1" checkout -q "$3"; }
fetch riscv-opcodes https://github.com/riscv/riscv-opcodes.git 5783cf3
fetch sail-riscv https://github.com/riscv/sail-riscv.git 0c82ecf
fetch xed https://github.com/intelxed/xed.git 0bcb623
[ -d ghidra ] || { git clone -q --filter=blob:none --sparse https://github.com/NationalSecurityAgency/ghidra.git ghidra && git -C ghidra sparse-checkout set Ghidra/Processors; }
git -C ghidra checkout -q c427352
