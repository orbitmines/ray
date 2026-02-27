#!/usr/bin/env bash
set -euo pipefail
exec mmdc -i "$1" -o "${1%.mmd}.svg"
