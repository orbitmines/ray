#!/bin/bash
# check.sh — the host type-checked (a field named as a method replaces it silently otherwise)
cd "$(dirname "$0")/../.."
npx tsc --noEmit --ignoreConfig --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --types node src/expression/expression.ts
