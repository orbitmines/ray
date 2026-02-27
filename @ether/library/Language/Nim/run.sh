#!/usr/bin/env bash
set -euo pipefail
file="$1"
nim compile --run "$file"
