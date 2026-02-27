#!/usr/bin/env bash
command -v npx >/dev/null 2>&1 && npx svelte --version >/dev/null 2>&1 || npm list -g svelte >/dev/null 2>&1
