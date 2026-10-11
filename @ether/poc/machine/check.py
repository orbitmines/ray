import json
import pathlib
import random
import subprocess
import sys

here = pathlib.Path(__file__).resolve().parent
corpus = here / 'corpus'
out = here / 'out'
sys.path.insert(0, str(here))
from make import FLAGS

BOUNDS = {'int': (-2**31, 2**31 - 1), 'long': (-2**63, 2**63 - 1)}
EDGES = {
    'int': [-2**31, -2**31 + 1, 2**31 - 1, 2**31 - 2, -1, 0, 1, 2, 3, 65536, -65536, 46341, -46341],
    'long': [-2**63, -2**63 + 1, 2**63 - 1, 2**63 - 2, -1, 0, 1, 2, 3, 2**32, -2**32, 3037000500, -3037000500],
}


def main_c(functions):
    lines = ['#include <stdio.h>', '#include <string.h>']
    for function in functions:
        lines.append(function['type'] + ' ' + function['name'] + '(' + ', '.join([function['type']] * len(function['parameters'])) + ');')
    lines += ['int main(void) {', '    char name[64], line[512];', '    long long a[4];', '    while (fgets(line, sizeof line, stdin)) {',
              '        if (sscanf(line, "%63s %lld %lld %lld %lld", name, &a[0], &a[1], &a[2], &a[3]) < 1) continue;']
    for function in functions:
        arguments = ', '.join('(' + function['type'] + ') a[' + str(i) + ']' for i in range(len(function['parameters'])))
        lines.append('        if (strcmp(name, "' + function['name'] + '") == 0) printf("%lld\\n", (long long) ' + function['name'] + '(' + arguments + '));')
    lines += ['    }', '    return 0;', '}']
    return '\n'.join(lines) + '\n'


def inputs(functions, count, rng):
    lines = []
    for function in functions:
        low, high = BOUNDS[function['type']]
        for _ in range(count):
            values = [rng.choice(EDGES[function['type']]) if rng.random() < 0.5 else rng.randint(low, high) for _ in function['parameters']]
            lines.append(function['name'] + ' ' + ' '.join(map(str, values)))
    return '\n'.join(lines) + '\n'


def built(sources, name):
    subprocess.run(['gcc', '-O2', *sources, '-o', str(out / name), '-lpthread', '-ldl', '-lm'], check=True)
    return out / name


if __name__ == '__main__':
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    functions = json.loads((corpus / 'corpus.json').read_text())
    missing = [f['name'] for f in functions if not (out / 'rust' / (f['name'] + '.rs')).exists()]
    if missing:
        sys.exit('Ray wrote no Rust for: ' + ' '.join(missing))
    (out / 'objects').mkdir(parents=True, exist_ok=True)
    objects = []
    for function in functions:
        target = out / 'objects' / (function['name'] + '.o')
        subprocess.run(['gcc', *FLAGS, '-c', str(corpus / (function['name'] + '.c')), '-o', str(target)], check=True)
        objects.append(str(target))
    (out / 'main.c').write_text(main_c(functions))
    (out / 'ray.rs').write_text(''.join((out / 'rust' / (f['name'] + '.rs')).read_text() for f in functions))
    subprocess.run(['rustc', '--edition', '2021', '--crate-type', 'staticlib', '--crate-name', 'ray_machine', '-O', '-A', 'warnings', str(out / 'ray.rs'), '-o', str(out / 'libray_machine.a')], check=True)
    gcc = built([str(out / 'main.c'), *objects], 'gcc-objects')
    ray = built([str(out / 'main.c'), str(out / 'libray_machine.a')], 'ray-rust')
    given = inputs(functions, count, random.Random(1))
    expected = subprocess.run([str(gcc)], input=given, capture_output=True, text=True, check=True).stdout.split('\n')
    answered = subprocess.run([str(ray)], input=given, capture_output=True, text=True, check=True).stdout.split('\n')
    asked = given.split('\n')
    differ = [(asked[i], expected[i], answered[i]) for i in range(len(asked) - 1) if expected[i] != answered[i]]
    for line, gcc_said, ray_said in differ[:10]:
        print('DIFFER', line, '| gcc:', gcc_said, '| Ray:', ray_said)
    total = len(asked) - 1
    print(f'MC5 {len(functions)} functions, {total} inputs: the Rust Ray wrote from gcc\'s machine code and gcc\'s objects agree on {total - len(differ)}, {len(differ)} differ')
    sys.exit(1 if differ else 0)
