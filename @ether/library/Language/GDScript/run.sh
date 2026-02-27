#!/usr/bin/env bash
set -euo pipefail
exec godot --headless --script "$@"
