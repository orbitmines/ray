#!/usr/bin/env bash
set -euo pipefail
# Thue: esoteric string rewriting language - https://esolangs.org/wiki/Thue
# Install a Python-based interpreter
pip install thue || {
  echo "No standard package; using inline Python interpreter." >&2
  # Minimal Thue interpreter as fallback
  mkdir -p "$HOME/.local/bin"
  cat > "$HOME/.local/bin/thue" << 'INTERP'
#!/usr/bin/env python3
import sys, random
def run(filename):
    with open(filename) as f:
        lines = f.read().split('\n')
    rules = []
    data = ''
    sep = False
    for line in lines:
        if line == '::=':
            sep = True
            continue
        if not sep:
            parts = line.split('::=', 1)
            if len(parts) == 2:
                rules.append((parts[0], parts[1]))
        else:
            data += line + '\n'
    data = data.strip()
    while True:
        applicable = [(i, r) for i, r in enumerate(rules) if r[0] in data]
        if not applicable: break
        idx, (lhs, rhs) = random.choice(applicable)
        if rhs.startswith('~'):
            print(rhs[1:], end='')
            rhs = ''
        pos = data.find(lhs)
        data = data[:pos] + rhs + data[pos+len(lhs):]
if __name__ == '__main__':
    run(sys.argv[1])
INTERP
  chmod +x "$HOME/.local/bin/thue"
}
