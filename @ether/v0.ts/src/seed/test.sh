#!/bin/bash
# usage: test.sh — boots the new entrypoint (@ether/ray/.reader.ray) with the seed, then reads each *.test.ray in a scope of its own
cd "$(dirname "$0")"
L=file://$(cd ../../ && pwd)/node_modules/tsx/dist/loader.mjs
for t in *.test.ray; do echo "== $t"; node --stack-size=20000 --import "$L" run.mts ../../../ray/.reader.ray "$t" 2>&1 | grep -v '^    at'; done
