#!/usr/bin/env bash
set -euo pipefail
exec bsc -sim -g mkTb -u "$1"
