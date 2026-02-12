#!/usr/bin/env bash
set -euo pipefail
exec node -e "const {run} = require('@cycle/run'); console.log('Cycle.js loaded.'); require('repl').start('cycle> ')"
