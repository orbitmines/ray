#!/usr/bin/env bash
set -euo pipefail
exec python3 -c "
from pyquil import Program
from pyquil.quilbase import DefGate
prog = Program()
prog += open('$1').read()
print(prog)
"
