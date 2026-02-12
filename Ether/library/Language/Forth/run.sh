#!/usr/bin/env bash
set -euo pipefail
exec gforth "$1" -e bye
