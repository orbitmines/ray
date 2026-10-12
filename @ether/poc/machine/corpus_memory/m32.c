long m32(unsigned char *p, long n, long k) { for (long i = 0; i < n; i++) if (p[i] == k) return i; return -1; }
