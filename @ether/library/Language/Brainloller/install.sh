#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${ETHER_EXTERNAL_DIR:-/tmp}/github.com/Wikipedia/brainloller"
if [[ -d "$REPO_DIR/.git" ]]; then
  GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" pull || true
else
  mkdir -p "$(dirname "$REPO_DIR")"
  # Brainloller is typically implemented as a simple Python script
  mkdir -p "$REPO_DIR"
  cat > "$REPO_DIR/brainloller.py" << 'PYEOF'
#!/usr/bin/env python3
"""Brainloller interpreter - reads PNG images and interprets pixel colors as Brainfuck commands."""
import sys
try:
    from PIL import Image
except ImportError:
    print("Install Pillow: pip install Pillow", file=sys.stderr)
    sys.exit(1)

COMMANDS = {
    (255, 0, 0): '>', (128, 0, 0): '<',
    (0, 255, 0): '+', (0, 128, 0): '-',
    (0, 0, 255): '.', (0, 0, 128): ',',
    (255, 255, 0): '[', (128, 128, 0): ']',
    (0, 255, 255): 'rotate_cw', (0, 128, 128): 'rotate_ccw',
}

def interpret(filename):
    img = Image.open(filename).convert('RGB')
    w, h = img.size
    x, y, dx, dy = 0, 0, 1, 0
    bf = []
    while 0 <= x < w and 0 <= y < h:
        pixel = img.getpixel((x, y))
        cmd = COMMANDS.get(pixel)
        if cmd == 'rotate_cw':
            dx, dy = -dy, dx
        elif cmd == 'rotate_ccw':
            dx, dy = dy, -dx
        elif cmd:
            bf.append(cmd)
        x += dx
        y += dy
    # Execute brainfuck
    code = ''.join(bf)
    tape = [0] * 30000
    ptr = 0
    ip = 0
    while ip < len(code):
        c = code[ip]
        if c == '>': ptr += 1
        elif c == '<': ptr -= 1
        elif c == '+': tape[ptr] = (tape[ptr] + 1) % 256
        elif c == '-': tape[ptr] = (tape[ptr] - 1) % 256
        elif c == '.': sys.stdout.write(chr(tape[ptr]))
        elif c == ',':
            ch = sys.stdin.read(1)
            tape[ptr] = ord(ch) if ch else 0
        elif c == '[' and tape[ptr] == 0:
            depth = 1
            while depth > 0:
                ip += 1
                if code[ip] == '[': depth += 1
                elif code[ip] == ']': depth -= 1
        elif c == ']' and tape[ptr] != 0:
            depth = 1
            while depth > 0:
                ip -= 1
                if code[ip] == ']': depth += 1
                elif code[ip] == '[': depth -= 1
        ip += 1

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: brainloller.py <image.png>", file=sys.stderr)
        sys.exit(1)
    interpret(sys.argv[1])
PYEOF
fi
pip install Pillow 2>/dev/null || pip3 install Pillow
