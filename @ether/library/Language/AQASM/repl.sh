#!/usr/bin/env bash
set -euo pipefail
exec python3 -c "from qat.lang.AQASM import *; import code; code.interact(local=locals())"
