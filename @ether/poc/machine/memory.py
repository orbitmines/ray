import collections
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

corpus = here / 'corpus_memory'
SCALAR = ['-fno-tree-vectorize']
ELEMENTS = {'int': (-60, 60), 'long': (-60, 60), 'unsigned char': (0, 255)}
COMPARISONS = ['<', '<=', '>', '>=', '==', '!=']


def body(rng, kind, element):
    loop = 'for (long i = 0; i < n; i++)'
    if kind == 'sum':
        return f'long s = 0; {loop} s = s + p[i]; return s;'
    if kind == 'count':
        return f'long c = 0; {loop} if (p[i] {rng.choice(COMPARISONS)} k) c = c + 1; return c;'
    if kind == 'find':
        return f'{loop} if (p[i] == k) return i; return -1;'
    if kind == 'largest':
        return f'if (n == 0) return 0; long m = p[0]; {loop} if (p[i] > m) m = p[i]; return m;'
    if kind == 'add':
        return f'{loop} p[i] = p[i] + k; return n;'
    if kind == 'prefix':
        return f'for (long i = 1; i < n; i++) p[i] = p[i] + p[i - 1]; return n;'
    return f'for (long i = 0, j = n - 1; i < j; i++, j--) {{ {element} t = p[i]; p[i] = p[j]; p[j] = t; }} return n;'


KINDS = ['sum', 'count', 'find', 'largest', 'add', 'prefix', 'reverse']


def function(rng, name):
    kind = rng.choice(KINDS)
    element = rng.choice(list(ELEMENTS))
    source = f'long {name}({element} *p, long n, long k) {{ {body(rng, kind, element)} }}\n'
    return {'name': name, 'element': element, 'kind': kind, 'type': 'long', 'parameters': ['p', 'n', 'k']}, source


def main_c(functions):
    lines = ['#include <stdio.h>', '#include <string.h>', '#include <stdlib.h>']
    for f in functions:
        lines.append(f'long {f["name"]}({f["element"]} *p, long n, long k);')
    lines += ['int main(void) {', '    char name[64], line[1024];',
              '    while (fgets(line, sizeof line, stdin)) {',
              '        char *at = line; int used; long n, k; long long v[16];',
              '        if (sscanf(at, "%63s %ld %ld%n", name, &n, &k, &used) < 3) continue;', '        at += used;',
              '        for (long i = 0; i < n; i++) { sscanf(at, "%lld%n", &v[i], &used); at += used; }']
    for f in functions:
        e = f['element']
        lines += [f'        if (strcmp(name, "{f["name"]}") == 0) {{',
                  f'            {e} p[16]; for (long i = 0; i < n; i++) p[i] = ({e}) v[i];',
                  f'            printf("%ld |", {f["name"]}(p, n, k));',
                  f'            for (long i = 0; i < n; i++) printf(" %lld", (long long) p[i]);', '            printf("\\n");', '        }']
    lines += ['    }', '    return 0;', '}']
    return '\n'.join(lines) + '\n'


def inputs(functions, rng, count):
    lines = []
    for f in functions:
        low, high = ELEMENTS[f['element']]
        for _ in range(count):
            n = rng.randint(0, 6)
            values = [rng.randint(low, high) for _ in range(n)]
            k = rng.choice(values) if values and rng.random() < 0.5 else rng.randint(low, high)
            lines.append(' '.join(map(str, [f['name'], n, k, *values])))
    return '\n'.join(lines) + '\n'


def compiled(source, name, folder):
    path = folder / (name + '.c')
    path.write_text(source)
    obj = folder / (name + '.o')
    subprocess.run(['gcc', *FLAGS, *SCALAR, '-c', str(path), '-o', str(obj)], check=True)
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


def build(count, seed, folder):
    rng = random.Random(seed)
    functions, made = [], {}
    for index in range(1, count + 1):
        f, source = function(rng, 'm' + str(index))
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
        manifest = '\n'.join(' '.join([f['name'], f['element'].replace(' ', '_'), f['kind'], str(len(made[f['name']][1])), hashlib.sha256(made[f['name']][1]).hexdigest()]) for f in functions) + '\n'
        if len(sys.argv) > 1 and sys.argv[1] == '--check':
            if (corpus / 'manifest.txt').read_text() != manifest or (corpus / 'expected.txt').read_text() != expected:
                sys.exit('gcc now compiles the memory corpus to other bytes, or its objects print otherwise')
            print(f'MC9a gcc compiles all {len(functions)} memory functions to the bytes in manifest.txt; they print expected.txt')
            sys.exit()
        if len(sys.argv) > 1 and sys.argv[1] == '--mnemonics':
            seen = collections.Counter(line.split()[0] for f in functions for line in made[f['name']][2].splitlines())
            print(' '.join(f'{m}:{c}' for m, c in seen.most_common()))
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
        print(f'wrote {len(functions)} memory functions')
