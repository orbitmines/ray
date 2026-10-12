import hashlib
import json
import pathlib
import re
import subprocess
import sys
import tempfile

here = pathlib.Path(__file__).resolve().parent
deflate = here.parent.parent / 'deflate'
FLAGS = ['-O2', '-fwrapv', '-fno-asynchronous-unwind-tables', '-fno-tree-vectorize', '-fno-jump-tables',
         '-fno-tree-loop-distribute-patterns', '-fno-stack-protector', '-fcf-protection=none', '-fno-pic']


def streams():
    good = sorted(p for p in (deflate / 'corpus').glob('*.deflate'))
    bad = sorted(p for p in (deflate / 'bad').glob('*.deflate'))
    return good, bad


def expected(stream):
    return (deflate / 'inputs' / '.'.join(stream.name.split('.')[:2])).read_bytes()


def built(folder):
    obj = folder / 'inflate.o'
    subprocess.run(['gcc', *FLAGS, '-c', str(here / 'inflate.c'), '-o', str(obj)], check=True)
    relocations = subprocess.run(['objdump', '-r', str(obj)], capture_output=True, text=True, check=True).stdout
    if 'R_X86_64' in relocations:
        sys.exit('gcc made relocations: the machine code is not one piece')
    raw = folder / 'inflate.bin'
    subprocess.run(['objcopy', '-O', 'binary', '--only-section=.text', str(obj), str(raw)], check=True)
    listing = subprocess.run(['objdump', '-d', '-M', 'intel', '--no-show-raw-insn', '-j', '.text', str(obj)], capture_output=True, text=True, check=True).stdout
    lines = []
    for line in listing.splitlines():
        parts = line.split('\t')
        if len(parts) >= 2 and parts[0].strip().endswith(':') and parts[1].strip():
            lines.append(re.sub(r'\s+<[^>]*>$', '', ' '.join(parts[1].split(None, 1)).strip()))
    symbols = subprocess.run(['nm', '--defined-only', str(obj)], capture_output=True, text=True, check=True).stdout
    functions = sorted((int(at, 16), name) for at, kind, name in (line.split() for line in symbols.splitlines()) if kind in 'tT')
    subprocess.run(['gcc', '-O2', str(here / 'main.c'), str(obj), '-o', str(folder / 'inflate')], check=True)
    return raw.read_bytes(), '\n'.join(lines) + '\n', functions, folder / 'inflate'


def decoded(program, stream):
    run = subprocess.run([str(program), str(stream)], capture_output=True)
    return run.returncode, run.stdout, run.stderr.decode().strip()


def agrees(program, label):
    good, bad = streams()
    wrong = [s.name for s in good if decoded(program, s)[:2] != (0, expected(s))]
    accepted = [s.name for s in bad if decoded(program, s)[0] == 0]
    for name in wrong:
        print('DIFFER', name)
    for name in accepted:
        print('ACCEPTED', name)
    print(f'{label}: {len(good) - len(wrong)} of {len(good)} streams decoded as zlib wrote them, {len(bad) - len(accepted)} of {len(bad)} bad ones rejected')
    return not wrong and not accepted


if __name__ == '__main__':
    with tempfile.TemporaryDirectory() as temporary:
        data, text, functions, program = built(pathlib.Path(temporary))
        manifest = f'inflate {len(data)} {hashlib.sha256(data).hexdigest()}\n' + ''.join(f'{at:x} {name}\n' for at, name in functions)
        if len(sys.argv) > 1 and sys.argv[1] == '--check':
            if (here / 'manifest.txt').read_text() != manifest:
                sys.exit('gcc now compiles inflate.c to other bytes')
            sys.exit(0 if agrees(program, f'MC10a gcc compiles inflate.c to the {len(data)} bytes in manifest.txt') else 1)
        (here / 'inflate.bin').write_bytes(data)
        (here / 'inflate.s').write_text(text)
        (here / 'manifest.txt').write_text(manifest)
        (here / 'corpus.json').write_text(json.dumps([{'name': 'inflate', 'type': 'long', 'parameters': ['out', 'outlen', 'in', 'inlen', 'state']}]))
        print(f'wrote inflate.bin ({len(data)} bytes, {len(functions)} functions)')
