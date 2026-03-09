#!/usr/bin/env bash
set -euo pipefail
exec verilator --lint-only "$@"
