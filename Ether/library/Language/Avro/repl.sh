#!/usr/bin/env bash
set -euo pipefail
echo "Launching Python REPL with Avro imported..."
exec python3 -c "import avro; print('Avro loaded.'); import code; code.interact(local=dict(avro=avro))"
