#!/usr/bin/env bash
set -euo pipefail
exec futhark run "$1"
