#!/usr/bin/env bash
set -euo pipefail
exec vim -e -s -S "$1" +qa
