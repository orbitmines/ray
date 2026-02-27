#!/usr/bin/env bash
set -euo pipefail
exec sqlite3 < "$@"
