// A raw DEFLATE decoder (RFC 1951), written for Ray to read from gcc's object: its tables made by code and kept in the state
// given to it, so nothing of it is in `.rodata` and its machine code is one section with no relocation.

struct huffman {
    short count[16];
    short symbol[288];
};

struct state {
    unsigned char *out;
    long outlen;
    long outcnt;
    const unsigned char *in;
    long inlen;
    long incnt;
    long bitbuf;
    long bitcnt;
    long error;
    short lbase[29];
    short lext[29];
    short dbase[30];
    short dext[30];
    short lengths[320];
    short offs[16];
    struct huffman lencode;
    struct huffman distcode;
};

static long bits(struct state *s, long need) {
    long val = s->bitbuf;
    while (s->bitcnt < need) {
        if (s->incnt == s->inlen) {
            s->error = 2;
            return 0;
        }
        val |= (long) s->in[s->incnt] << s->bitcnt;
        s->incnt = s->incnt + 1;
        s->bitcnt = s->bitcnt + 8;
    }
    s->bitbuf = val >> need;
    s->bitcnt = s->bitcnt - need;
    return val & ((1L << need) - 1);
}

static long stored(struct state *s) {
    s->bitbuf = 0;
    s->bitcnt = 0;
    if (s->incnt + 4 > s->inlen) return 2;
    long len = s->in[s->incnt] | (s->in[s->incnt + 1] << 8);
    long nlen = s->in[s->incnt + 2] | (s->in[s->incnt + 3] << 8);
    s->incnt = s->incnt + 4;
    if (len != (~nlen & 0xffff)) return -2;
    if (s->incnt + len > s->inlen) return 2;
    if (s->outcnt + len > s->outlen) return 1;
    for (long k = 0; k < len; k++) s->out[s->outcnt + k] = s->in[s->incnt + k];
    s->outcnt = s->outcnt + len;
    s->incnt = s->incnt + len;
    return 0;
}

static long decode(struct state *s, struct huffman *h) {
    long code = 0, first = 0, index = 0;
    for (long len = 1; len < 16; len++) {
        code = code | bits(s, 1);
        long count = h->count[len];
        if (code - count < first) return h->symbol[index + (code - first)];
        index = index + count;
        first = (first + count) << 1;
        code = code << 1;
    }
    return -10;
}

static long construct(struct state *s, struct huffman *h, short *length, long n) {
    for (long len = 0; len < 16; len++) h->count[len] = 0;
    for (long symbol = 0; symbol < n; symbol++) h->count[length[symbol]] = h->count[length[symbol]] + 1;
    if (h->count[0] == n) return 0;
    long left = 1;
    for (long len = 1; len < 16; len++) {
        left = (left << 1) - h->count[len];
        if (left < 0) return left;
    }
    s->offs[1] = 0;
    for (long len = 1; len < 15; len++) s->offs[len + 1] = s->offs[len] + h->count[len];
    for (long symbol = 0; symbol < n; symbol++)
        if (length[symbol] != 0) {
            h->symbol[s->offs[length[symbol]]] = symbol;
            s->offs[length[symbol]] = s->offs[length[symbol]] + 1;
        }
    return left;
}

static long codes(struct state *s) {
    for (;;) {
        long symbol = decode(s, &s->lencode);
        if (s->error) return s->error;
        if (symbol < 0) return symbol;
        if (symbol < 256) {
            if (s->outcnt == s->outlen) return 1;
            s->out[s->outcnt] = symbol;
            s->outcnt = s->outcnt + 1;
        } else if (symbol == 256) {
            return 0;
        } else {
            symbol = symbol - 257;
            if (symbol >= 29) return -10;
            long len = s->lbase[symbol] + bits(s, s->lext[symbol]);
            symbol = decode(s, &s->distcode);
            if (s->error) return s->error;
            if (symbol < 0 || symbol >= 30) return -10;
            long dist = s->dbase[symbol] + bits(s, s->dext[symbol]);
            if (s->error) return s->error;
            if (dist > s->outcnt) return -11;
            if (s->outcnt + len > s->outlen) return 1;
            for (long k = 0; k < len; k++) s->out[s->outcnt + k] = s->out[s->outcnt + k - dist];
            s->outcnt = s->outcnt + len;
        }
    }
}

static long fixed(struct state *s) {
    long symbol = 0;
    for (; symbol < 144; symbol++) s->lengths[symbol] = 8;
    for (; symbol < 256; symbol++) s->lengths[symbol] = 9;
    for (; symbol < 280; symbol++) s->lengths[symbol] = 7;
    for (; symbol < 288; symbol++) s->lengths[symbol] = 8;
    construct(s, &s->lencode, s->lengths, 288);
    for (symbol = 0; symbol < 30; symbol++) s->lengths[symbol] = 5;
    construct(s, &s->distcode, s->lengths, 30);
    return codes(s);
}

// (the order the code length code's lengths come in: 16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15)
static long order(long index) {
    if (index < 3) return 16 + index;
    if (index == 3) return 0;
    long j = index - 4;
    return (j & 1) ? 7 - (j >> 1) : 8 + (j >> 1);
}

static long dynamic(struct state *s) {
    long nlen = bits(s, 5) + 257;
    long ndist = bits(s, 5) + 1;
    long ncode = bits(s, 4) + 4;
    if (s->error) return s->error;
    if (nlen > 286 || ndist > 30) return -3;
    long index = 0;
    for (; index < ncode; index++) s->lengths[order(index)] = bits(s, 3);
    for (; index < 19; index++) s->lengths[order(index)] = 0;
    if (s->error) return s->error;
    if (construct(s, &s->lencode, s->lengths, 19) != 0) return -4;
    index = 0;
    while (index < nlen + ndist) {
        long symbol = decode(s, &s->lencode);
        if (s->error) return s->error;
        if (symbol < 0) return symbol;
        if (symbol < 16) {
            s->lengths[index] = symbol;
            index = index + 1;
        } else {
            long len = 0, repeat;
            if (symbol == 16) {
                if (index == 0) return -5;
                len = s->lengths[index - 1];
                repeat = 3 + bits(s, 2);
            } else if (symbol == 17) {
                repeat = 3 + bits(s, 3);
            } else {
                repeat = 11 + bits(s, 7);
            }
            if (s->error) return s->error;
            if (index + repeat > nlen + ndist) return -6;
            for (; repeat > 0; repeat--) {
                s->lengths[index] = len;
                index = index + 1;
            }
        }
    }
    if (s->lengths[256] == 0) return -9;
    long err = construct(s, &s->lencode, s->lengths, nlen);
    if (err < 0 || (err > 0 && nlen - s->lencode.count[0] != 1)) return -7;
    err = construct(s, &s->distcode, s->lengths + nlen, ndist);
    if (err < 0 || (err > 0 && ndist - s->distcode.count[0] != 1)) return -8;
    return codes(s);
}

// (what a length's and a distance's symbol add to their base: their extra bits, and the bases they make (RFC 1951, 3.2.5))
static void tables(struct state *s) {
    for (long i = 0; i < 28; i++) s->lext[i] = i < 8 ? 0 : (i - 4) >> 2;
    s->lbase[0] = 3;
    for (long i = 1; i < 28; i++) s->lbase[i] = s->lbase[i - 1] + (1 << s->lext[i - 1]);
    s->lbase[28] = 258;
    s->lext[28] = 0;
    for (long i = 0; i < 30; i++) s->dext[i] = i < 2 ? 0 : (i >> 1) - 1;
    s->dbase[0] = 1;
    for (long i = 1; i < 30; i++) s->dbase[i] = s->dbase[i - 1] + (1 << s->dext[i - 1]);
}

// (the decoded length, else less than 0: what was wrong; 1 for room run out, 2 for input)
long inflate(unsigned char *out, long outlen, const unsigned char *in, long inlen, struct state *s) {
    s->out = out;
    s->outlen = outlen;
    s->outcnt = 0;
    s->in = in;
    s->inlen = inlen;
    s->incnt = 0;
    s->bitbuf = 0;
    s->bitcnt = 0;
    s->error = 0;
    tables(s);
    long last, err;
    do {
        last = bits(s, 1);
        long type = bits(s, 2);
        if (s->error) return -100 - s->error;
        if (type == 0) err = stored(s);
        else if (type == 1) err = fixed(s);
        else if (type == 2) err = dynamic(s);
        else err = -1;
        if (err != 0) return -100 - err;
    } while (!last);
    return s->outcnt;
}
