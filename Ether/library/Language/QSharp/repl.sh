#!/usr/bin/env bash
set -euo pipefail
exec python3 -c "import qsharp; qsharp.init(); import code; code.interact(local={'qsharp': qsharp})"
