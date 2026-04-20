#!/usr/bin/env bash
set -euo pipefail
exec dotnet fsi "$1"
