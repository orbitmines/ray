#!/usr/bin/env bash
set -euo pipefail
exec psql -f "$1"
