long m36(long *p, long n, long k) { long c = 0; for (long i = 0; i < n; i++) if (p[i] > k) c = c + 1; return c; }
