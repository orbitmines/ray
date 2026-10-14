import pathlib
import subprocess
import sys
import tempfile

here = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(here))
from make import agrees

compiled = here.parent / 'out' / 'compiled_program'
code = (compiled / 'inflate.bin').read_bytes()
entry = int((compiled / 'inflate.entry').read_text())
with tempfile.TemporaryDirectory() as temporary:
    folder = pathlib.Path(temporary)
    loader = folder / 'loaded.c'
    loader.write_text('#include <string.h>\n#include <sys/mman.h>\n'
                      'static const unsigned char code[] = {' + ', '.join(map(str, code)) + '};\n'
                      'long inflate(unsigned char *out, long outlen, const unsigned char *in, long inlen, void *state) {\n'
                      '    static unsigned char *page;\n'
                      '    if (!page) { page = mmap(0, sizeof code, PROT_READ | PROT_WRITE | PROT_EXEC, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0); memcpy(page, code, sizeof code); }\n'
                      f'    return ((long (*)(unsigned char *, long, const unsigned char *, long, void *)) (page + {entry}))(out, outlen, in, inlen, state);\n'
                      '}\n')
    program = compiled / 'inflate-native'
    subprocess.run(['gcc', '-O2', str(here / 'main.c'), str(loader), '-o', str(program)], check=True)
    sys.exit(0 if agrees(program, f'MC10d inflate as Ray wrote it ({len(code)} bytes), run natively') else 1)
