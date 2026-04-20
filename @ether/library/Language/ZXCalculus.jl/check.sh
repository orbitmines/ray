#!/usr/bin/env bash
set -euo pipefail
command -v julia >/dev/null 2>&1 && julia -e 'using ZXCalculus' 2>/dev/null
