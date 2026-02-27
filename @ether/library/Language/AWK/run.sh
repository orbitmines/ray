#!/usr/bin/env bash
set -euo pipefail
exec awk -f "$1"
