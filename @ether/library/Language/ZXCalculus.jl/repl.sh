#!/usr/bin/env bash
set -euo pipefail
exec julia -e 'using ZXCalculus; Base.run_main_repl(true, true, true, true, false)'
