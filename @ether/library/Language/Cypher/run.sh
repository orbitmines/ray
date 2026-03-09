#!/usr/bin/env bash
set -euo pipefail
exec cypher-shell < "$1"
