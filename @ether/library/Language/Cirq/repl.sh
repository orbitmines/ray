#!/usr/bin/env bash
set -euo pipefail
exec python3 -c "import cirq; help(cirq)" 2>/dev/null || python3
