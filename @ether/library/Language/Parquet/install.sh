#!/usr/bin/env bash
set -euo pipefail
echo "Parquet is a columnar data storage format. No runtime installation required."
echo "Installing parquet-tools for viewing files..."
pip install parquet-tools 2>/dev/null || pip install pyarrow 2>/dev/null || true
