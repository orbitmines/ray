#!/usr/bin/env bash
set -euo pipefail
iverilog -o /tmp/verilog_out "$1" && vvp /tmp/verilog_out
