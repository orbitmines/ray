#!/usr/bin/env bash
set -euo pipefail
exec bazel build "$1"
