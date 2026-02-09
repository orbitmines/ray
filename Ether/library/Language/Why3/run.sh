#!/usr/bin/env bash
set -euo pipefail
exec why3 prove "$1"
