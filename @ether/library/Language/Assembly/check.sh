#!/usr/bin/env bash
set -euo pipefail
command -v nasm &>/dev/null || command -v yasm &>/dev/null || command -v as &>/dev/null
