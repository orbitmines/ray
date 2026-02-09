#!/usr/bin/env bash
set -euo pipefail
# DependentML successor: ATS2
patscc -o /tmp/dml_out "$1" && /tmp/dml_out
