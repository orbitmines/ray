#!/usr/bin/env bash
set -euo pipefail
echo "Apache Velocity is a Java template library, not a standalone runner." >&2
echo "Use it within a Java project." >&2
cat "$1"
