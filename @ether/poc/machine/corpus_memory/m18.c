long m18(int *p, long n, long k) { for (long i = 1; i < n; i++) p[i] = p[i] + p[i - 1]; return n; }
