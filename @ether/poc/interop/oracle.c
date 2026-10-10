#include <stdio.h>

int add(int a, int b);

int main(void) {
  int a, b;
  while (scanf("%d %d", &a, &b) == 2) printf("%d\n", add(a, b));
  return 0;
}
