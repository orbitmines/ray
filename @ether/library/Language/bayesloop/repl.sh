#!/usr/bin/env bash
set -euo pipefail
echo "Launching Python REPL with bayesloop imported..."
exec python3 -c "import bayesloop; print('bayesloop loaded.'); import code; code.interact(local=dict(bayesloop=bayesloop))"
