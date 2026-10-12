long m25(long *p, long n, long k) { for (long i = 0, j = n - 1; i < j; i++, j--) { long t = p[i]; p[i] = p[j]; p[j] = t; } return n; }
