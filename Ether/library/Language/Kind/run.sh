#!/usr/bin/env bash
set -euo pipefail
exec kind run "$1"
