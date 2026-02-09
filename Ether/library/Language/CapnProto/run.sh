#!/usr/bin/env bash
set -euo pipefail
exec capnp compile -o- "$1"
