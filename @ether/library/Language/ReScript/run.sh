#!/usr/bin/env bash
set -euo pipefail
exec rescript build && node "$1"
