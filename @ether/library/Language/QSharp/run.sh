#!/usr/bin/env bash
set -euo pipefail
exec python3 -c "
import qsharp
qsharp.eval(open('$1').read())
"
