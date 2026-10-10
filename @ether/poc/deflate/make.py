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


def stream(bits):
    bits += '0' * (-len(bits) % 8)
    return bytes(int(bits[at:at + 8][::-1], 2) for at in range(0, len(bits), 8))


def lsb(value, width):
    return format(value, f'0{width}b')[::-1]


def code_lengths(sequence):
    # a dynamic block with a complete code length code (symbols 0 to 12 four bits, 13 to 18 five), then `sequence`
    order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
    lengths = {symbol: 4 if symbol < 13 else 5 for symbol in range(19)}
    codes, code = {}, 0
    for width in range(1, 6):
        for symbol in range(19):
            if lengths[symbol] == width:
                codes[symbol] = format(code, f'0{width}b')
                code += 1
        code *= 2
    return '1' + lsb(2, 2) + lsb(0, 5) + lsb(0, 5) + lsb(15, 4) + ''.join(lsb(lengths[s], 3) for s in order) + ''.join(codes[s] + extra for s, extra in sequence)


# Each stream zlib rejects, with the bit where reading it must stop ('-': it reads, and what it means does not hold).
BAD = {
    'btype3': ('1' + '11', 3),
    'nlen': ('1' + lsb(0, 2) + '00000' + lsb(5, 16) + lsb(0xfefa, 16) + ''.join(lsb(b, 8) for b in b'hello'), 40),
    'truncated': ('1' + lsb(1, 2) + '00110', 3),
    'fixed286': ('1' + lsb(1, 2) + '11000110', 11),
    'far': ('1' + lsb(1, 2) + '0000001' + '00000' + '0000000', '-'),
    'repeat': (code_lengths([(16, lsb(0, 2))]), '-'),
    'oversubscribed': ('1' + lsb(2, 2) + lsb(0, 5) + lsb(0, 5) + lsb(15, 4) + lsb(1, 3) * 19, '-'),
}


def bad():
    folder = os.path.join(here, 'bad')
    os.makedirs(folder, exist_ok=True)
    lines = []
    for name, (bits, stop) in BAD.items():
        data = stream(bits)
        try:
            zlib.decompress(data, -15)
            sys.exit(f'zlib does not reject {name}')
        except zlib.error as error:
            reason = str(error).split(': ', 1)[-1]
        open(os.path.join(folder, name + '.deflate'), 'wb').write(data)
        lines.append(f'{name}.deflate {stop} {reason}')
    open(os.path.join(folder, 'manifest.txt'), 'w').write('\n'.join(lines) + '\n')
    print(f'wrote {len(lines)} streams zlib rejects')


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--bad':
        bad()
        sys.exit()
    manifest = build()
    path = os.path.join(corpus, 'manifest.txt')
    if len(sys.argv) > 1 and sys.argv[1] == '--check':
        if open(path).read() != manifest:
            sys.exit('the corpus zlib makes now differs from manifest.txt')
        print(f'DP1 {manifest.count(chr(10))} streams match manifest.txt; zlib inflates each to its input')
    else:
        open(path, 'w').write(manifest)
        print(f'wrote {manifest.count(chr(10))} streams')
