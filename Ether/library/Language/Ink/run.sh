#!/usr/bin/env bash
set -euo pipefail
exec cargo contract build "$@"
