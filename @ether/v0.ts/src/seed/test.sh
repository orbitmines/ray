#!/bin/bash
# usage: test.sh — reads each *.test.ray after the new entrypoint (@ether/ray/.reader.ray) with the seed
cd "$(dirname "$0")"
L=file://$(cd ../../ && pwd)/node_modules/tsx/dist/loader.mjs
for t in *.test.ray; do echo "== $t"; cat ../../../ray/.reader.ray "$t" > /tmp/seed-test.ray; node --stack-size=20000 --import "$L" run.mts /tmp/seed-test.ray 2>&1 | grep -v '^    at'; done
