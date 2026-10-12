#include <stdio.h>
#include <stdlib.h>

long inflate(unsigned char *out, long outlen, const unsigned char *in, long inlen, void *state);

int main(int argc, char **argv) {
    FILE *file = fopen(argv[1], "rb");
    if (!file) return 2;
    static unsigned char in[1 << 22], out[1 << 22];
    long inlen = (long) fread(in, 1, sizeof in, file);
    fclose(file);
    void *state = calloc(1, 1 << 16);
    long made = inflate(out, sizeof out, in, inlen, state);
    if (made < 0) { fprintf(stderr, "inflate: %ld\n", made); return 1; }
    fwrite(out, 1, (size_t) made, stdout);
    return 0;
}
