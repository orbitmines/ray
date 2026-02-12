#!/usr/bin/env bash
set -euo pipefail
command -v arm-linux-gnueabihf-as &>/dev/null || command -v aarch64-linux-gnu-as &>/dev/null || command -v arm-none-eabi-as &>/dev/null
