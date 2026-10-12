import hashlib
import json
import os
import pathlib
import random
import re
import shutil
import subprocess
import sys
import tempfile

here = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(here))
from make import FLAGS
from check import main_c

corpus = here / 'corpus_flow'
NAMES = ['n', 'm', 'a', 'b']
COMPARISONS = ['<', '<=', '>', '>=', '==', '!=']


def expression(rng, names, depth):
    if depth == 0 or rng.random() < 0.35:
        return rng.choice(names) if rng.random() < 0.7 else str(rng.randint(1, 9))
    operator = rng.choice(['+', '-', '*'])
    return '(' + expression(rng, names, depth - 1) + ' ' + operator + ' ' + expression(rng, names, depth - 1) + ')'


def condition(rng, names):
    return rng.choice(names) + ' ' + rng.choice(COMPARISONS) + ' ' + (rng.choice(names) if rng.random() < 0.6 else str(rng.randint(0, 9)))


def function(rng, name):
    kind = rng.choice(['choice', 'choices', 'down', 'up'])
    c_type = rng.choice(['int', 'long'])
    if kind == 'choice':
        parameters = rng.sample(NAMES, rng.randint(1, 3))
        body = f'if ({condition(rng, parameters)}) return {expression(rng, parameters, 2)}; return {expression(rng, parameters, 2)};'
    elif kind == 'choices':
        parameters = rng.sample(NAMES, rng.randint(2, 3))
        body = (f'if ({condition(rng, parameters)}) return {expression(rng, parameters, 1)}; '
                f'if ({condition(rng, parameters)}) return {expression(rng, parameters, 1)}; return {expression(rng, parameters, 1)};')
    elif kind == 'down':
        parameters = ['n', 'm'] + rng.sample(['a', 'b'], rng.randint(0, 1))
        step = rng.randint(1, 5)
        body = (f'{c_type} k = 0; while (n {rng.choice([">", ">="])} m) {{ n = n - {step}; k = k + {expression(rng, ["n"] + parameters[2:], 1)}; }} '
                f'return k;')
    else:
        parameters = ['n'] + rng.sample(['a', 'b'], rng.randint(0, 1))
        body = (f'{c_type} s = 0; {c_type} i = 0; while (i < n) {{ s = s + {expression(rng, ["i"] + parameters[1:], 1)}; i = i + 1; }} '
                f'return s;')
    source = f'{c_type} {name}({", ".join(c_type + " " + p for p in parameters)}) {{ {body} }}\n'
    return {'name': name, 'type': c_type, 'parameters': parameters, 'kind': kind}, source


def compiled(source, name, folder):
    path = folder / (name + '.c')
    path.write_text(source)
    obj = folder / (name + '.o')
    subprocess.run(['gcc', *FLAGS, '-c', str(path), '-o', str(obj)], check=True)
    raw = folder / (name + '.bin')
    subprocess.run(['objcopy', '-O', 'binary', '--only-section=.text.' + name, str(obj), str(raw)], check=True)
    listing = subprocess.run(['objdump', '-d', '-M', 'intel', '--no-show-raw-insn', '-j', '.text.' + name, str(obj)], check=True, capture_output=True, text=True).stdout
    lines = []
    for line in listing.splitlines():
        parts = line.split('\t')
        if len(parts) >= 2 and parts[0].strip().endswith(':') and parts[1].strip():
            text = ' '.join(parts[1].split(None, 1)).strip()
            lines.append(re.sub(r'\s+<[^>]*>$', '', text))
    return raw.read_bytes(), '\n'.join(lines) + '\n', obj


def inputs(functions, rng, count):
    lines = []
    for f in functions:
        for _ in range(count):
            lines.append(f['name'] + ' ' + ' '.join(str(rng.randint(-60, 60)) for _ in f['parameters']))
    return '\n'.join(lines) + '\n'


def build(count, seed, folder):
    rng = random.Random(seed)
    functions, made = [], {}
    for index in range(1, count + 1):
        f, source = function(rng, 'g' + str(index))
        data, text, obj = compiled(source, f['name'], folder)
        functions.append(f)
        made[f['name']] = (source, data, text, obj)
    given = inputs(functions, random.Random(seed + 1), 3)
    (folder / 'main.c').write_text(main_c(functions))
    subprocess.run(['gcc', '-O2', str(folder / 'main.c'), *[str(made[f['name']][3]) for f in functions], '-o', str(folder / 'oracle')], check=True)
    expected = subprocess.run([str(folder / 'oracle')], input=given, capture_output=True, text=True, check=True).stdout
    return functions, made, given, expected


if __name__ == '__main__':
    count = int(os.environ.get('COUNT', '60'))
    with tempfile.TemporaryDirectory() as temporary:
        functions, made, given, expected = build(count, 1, pathlib.Path(temporary))
        manifest = '\n'.join(' '.join([f['name'], f['type'], f['kind'], ','.join(f['parameters']), str(len(made[f['name']][1])), hashlib.sha256(made[f['name']][1]).hexdigest()]) for f in functions) + '\n'
        if len(sys.argv) > 1 and sys.argv[1] == '--check':
            if (corpus / 'manifest.txt').read_text() != manifest or (corpus / 'expected.txt').read_text() != expected:
                sys.exit('gcc now compiles the flow corpus to other bytes, or its objects print otherwise')
            print(f'MC8a gcc compiles all {len(functions)} flow functions to the bytes in manifest.txt; they print expected.txt')
            sys.exit()
        shutil.rmtree(corpus, ignore_errors=True)
        corpus.mkdir()
        for f in functions:
            source, data, text, _ = made[f['name']]
            (corpus / (f['name'] + '.c')).write_text(source)
            (corpus / (f['name'] + '.bin')).write_bytes(data)
            (corpus / (f['name'] + '.s')).write_text(text)
        (corpus / 'corpus.json').write_text(json.dumps(functions))
        (corpus / 'manifest.txt').write_text(manifest)
        (corpus / 'inputs.txt').write_text(given)
        (corpus / 'expected.txt').write_text(expected)
        print(f'wrote {len(functions)} flow functions')
