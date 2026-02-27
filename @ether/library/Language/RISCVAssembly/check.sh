#!/usr/bin/env bash
set -euo pipefail
command -v riscv64-linux-gnu-as >/dev/null 2>&1 || command -v riscv64-unknown-elf-as >/dev/null 2>&1
