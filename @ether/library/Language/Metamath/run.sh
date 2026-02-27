#!/usr/bin/env bash
set -euo pipefail
exec metamath "read '$1'" "verify proof *" "exit"
