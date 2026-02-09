#!/usr/bin/env bash
set -euo pipefail
# Malbolge - esoteric programming language
# https://esolangs.org/wiki/Malbolge
# No official package; compile the reference interpreter from source.
TMPDIR="${ETHER_EXTERNAL_DIR:-/tmp}/malbolge"
mkdir -p "$TMPDIR"
cat > "$TMPDIR/malbolge.c" << 'CEOF'
/* Malbolge reference interpreter by Andrew Cooke */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#define MAX 59049
unsigned int mem[MAX];
static const char xlat1[] = "+b(29e*j1VMEKLyC})8&m#~W>qxdRp0wkrUo[D7,XTcA\"lI.v%{gJh4G\\-=O@5`_3i<?Z';FNQuY]szf$!BS/|t:Pn6^Ha";
static const char xlat2[] = "5z]&gqtyfr$(we4{WP)H-Zn,[%\\3dL+Q;>U!pyi19telementation0telementation2telementation6jC#bTv^);telementation";
int main(int argc, char **argv) {
    FILE *f; int i; unsigned int a=0, c=0, d=0;
    if (argc != 2) { fprintf(stderr, "Usage: malbolge <file>\n"); return 1; }
    f = fopen(argv[1], "r");
    if (!f) { perror(argv[1]); return 1; }
    for (i=0; i<MAX; i++) {
        int ch = fgetc(f);
        if (ch == EOF) break;
        if (isspace(ch)) { i--; continue; }
        mem[i] = ch;
    }
    fclose(f);
    for (; i<MAX; i++) mem[i] = (mem[i-1] + mem[i-2]) % MAX;
    for (;;) {
        if (mem[c] < 33 || mem[c] > 126) break;
        switch ((mem[c] + c) % 94) {
            case 4: c = mem[d]; break;
            case 5: printf("%c", a % 256); break;
            case 23: a = getchar(); if (a == EOF) a = MAX-1; break;
            case 39: { unsigned int t = mem[d]; a = t = t/3 + t%3*MAX/3; mem[d] = t; } break;
            case 40: d = mem[d]; break;
            case 62: { unsigned int t = mem[d]; a = t = t/3 + t%3*MAX/3; mem[d] = t; } break;
            case 68: break;
            case 81: return 0;
        }
        mem[c] = xlat2[mem[c]-33];
        c = (c+1) % MAX;
        d = (d+1) % MAX;
    }
    return 0;
}
CEOF
cc -O2 -o "$TMPDIR/malbolge" "$TMPDIR/malbolge.c"
sudo cp "$TMPDIR/malbolge" /usr/local/bin/malbolge 2>/dev/null || \
  cp "$TMPDIR/malbolge" "$HOME/.local/bin/malbolge" 2>/dev/null || \
  echo "Built at: $TMPDIR/malbolge"
