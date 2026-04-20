#!/usr/bin/env bash
set -euo pipefail
exec python3 -c "import onnx; print('ONNX', onnx.__version__); import code; code.interact(local={'onnx': onnx})"
