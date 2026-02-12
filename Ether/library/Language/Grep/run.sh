#!/usr/bin/env bash
set -euo pipefail
exec grep -f "$1"
