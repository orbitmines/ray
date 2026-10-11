import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

here = pathlib.Path(__file__).resolve().parent
corpus = here / 'corpus'
FLAGS = ['-O2', '-fwrapv', '-ffunction-sections', '-fno-asynchronous-unwind-tables']


def compiled(source, name, folder):
    obj = folder / (name + '.o')
    subprocess.run(['gcc', *FLAGS, '-c', str(source), '-o', str(obj)], check=True)
    raw = folder / (name + '.bin')
    subprocess.run(['objcopy', '-O', 'binary', '--only-section=.text.' + name, str(obj), str(raw)], check=True)
    listing = subprocess.run(['objdump', '-d', '-M', 'intel', '--no-show-raw-insn', '-j', '.text.' + name, str(obj)], check=True, capture_output=True, text=True).stdout
    lines = []
    for line in listing.splitlines():
        parts = line.split('\t')
        if len(parts) >= 2 and parts[0].strip().endswith(':') and parts[1].strip():
            lines.append(' '.join(parts[1].split(None, 1)).strip())
    return raw.read_bytes(), '\n'.join(lines) + '\n'


def build(count, seed):
    with tempfile.TemporaryDirectory() as temporary:
        folder = pathlib.Path(temporary)
        subprocess.run([sys.executable, str(here.parent / 'interop' / 'gen.py'), '--count', str(count), '--seed', str(seed), '--out', str(folder / 'gen')], check=True, capture_output=True)
        functions = json.loads((folder / 'gen' / 'corpus.json').read_text())
        made = {}
        for function in functions:
            name = function['name']
            source = folder / 'gen' / (name + '.c')
            data, text = compiled(source, name, folder)
            made[name] = (source.read_text(), data, text)
        return functions, made


def manifest_of(functions, made):
    lines = []
    for function in functions:
        source, data, _ = made[function['name']]
        lines.append(' '.join([function['name'], function['type'], ','.join(function['parameters']), str(len(data)), hashlib.sha256(data).hexdigest()]))
    return '\n'.join(lines) + '\n'


if __name__ == '__main__':
    count = int(os.environ.get('COUNT', '200'))
    functions, made = build(count, 1)
    manifest = manifest_of(functions, made)
    if len(sys.argv) > 1 and sys.argv[1] == '--check':
        if (corpus / 'manifest.txt').read_text() != manifest:
            sys.exit('gcc now compiles the corpus to other bytes than manifest.txt: ' + subprocess.run(['gcc', '--version'], capture_output=True, text=True).stdout.splitlines()[0])
        print(f'MC1 gcc compiles all {len(functions)} functions to the bytes in manifest.txt')
        sys.exit()
    shutil.rmtree(corpus, ignore_errors=True)
    corpus.mkdir()
    for function in functions:
        source, data, text = made[function['name']]
        (corpus / (function['name'] + '.c')).write_text(source)
        (corpus / (function['name'] + '.bin')).write_bytes(data)
        (corpus / (function['name'] + '.s')).write_text(text)
    (corpus / 'corpus.json').write_text(json.dumps(functions))
    (corpus / 'manifest.txt').write_text(manifest)
    print(f'wrote {len(functions)} functions')
