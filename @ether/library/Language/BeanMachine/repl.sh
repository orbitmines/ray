#!/usr/bin/env bash
set -euo pipefail
echo "Launching Python REPL with Bean Machine imported..."
exec python3 -c "import beanmachine; print('Bean Machine loaded.'); import code; code.interact(local=dict(beanmachine=beanmachine))"
