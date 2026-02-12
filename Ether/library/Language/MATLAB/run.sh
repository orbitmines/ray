#!/usr/bin/env bash
set -euo pipefail
exec matlab -batch "run('$1')"
