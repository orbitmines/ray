#!/bin/bash
# each.sh [FILES…] — each ported test on its own (4 at a time, 10 s each): name, exit code, ms
cd "$(dirname "$0")"
ulimit -s unlimited
files=${@:-ported/*.test.ray}
printf '%s\n' $files | xargs -P 4 -I{} bash -c 's=$(date +%s%N); timeout ${T:-10} node --stack-size=60000 --import tsx run.mts ../../../ray/.expression.ray {} > /tmp/claude-1000/-home-fs-Documents-github-com-orbitmines-ray/4e0b9dde-d32b-4766-b1ca-6a50f2201e0f/scratchpad/each_$(basename {}).txt 2>&1; r=$?; e=$(date +%s%N); echo "$(basename {}) $r $(( (e-s)/1000000 ))ms"' | sort | column -c 160
