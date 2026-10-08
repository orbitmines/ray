#!/bin/bash
# libq.sh — the whole library read as one project: time, diagnostics per file, and the most common diagnostics
cd "$(dirname "$0")"
S=/tmp/claude-1000/-home-fs-Documents-github-com-orbitmines-ray/4e0b9dde-d32b-4766-b1ca-6a50f2201e0f/scratchpad
ulimit -s unlimited
LIMIT=${LIMIT:-200} timeout ${T:-600} node --max-semi-space-size=64 --max-old-space-size=4000 --stack-size=60000 --import tsx lib.mts "$@" > $S/lib_all.txt 2>&1; echo "exit $?" >> $S/lib_all.txt
grep -v "^     " $S/lib_all.txt | tr '\n' ';' | sed 's/  */ /g'; echo
awk '/diagnostics$/{f=$1} /^     /{print f": "$0}' $S/lib_all.txt | sed -E 's/ +/ /g' > $S/lib_diags.txt
