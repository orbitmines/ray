#!/usr/bin/env bash
set -euo pipefail
exec python3 -c "import pennylane as qml; print('PennyLane', qml.__version__); import code; code.interact(local={'qml': qml})"
