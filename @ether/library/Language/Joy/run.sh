#!/usr/bin/env bash
set -euo pipefail
if command -v joy >/dev/null 2>&1; then
  exec joy "$1"
else
  exec python3 -c "
from joy.library import initialize
from joy.joy import run
with open('$1') as f:
    text = f.read()
stack = run(text, (), initialize())
"
fi
