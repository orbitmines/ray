#!/usr/bin/env bash
set -euo pipefail
exec sbcl --script "$1"
