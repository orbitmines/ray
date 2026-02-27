#!/usr/bin/env bash
set -euo pipefail
exec isabelle process -T "$1"
