#!/bin/bash
# libeach.sh — each library file read on its own (4 at a time, T s): exit, ms, diagnostics
cd "$(dirname "$0")"
S=/tmp/claude-1000/-home-fs-Documents-github-com-orbitmines-ray/4e0b9dde-d32b-4766-b1ca-6a50f2201e0f/scratchpad
ulimit -s unlimited
ls ../../../ray/*.ray | xargs -n1 basename | xargs -P 4 -I{} bash -c 's=$(date +%s%N); timeout ${T:-20} node --stack-size=60000 --import tsx lib.mts {} > '$S'/lib_{}.txt 2>&1; r=$?; e=$(date +%s%N); echo "{} $r $(( (e-s)/1000000 ))ms $(grep -o "[0-9]* diagnostics" '$S'/lib_{}.txt | tail -1)"' | sort | column -c 170
