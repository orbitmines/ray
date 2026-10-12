long m57(unsigned char *p, long n, long k) { if (n == 0) return 0; long m = p[0]; for (long i = 0; i < n; i++) if (p[i] > m) m = p[i]; return m; }
