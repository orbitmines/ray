// Words: 32-bit integers; the low two bits say what a word is.
//   INT      an integer, shifted left by two (so adding two of them is adding the words)
//   REF      an address in memory: a superposition
//   SPECIAL  NOTHING (no value was written), UNRESOLVED (a merged cell not read yet)

export const INT = 0, REF = 1, SPECIAL = 2;

export const int = (n: number) => n << 2;
export const integer = (w: number) => w >> 2;
export const ref = (address: number) => (address << 2) | REF;
export const address = (w: number) => w >> 2;
export const kind = (w: number) => w & 3;

export const NOTHING = (0 << 2) | SPECIAL;
export const UNRESOLVED = (1 << 2) | SPECIAL;

export const truthy = (w: number) => w !== int(0) && w !== NOTHING;
