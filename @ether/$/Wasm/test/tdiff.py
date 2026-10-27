# python3 tdiff.py SEED_TRACE NATIVE_TRACE [N]: the two traces, rule heads and texts, aligned; where they first part
import sys, re, difflib
def norm(t): return re.sub(r'\s+', ' ', t.replace('⏎', ' ')).strip()[:40]
def seed(p):
    out = []
    for l in open(p, encoding='utf8', errors='replace'):
        l = re.sub(r'\x1b\[[0-9;]*m', '', l)
        m = re.match(r'TRACE( *)`(.*?)` on `(.*?)` on #', l)
        if m: out.append((len(m.group(1)) // 2, m.group(2), norm(m.group(3))))
    return out
def native(p):
    out = []
    for l in open(p, encoding='utf8', errors='replace'):
        m = re.match(r'( *)`(.*?)` on `(.*?)` on #', l)
        if m: out.append((len(m.group(1)) // 2, m.group(2) or 'external {rule}', norm(m.group(3))))
        elif l.strip().startswith(('SAID', 'MISSING', 'DEPTH')): out.append((len(l) - len(l.lstrip()), '!' + l.strip(), ''))
    return out
a, b = seed(sys.argv[1]), native(sys.argv[2]); N = int(sys.argv[3]) if len(sys.argv) > 3 else 1
ka = [(h, t) for _, h, t in a]; kb = [(h, t) for _, h, t in b]
sm = difflib.SequenceMatcher(None, ka, kb, autojunk=False); shown = 0
print(len(a), 'seed', len(b), 'native', 'ratio', round(sm.ratio(), 3))
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag == 'equal': continue
    if max(i2 - i1, j2 - j1) < int(__import__('os').environ.get('MIN', '1')): continue
    print(f'--- {tag} seed {i1}-{i2} native {j1}-{j2}; before:', ka[i1 - 1] if i1 else '')
    for x in a[i1:min(i2, i1 + 6)]: print('  S', x)
    for x in b[j1:min(j2, j1 + 6)]: print('  N', x)
    shown += 1
    if shown >= N: break
