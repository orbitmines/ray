#!/usr/bin/env bash
set -euo pipefail
exec protoc "$1"
