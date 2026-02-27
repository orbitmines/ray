#!/usr/bin/env bash
set -euo pipefail
# FRACTRAN is an esoteric language by John Conway.
# https://esolangs.org/wiki/FRACTRAN
# Install a Python-based interpreter
pip install fractran 2>/dev/null || {
  # Create a minimal FRACTRAN interpreter
  mkdir -p "${ETHER_EXTERNAL_DIR:-/tmp}/fractran"
  cat > "${ETHER_EXTERNAL_DIR:-/tmp}/fractran/fractran.py" << 'PYEOF'
#!/usr/bin/env python3
import sys
from fractions import Fraction

def run_fractran(program, n, max_steps=10000):
    fractions = []
    for token in program.strip().split():
        if '/' in token:
            num, den = token.split('/')
            fractions.append(Fraction(int(num), int(den)))
    for _ in range(max_steps):
        found = False
        for f in fractions:
            result = n * f
            if result.denominator == 1:
                n = int(result)
                print(n)
                found = True
                break
        if not found:
            break
    return n

if __name__ == '__main__':
    with open(sys.argv[1]) as f:
        lines = f.read().strip().split('\n')
    program = lines[0]
    n = int(lines[1]) if len(lines) > 1 else 2
    run_fractran(program, n)
PYEOF
  chmod +x "${ETHER_EXTERNAL_DIR:-/tmp}/fractran/fractran.py"
  echo "FRACTRAN interpreter installed to ${ETHER_EXTERNAL_DIR:-/tmp}/fractran/fractran.py"
}
