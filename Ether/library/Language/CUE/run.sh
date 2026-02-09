#!/usr/bin/env bash
set -euo pipefail
exec cue eval "$1"
