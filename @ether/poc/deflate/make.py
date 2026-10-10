import hashlib
import os
import sys
import zlib

here = os.path.dirname(os.path.abspath(__file__))
inputs = os.path.join(here, 'inputs')
corpus = os.path.join(here, 'corpus')

LEVELS = [0, 1, 6, 9]
STRATEGIES = {
    'default': zlib.Z_DEFAULT_STRATEGY,
    'filtered': zlib.Z_FILTERED,
    'huffman': zlib.Z_HUFFMAN_ONLY,
    'rle': zlib.Z_RLE,
    'fixed': zlib.Z_FIXED,
}


def raw(data, level, strategy):
    made = zlib.compressobj(level, zlib.DEFLATED, -15, 9, strategy)
    return made.compress(data) + made.flush()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def build():
    os.makedirs(corpus, exist_ok=True)
    lines, seen = [], set()
    for name in sorted(os.listdir(inputs)):
        data = open(os.path.join(inputs, name), 'rb').read()
        for level in LEVELS:
            for strategy, value in STRATEGIES.items():
                stream = raw(data, level, value)
                if stream in seen:
                    continue
                seen.add(stream)
                assert zlib.decompress(stream, -15) == data
                file = f'{name}.{level}.{strategy}.deflate'
                open(os.path.join(corpus, file), 'wb').write(stream)
                lines.append(f'{file} {len(stream)} {sha(stream)} {sha(data)}')
    return '\n'.join(lines) + '\n'


if __name__ == '__main__':
    manifest = build()
    path = os.path.join(corpus, 'manifest.txt')
    if len(sys.argv) > 1 and sys.argv[1] == '--check':
        if open(path).read() != manifest:
            sys.exit('the corpus zlib makes now differs from manifest.txt')
        print(f'DP1 {manifest.count(chr(10))} streams match manifest.txt; zlib inflates each to its input')
    else:
        open(path, 'w').write(manifest)
        print(f'wrote {manifest.count(chr(10))} streams')
