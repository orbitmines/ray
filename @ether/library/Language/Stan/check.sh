#!/usr/bin/env bash
command -v stanc >/dev/null 2>&1 || python3 -c "import cmdstanpy" 2>/dev/null
