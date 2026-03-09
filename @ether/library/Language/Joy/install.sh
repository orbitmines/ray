#!/usr/bin/env bash
set -euo pipefail
# Joy is a concatenative functional programming language.
# The reference implementation is available via Thun (a Python implementation).
# See: https://hypercubed.github.io/joy/
pip install Thun || {
  echo "Failed to install Joy (Thun). Ensure Python/pip is available." >&2
  exit 1
}
