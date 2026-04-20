#!/usr/bin/env bash
set -euo pipefail
chpl "$1" -o /tmp/chapel_out && /tmp/chapel_out
