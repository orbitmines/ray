#!/usr/bin/env bash
set -euo pipefail
DIR="$(dirname "$1")"
ponyc "$DIR"
exec "$DIR/$(basename "$DIR")"
