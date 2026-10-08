#!/bin/bash
# d.sh TEST… — what the seed said for the test, and what the new reader says (normalized), side by side
cd "$(dirname "$0")"
S=$HOME/.cache/ray-scratch/expr
norm() { sed -E 's/^node\(0 rules, .*preceding\)$/true/; s/^node\(0 rules, .*following\)$/false/; s/^node\(0 rules, yes\)$/YES/; s/^node\(0 rules, no\)$/NO/; s/^Ray\(yes\)$/YES/; s/^Ray\(no\)$/NO/; s/^node\(.*\)$/<value>/; s/^Ray\(.*\)$/<value>/; s/^code:.*$/<value>/; s/[0-9]+: assertion failed/N: assertion failed/' | grep -v '^learned' | sed -E '/^(==| |true$|false$|undefined$|YES$|NO$|<value>$)/!s/.*/<value>/'; }
ulimit -s unlimited
for t in "$@"; do
  awk "/^== $t/{p=1;next} /^== /{p=0} p" $S/t_w44.txt | norm > $S/da
  grep -v "^== " $S/each_$t.test.ray.txt | norm > $S/db
  echo "######## $t"; diff -y -W 160 $S/da $S/db | head -${N:-40}
done
