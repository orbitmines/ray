import json
import pathlib
import random
import subprocess
import sys

here = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(here))
from check import corpus, out, inputs, main_c, built
from make import FLAGS


def loaded_c(functions, folder):
    lines = ['#include <stdio.h>', '#include <string.h>', '#include <sys/mman.h>']
    for function in functions:
        data = (folder / (function['name'] + '.bin')).read_bytes()
        lines.append('static const unsigned char code_' + function['name'] + '[] = {' + ', '.join(str(b) for b in data) + '};')
        lines.append('static ' + function['type'] + ' (*' + function['name'] + ')(' + ', '.join([function['type']] * len(function['parameters'])) + ');')
    lines += ['static void load(void) {', '    unsigned char *page = mmap(0, 1 << 20, PROT_READ | PROT_WRITE | PROT_EXEC, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);', '    size_t at = 0;']
    for function in functions:
        n = function['name']
        lines.append(f'    memcpy(page + at, code_{n}, sizeof code_{n}); *(void **) &{n} = page + at; at += (sizeof code_{n} + 15) & ~15;')
    lines.append('}')
    harness = main_c(functions).split('\n')
    body = [line for line in harness if not line.startswith('#include') and not any(line.startswith(f['type'] + ' ' + f['name'] + '(') for f in functions)]
    body = '\n'.join(body).replace('int main(void) {', 'int main(void) {\n    load();', 1)
    return '\n'.join(lines) + '\n' + body + '\n'


if __name__ == '__main__':
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    functions = json.loads((corpus / 'corpus.json').read_text())[:int(sys.argv[2]) if len(sys.argv) > 2 else None]
    folder = out / 'compiled'
    missing = [f['name'] for f in functions if not (folder / (f['name'] + '.bin')).exists()]
    if missing:
        sys.exit('Ray compiled nothing for: ' + ' '.join(missing))
    (out / 'objects').mkdir(parents=True, exist_ok=True)
    objects = []
    for function in functions:
        target = out / 'objects' / (function['name'] + '.o')
        subprocess.run(['gcc', *FLAGS, '-c', str(corpus / (function['name'] + '.c')), '-o', str(target)], check=True)
        objects.append(str(target))
    (out / 'main.c').write_text(main_c(functions))
    (out / 'native.c').write_text(loaded_c(functions, folder))
    gcc = built([str(out / 'main.c'), *objects], 'gcc-objects')
    ray = built([str(out / 'native.c')], 'ray-native')
    given = inputs(functions, count, random.Random(1))
    expected = subprocess.run([str(gcc)], input=given, capture_output=True, text=True, check=True).stdout.split('\n')
    answered = subprocess.run([str(ray)], input=given, capture_output=True, text=True, check=True).stdout.split('\n')
    asked = given.split('\n')
    differ = [(asked[i], expected[i], answered[i]) for i in range(len(asked) - 1) if expected[i] != answered[i]]
    for line, gcc_said, ray_said in differ[:10]:
        print('DIFFER', line, '| gcc:', gcc_said, '| Ray:', ray_said)
    total = len(asked) - 1
    size = sum((folder / (f['name'] + '.bin')).stat().st_size for f in functions)
    print(f'MC7 {len(functions)} functions ({size} bytes Ray wrote), {total} inputs: the machine code Ray compiled from C and gcc\'s objects agree on {total - len(differ)}, {len(differ)} differ')
    sys.exit(1 if differ else 0)
