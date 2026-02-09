#!/usr/bin/env bash
set -euo pipefail
gfortran "$1" -o /tmp/fortran_out && /tmp/fortran_out
