#!/usr/bin/env bash
set -euo pipefail
exec elm make "$1"
