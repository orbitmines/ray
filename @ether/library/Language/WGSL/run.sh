#!/usr/bin/env bash
set -euo pipefail
# WGSL is a shader language; naga can validate it
exec naga "$1"
