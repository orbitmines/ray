import pathlib
import re
import subprocess
import sys

here = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(here))
from make import FLAGS


def instructions(obj):
    listing = subprocess.run(['objdump', '-d', '-M', 'intel', '-j', '.text', str(obj)], capture_output=True, text=True, check=True).stdout
    made = []
    for line in listing.splitlines():
        parts = line.split('\t')
        if len(parts) >= 3 and parts[0].strip().endswith(':'):
            at = int(parts[0].strip()[:-1], 16)
            data = bytes(int(b, 16) for b in parts[1].split())
            text = re.sub(r'\s+<[^>]*>$', '', ' '.join(parts[2].split(None, 1)).strip())
            made.append((at, data, text))
        elif len(parts) == 2 and parts[0].strip().endswith(':') and made:
            at, data, text = made[-1]
            made[-1] = (at, data + bytes(int(b, 16) for b in parts[1].split()), text)
    return made


if __name__ == '__main__':
    obj = pathlib.Path(sys.argv[1])
    out = pathlib.Path(sys.argv[2])
    seen, probe, asked = set(), [], []
    for at, data, text in instructions(obj):
        key = data if not text.startswith(('j', 'call')) else (at, data)
        if key in seen:
            continue
        seen.add(key)
        asked.append((at, data, text))
        bits = f'[{", ".join(map(str, data))}].map((byte) => byte.binary(8).reversed).join("")'
        probe.append(f'(X86.Instruction.bits_read({bits}).binary == {bits}) ? "same" : "other"' if len(sys.argv) > 3 else f'X86.Instruction.bits_read({bits}).operation.assembly_after({at + len(data)})')
    out.write_text('\n'.join(probe) + '\n')
    (out.with_suffix('.asked')).write_text('\n'.join(f'{at:x}\t{data.hex()}\t{text}' for at, data, text in asked) + '\n')
    print(len(asked), 'distinct instructions')
