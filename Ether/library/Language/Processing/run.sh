#!/usr/bin/env bash
set -euo pipefail
exec processing-java --sketch="$(dirname "$1")" --run
