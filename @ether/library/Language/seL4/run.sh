#!/usr/bin/env bash
set -euo pipefail
echo "seL4 is a microkernel; source files are compiled as part of a seL4 project."
echo "Use: https://docs.sel4.systems/Tutorials/" >&2
cat "$@"
