#!/usr/bin/env bash
set -euo pipefail
exec flatc --gen-all "$1"
