#!/bin/bash
# compare.sh — the ported seed tests on the new reader (each on its own, 4 at a time, T s each), against what the seed said
cd "$(dirname "$0")"
S=$HOME/.cache/ray-scratch/expr
norm() { sed -E 's/^node\(0 rules, .*preceding\)$/true/; s/^node\(0 rules, .*following\)$/false/; s/^node\(0 rules, yes\)$/YES/; s/^node\(0 rules, no\)$/NO/; s/^Ray\(yes\)$/YES/; s/^Ray\(no\)$/NO/; s/^node\(.*\)$/<value>/; s/^Ray\(.*\)$/<value>/; s/^code:.*$/<value>/; s/[0-9]+: assertion failed/N: assertion failed/' | grep -v '^learned' | sed -E '/^(==| |true$|false$|undefined$|YES$|NO$|<value>$)/!s/.*/<value>/'; }
norm < $S/t_w44.txt > $S/seed_norm.txt
ulimit -s unlimited
ls ported/*.test.ray | xargs -P 4 -I{} bash -c 'timeout ${T:-8} node --stack-size=60000 --import tsx run.mts ../../../ray/.entrypoint.ray {} > '$S'/each_$(basename {}).txt 2>&1 || echo "   TIMEOUT" >> '$S'/each_$(basename {}).txt'
for f in ported/*.test.ray; do cat $S/each_$(basename $f).txt; done | norm > $S/new_norm.txt
diff $S/seed_norm.txt $S/new_norm.txt > $S/cmp.diff; echo "differing lines: $(grep -c '^[<>]' $S/cmp.diff)"
python3 - $S/seed_norm.txt $S/new_norm.txt <<'PY'
import sys
def files(p):
  out, cur = {}, None
  for l in open(p):
    l = l.rstrip('\n')
    if l.startswith('== '): cur = l[3:]; out[cur] = []
    elif cur: out[cur].append(l)
  return out
a, b = files(sys.argv[1]), files(sys.argv[2])
same = [f for f in a if a[f] == b.get(f)]
print('same:', len(same), '/', len(a)); print('differ:', ' '.join(f for f in a if f not in same))
PY
