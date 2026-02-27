#!/usr/bin/env bash
set -euo pipefail
exec sbt "runMain $(basename "$1" .scala)"
