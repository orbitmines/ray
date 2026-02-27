#!/usr/bin/env bash
set -euo pipefail
echo "Launching Python REPL with bayeslite imported..."
exec python3 -c "import bayeslite; print('bayeslite loaded.'); import code; code.interact(local=dict(bayeslite=bayeslite))"
