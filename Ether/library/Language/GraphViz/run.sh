#!/usr/bin/env bash
set -euo pipefail
exec dot -Tpng -O "$1"
