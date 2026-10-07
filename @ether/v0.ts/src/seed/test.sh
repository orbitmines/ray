#!/bin/bash
# usage: test.sh — boots the reader (@ether/ray/.reader.ray) and the language beside it (.entrypoint.ray) with the seed once, then reads each *.test.ray in a scope
# of its own
cd "$(dirname "$0")"
L=file://$(cd ../../ && pwd)/node_modules/tsx/dist/loader.mjs
node --stack-size=20000 --import "$L" run.mts ../../../ray/.reader.ray *.test.ray 2>&1 | grep -v '^    at'
