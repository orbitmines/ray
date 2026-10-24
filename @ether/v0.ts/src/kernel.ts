type Hosts = Record<string, (...args: number[]) => number>;
const FILES = 132, FILES_N = 136;
const NOVIA = typeof process !== "undefined" && !!process.env.RAY_NOVIA;
const NOGIVEN = typeof process !== "undefined" && !!process.env.RAY_NOGIVEN;
const MEMREP = typeof process !== "undefined" && !!process.env.RAY_MEMREP;

// The kernel: the reader and what runs what it reads, over the memory every thread shares (layouts above). Each function takes
// and answers 32-bit integers; `w`/`set` a word, `b`/`setb` a byte, and the atomics. `t` is a thread's own words (`T_…`).
export function kernel(memory: ArrayBufferLike, thread = 0, debugging = 0, hosts: Hosts = {}) {
  const i32 = new Int32Array(memory), u8 = new Uint8Array(memory);
  // (`--debug`: what it reads and writes checked to be in the memory; and the host told what it is doing, `debug(…)`)
  const DEBUG = debugging | 0, outside = (a: number, n: number) => { if (!(a >= 0 && a + n <= u8.length)) throw new RangeError(`the kernel read or wrote outside the memory, at ${a}`); };
  const debug = (kind: number, a: number, b: number, c: number) => hosts.debug ? hosts.debug(kind, a, b, c) : 0;
  // (built: a rule's body as a function of its own (`Program{O: @wasm.none}`), run by the host's table: what it answers)
  const compiled = (fn: number, t: number, f: number, from: number) => hosts.compiled ? hosts.compiled(fn, t, f, from) : 0;
  // (what is said, told the host as it is said: it says it, no more is kept)
  const told = (at: number, kind: number, a: number, c: number) => hosts.told ? hosts.told(at, kind, a, c) : 0;
  const w = DEBUG ? (a: number) => (outside(a, 4), i32[a >> 2]) : (a: number) => i32[a >> 2], set = DEBUG ? (a: number, v: number) => { outside(a, 4); i32[a >> 2] = v; } : (a: number, v: number) => { i32[a >> 2] = v; };
  const b = DEBUG ? (a: number) => (outside(a, 1), u8[a]) : (a: number) => u8[a], setb = DEBUG ? (a: number, v: number) => { outside(a, 1); u8[a] = v; } : (a: number, v: number) => { u8[a] = v; };
  const aload = (a: number) => Atomics.load(i32, a >> 2), astore = (a: number, v: number) => { Atomics.store(i32, a >> 2, v); }, xadd = (a: number, v: number) => Atomics.add(i32, a >> 2, v), fill = (a: number, v: number, n: number) => { u8.fill(v, a, a + n); }, cas = (a: number, o: number, n: number) => Atomics.compareExchange(i32, a >> 2, o, n);
  // Writes: each one that puts a newer place where an older one is (a pointer into what an application still running made,
  // into what was there before it): that application's memory is kept when it returns, the rest let go of
  // (each application running keeps, at its level (16 bytes: where its memory began, the lowest place a value newer than the
  // first of its chunk was put (one past where allocation is, in another chunk: below them all), its chunk's end, where the
  // first application in that chunk began), what a write needs)
  // (a write of something newer into older memory, kept so that what it holds may be moved: where it was written)
  // (full: of a place given more than once, only its last kept (each level that asks for the one before asks for the last
  // too), and where each level's begin among those left; still nearly full, nothing more is moved this statement)
  function ev_log(a: number) { const b0 = w(THREAD + EV); if (!w(b0) || w(b0 + 40)) return; if (w(b0 + 8) >= w(b0 + 12) && w(b0 + 48)) ev_compact(b0); const n = w(b0 + 8); if (n < w(b0 + 12)) { set(w(b0 + 4) + 4 * n, a); set(b0 + 8, n + 1); } else set(b0 + 40, 1); }
  function ev_compact(b0: number) {
    const lg = w(b0 + 4), n = w(b0 + 8), hs = w(b0 + 48), hm = w(b0 + 52), lv = w(b0 + 16), ln = w(THREAD + T_LVL_N), kn = ln < 6000 ? ln : 6000;
    fill(hs, 0, 4 * (hm + 1));
    for (let i = n - 1; i >= 0; i--) {
      const a = w(lg + 4 * i); let h = mix(a) & hm, seen = 0;
      for (let q = 0; q <= hm; q++) { const x = w(hs + 4 * h); if (!x) { set(hs + 4 * h, a); break; } if (x === a) { seen = 1; break; } h = (h + 1) & hm; }
      if (seen) set(lg + 4 * i, 0);
    }
    let to = 0, k = 0;
    for (let i = 0; i <= n; i++) {
      while (k < kn && w(lv + 4 * k) <= i) { set(lv + 4 * k, to); k++; }
      if (i < n) { const a = w(lg + 4 * i); if (a) { set(lg + 4 * to, a); to++; } }
    }
    set(b0 + 8, to);
    if (to >= w(b0 + 12) - (w(b0 + 12) >> 3)) set(b0 + 40, 1);
  }
  // (a thread's own words, its scratch and its stack of what is being checked: what they hold is let go of as it runs, so a
  // write there keeps nothing an application made (what still holds it when that is done is asked then)) TODO(explicit)
  function transient(a: number): number { if (a >= THREAD && a < THREAD + 1024) return 1; const se = w(THREAD + T_SCRATCH_END); if (a < se && a >= se - 2048 * SCRATCH) return 1; const ty = w(THREAD + T_TYP); if (ty && a >= ty && a < ty + 12 * TYPS) return 1; const sk = w(THREAD + T_STACK); return sk && a >= sk && a < sk + 8 * DEPTH ? 1 : 0; }
  function put(a: number, v: number) { set(a, v); const n = w(THREAD + T_LVL_N); if (n) { const top = w(THREAD + T_LVL) + 24 * (n - 1); if (v >= w(top + 12) && v < w(THREAD + T_CHUNK) && !transient(a)) { const lo = a >= w(THREAD + T_CHUNK) ? -1 : a; if (w(THREAD + T_PROF) && lo < w(top)) { const k = a >= THREAD && a < THREAD + 1024 ? 600 + 4 * (((a - THREAD) >> 2) & 63) : 596; set(THREAD + k, w(THREAD + k) + 1); const pr = w(THREAD + T_PROF), ru = w(top + 16); for (let h = (ru >> 3) & 4095, q = 0; q < 4096; q++, h = (h + 1) & 4095) { const m = pr + 16 * h; if (w(m) === ru || !w(m)) { set(m, ru); set(m + 12, w(m + 12) + 1); break; } } } if (lo >= 0 && lo < w(top) && w(THREAD + EV)) ev_log(a); if (lo < w(top + 4)) set(top + 4, lo); } } }
  function aput(a: number, v: number) { astore(a, v); const n = w(THREAD + T_LVL_N); if (n) { const top = w(THREAD + T_LVL) + 24 * (n - 1); if (v >= w(top + 12) && v < w(THREAD + T_CHUNK) && !transient(a)) { const lo = a >= w(THREAD + T_CHUNK) ? -1 : a; if (lo >= 0 && lo < w(top) && w(THREAD + EV)) ev_log(a); if (lo < w(top + 4)) set(top + 4, lo); } } }
  function acas(a: number, o: number, v: number): number { const was = cas(a, o, v); const n = w(THREAD + T_LVL_N); if (n) { const top = w(THREAD + T_LVL) + 24 * (n - 1); if (v >= w(top + 12) && v < w(THREAD + T_CHUNK) && !transient(a)) { const lo = a >= w(THREAD + T_CHUNK) ? -1 : a; if (lo >= 0 && lo < w(top) && w(THREAD + EV)) ev_log(a); if (lo < w(top + 4)) set(top + 4, lo); } } return was; }
  const clz = (x: number) => Math.clz32(x), ctz = (x: number) => x === 0 ? 32 : 31 - Math.clz32(x & -x);
  void astore; void clz; void ctz; void setb;

  // (the words every thread shares)
  const HEAP = 0, OPEN = 4, OPEN_LENGTH = 8, CLOSE = 12, CLOSE_LENGTH = 16, GLOBAL = 24, SEPARATOR = 36, SEPARATOR_LENGTH = 40, CLASSES = 44, PAIRS = 48, FRAMES = 52;
  const WORDS = 56, LOG = 60, LOG_N = 64, LOG_CAP = 68, AFTER = 72, AFTER_HEAD = 76, AFTER_TAIL = 80, AFTER_CAP = 84, AFTER_ENTRY = 28, ACTIVE = 88, LIST = 92, LIST_N = 96, LIST_CAP = 100, LIMIT = 104, OOM = 108, TRASH = 112, BUDGET = 116, FAIL_FAST = 120, MEMO = 124, MEMO_MASK = 128, PEND = 140, PEND_N = 136, PHASE = 144, NEXT = 148, DONE = 152, ANY = 156, ROUND = 160, FINAL = 0x7FFFFFFF, READS = 164, READS_N = 168, READS_CAP = 172, LAZY = 180, LAZY_N = 184, LAZY_CAP = 188, PASSED = 192, FAILED = 196, TMEMO = 208, TMEMO_MASK = 212, BEGINS = 200, BEGINS_N = 4096, COUNTS = 216, MEMO_ENTRY = 60, TMEMO_ENTRY = 40, FILES_N = 136, CLOSES = 220, PAIRS_GEN = 224, KINDS = 228, MAPPED = 232, NOTHING = 236, TEXTS = 252, RULES = 256, RULES_N = 260, RULES_CAP = 264, OWN = 268, TOKEN_N = 272, LEVEL = 480, LEVEL_OF = 484, LIST_READING = 488;
  // (what --debug counts, at COUNTS: the host says them)
  const K_READ = 0, K_NODE = 1, K_VISIT = 2, K_HOLE_LED = 3, K_MATCH = 4, K_READING = 5, K_AFRESH = 6, K_TYPED = 7, K_APPLY = 8, K_FRAMED = 9, K_SHADOWED = 10;
  function count(k: number) { xadd(w(COUNTS) + 4 * k, 1); }
  // (this thread's words: given, a constant of what is compiled for it)
  const THREAD = thread | 0, CHUNK = 1 << 24;
  // (a thread's words)
  // (moving what is kept together (off: `RAY_NOEVAC`): its words, at the thread's `EV`; a size's marks) TODO(explicit)
  const EV = 940, EV_BYTES = 1 << 31, EV_MARK = 1 << 30, EV_SIZE = (1 << 30) - 1;
  const T_CHUNK = 52, T_CHUNK_END = 56, T_SLOT = 60, T_SLOT_END = 64, T_HELD = 68, T_HELD_N = 72, T_SCRATCH = 0, T_JUMP_S = 4, T_JUMP_N = 8, T_JUMP_V = 12, T_HOLE = 16, T_TESTING = 20, T_BUDGET = 24, T_SAID = 28, T_FAULT = 32, T_ON = 36, T_A = 40, T_B = 44, T_ERRED = 48, T_DEPTH = 76, T_SH = 80, T_SH_N = 84, T_MARK = 88, T_MARK_LO = 92, T_MARK_HI = 96, T_ROOT = 100, T_ISO = 104, T_QUIET = 108, T_DECLS = 112, T_DECLS_N = 116, T_HOLE_A = 120, T_HOLE_B = 124, T_DECL = 128, T_PLACE_IN = 132, T_INL_S = 136, T_INL_E = 140, T_INL_F = 144, T_TYP = 148, T_TYP_N = 152, T_REFF = 156, T_CUT = 160, T_LEXV = 164, T_SHGEN = 168, T_CS = 172, T_CE = 176, T_CT = 180, T_RAN = 184, T_SCRATCH_END = 188, T_BODY = 192, T_ONE = 196, T_MEMBER = 200, T_BODIES = 204, T_BODIES_N = 208, T_FALLBACK = 212, T_REG = 216, T_REG_N = 220, T_WROTE = 224, T_WROTE_N = 228, T_FREE = 232, T_FREE_N = 236, T_REG_SLOT = 240, T_REG_SLOTEND = 244, T_REG_LAZY = 248, T_REG_AT = 252, T_SKIP = 256, T_NAMED = 260, T_LS = 264, T_LE = 268, T_WRITER_SELF = 272, T_LB = 276, T_WRITER = 280, T_TV = 284, T_TVS = 288, T_TVE = 292, T_MEMBER_S = 296, T_MEMBER_E = 300, T_ALL_S = 304, T_ALL_E = 308, T_TOKEN = 312, T_HERE = 316, T_IN2_S = 320, T_IN2_E = 324, T_IN2_F = 328, T_DEFIN = 332, T_OMEMO = 336, T_QBUDGET = 340, T_UNALIGNED = 344, T_WRITTEN_IN = 348, T_CHECKS = 352, CHECKS = 30, T_STACK = 480, T_DEEPC = 484, T_GIVEN = 488, T_GIVEN_N = 492, T_ALT = 496, T_BEGUN = 500, T_BEGUN_N = 504, T_GREW = 508, T_FREE_TAKEN = 512, T_SKIPS = 516, T_SKIPS_N = 520, T_NAMING = 524, T_NAMING_N = 528, T_WRITER_S = 532, T_WRITER_E = 536, T_ALLOCATED = 540, T_PROF = 544, T_PROF_CHILD = 548, T_ALLOC_QUIET = 552, T_CHECK_SAVE = 556, T_LVL = 560, T_LVL_N = 564, T_FREEING = 568, T_WEAK = 584, T_WEAK_N = 588, T_WEAK_ON = 592, T_ESC_T = 572, T_ESC_S = 576, T_ESC_O = 580, GROWN = 15 << 25, TEST_GROWN = 1 << 27, GIVEN_N = 16, OMEMO_MASK = (1 << 14) - 1, LEFTS = 64, TYPS = 1024, SHADOWS = 1024, TYPINGS = 1, DECLS = 64, BEGUN = 40;
  // (the words the host knows, at WORDS: where each is and how long)
  // (the kernel's map: a slot for each of its words (0 to 23), the span a parameter is given at M_SPAN (24) and the count each
  // rule is stamped with in the slot after it (25), then the classes it finds, Node at 26 and String at 27, then the
  // program's arguments, 28 (ARGV_SLOT; language.ts writes them there): past all of those)
  const W_CALLER = 0, W_THIS = 1, W_AFTERWARDS = 2, W_REPORT = 3, W_ERRED = 4, W_GOTO = 5, W_LABEL = 6, W_DOT = 7, W_AMP = 8, W_TYPE = 9, W_INCLUDE = 10, W_READ = 11, W_NEXT = 12, W_MEMBERS = 13, W_STATIC = 14, W_UNDEFINED = 15, W_UNSET = 16, W_OPERATED = 17, W_ADMITS = 18, W_HEAD = 19, W_VALUE = 20, W_NARROWS = 21, W_COMPONENTS = 22, W_EACH = 23, W_NONEMPTY = 24, W_LISTING = 25, W_NODE_NAME = 26, W_STRING_NAME = 27, W_OF = 28, W_WRITTEN_AS = 29, W_NAMED = 30, W_WRITTEN_NAME = 31, W_NAMES = 32, W_TAIL = 33, W_NAMED_LIKE = 34, W_MEMBER = 35, W_STRUCTURE_AS = 36, W_OUTPUT = 37, W_ARGUMENTS = 38, W_QUOTED = 39, W_REPEATS = 40, W_SUPERPOSES = 41, W_READABLE = 42, W_TYPED_NAME = 43, W_HEADER_QUOTED = 44, W_TYPE_WRITTEN = 45, W_SPREAD = 46, W_IS_RANGE = 47, W_MAPPED_BY = 48, W_MAPPED = 49, W_DYNAMIC_IN = 50, W_DYNAMIC_OUT = 51, W_ORIGIN_OF = 52, W_HOISTED = 53, W_MISSING = 54, W_MISSING_NAME = 55, W_CALLABLE = 56, W_MADE_OF = 57, W_FUNCTION_GIVEN = 58, W_NAMED_ARGUMENT = 59, W_DEFINES_TEXT = 60, W_READ_AS = 61, W_RULE = 62, W_STYLE = 63, W_SHOWN = 64, W_OUTER_BLOCK = 65, W_O = 66, W_PREVIOUS = 67, W_DESTRUCTURES = 68, W_LONE_READ = 69, W_LEVEL_IN = 70, W_LEVEL_OUT = 71, W_LEVEL_READS = 72, W_IS = 73, ARGV_SLOT = 28, M_TEXT = 0, M_FIRST = 1, M_REST = 2, M_NOTHING = 3, M_GIVEN = 4, M_TAKING = 5, M_SAME = 6, M_UNTIL = 7, M_GLYPHS = 8, M_COUNT = 9, M_TRUTH = 10, M_NUMBER = 11, M_NUMERAL = 12, M_CHARACTER = 13, M_SUPERPOSED = 14, M_SUPERPOSING = 15, M_DOTTED = 16, M_PAST = 17, M_CUTS = 18, M_UNESCAPED = 19, M_INT32 = 20, M_LINKED = 21, M_JOINED = 22, M_KEPT = 23, M_SPAN = 24, M_ARRAYED = 30;
  // (records)
  const N_LAST = 0, N_BASE = 4, N_IS = 8, N_A = 12, N_B = 16, N_PARENT = 20, N_ALSO = 24, NODE = 28;
  const F_RULE = 28, F_CALLER = 32, F_THIS = 36, F_START = 40, F_END = 44, F_CLOSURE = 48, F_RECEIVER = 52, F_TAKES = 56, TAKE = 36;
  // (T_LEX: the rules visible where it was taken, what its code is read with where it was written)
  const T_START = 0, T_END = 4, T_VIS = 8, T_ORIGIN = 12, T_THIS = 16, T_VALUE = 20, T_STATE = 24, T_LEX = 28, T_LEAD = 32;
  const R_PREV = 0, R_KIND = 4, R_MASK = 8, R_HOLES = 12, R_BS = 16, R_BE = 20, R_CLOSURE = 24, R_PARTS = 28, R_HEAD = 32, R_FLAGS = 36, R_OWNER = 40, R_BODY = 44, R_SKIP = 48, R_INL_S = 52, R_INL_E = 56, R_INL_F = 60, R_ALL_S = 64, R_ALL_E = 68, R_STAMP = 72, R_IN2_S = 76, R_IN2_E = 80, R_IN2_F = 84, R_FN = 88, R_SIG = 92, R_PART = 96, PART = 24, SKIPS = 130, SEQ_AT = 130, KIND_AT = 131, MANY = 12;
  const RULE = 0, DEFINE = 1, EXTERNAL = 2, VALUE = 3;
  const LITERAL = 0, SPACE = 1, HOLE = 2, HUG = 16, WORD = 32, VALUED_HOLE = 64, OPER = 128;
  // (IS_CALLED: in a left side, a place and the brackets after it, `f (x)`: its head (N_A to N_B), the place (N_PARENT))
  // (IS_APPLIED: in a left side, a closure and a name after it, no brackets, `xs.for x`: what the head reads up to the name (N_A
  // to N_B), the name's end (N_PARENT))
  const IS_NODE = 0, IS_TEXT = 1, IS_PLACE = 2, IS_HEAD = 3, IS_HOLE = 4, IS_FRAME = 5, IS_CALLED = 6, IS_APPLIED = 7, IS_LAZY = 8, ROOT = 1;
  // (READER: a head of holes only, `{x: T}`, `{first: T}{rest: T[]}`, what reads a T; not a method's, `{this}{argument}`,
  // which reads on a value)
  // (LEFT, wanted of a reading only: it is a left side, a word nothing reads before what is read on it is declared there)
  // (TYPE_READER, refused only: a READER of a node other than the language's)
  // (a thread's levels, `external level_in L`: the last first, before the language's `O`)
  const T_LEVELS_N = 600, T_LEVELS = 604, LEVELS = 8;
  // (the value a level reads, `external level_reads L v`: the text it is spliced in as, and it, while L reads it)
  const T_SPLICE = 640, T_SPLICE_V = 644;
  const DEFINES = 1, LED = 2, HOLES = 4, DEAD = 8, VALUE_OWN = 8192, METHOD = 16, READER = 32, LEFT = 64, TYPE_READER = 128, GIVES = 1024, TAKES = 2048, OWNS = 4096, GLYPHS = 16384, NUMERAL = 32768, SUPERPOSING = 65536, REFUSES = 131072, MEMBER = 262144, STATIC = 524288, CALLS = 1048576, CUTS = 2097152, STYLE_ASKED = 4194304, STYLED_RULE = 8388608, TYPED_READ = 256, MEMBERS_MARK = 99, GLYPHED = 288, GLYPHED_N = 4096, NUMBERS = 276, TRUE_ = 280, FALSE_ = 284, NUMERAL_AT = 296, NUMERAL_AT2 = 316, NUMBER_OPS = 304, CHARS = 312, COUNTED = 320, SUPER_NODE = 324, SUPERPOSING_AT = 328, POOL = 344, POOL_N = 348, POOL_LOCK = 352, POOL_BYTES = 364, POOL_CAP = 1 << 15, KEPT_N = 368, KEPT = 372, KEPT_CAP = 34, STYLES = 332, STYLES_CAP = 1 << 20, GROWN_AT = 508;
  // (a reading: [kind, start, end, a, c, d])
  const K_EMPTY = 0, K_UNREAD = 1, K_LATER = 2, K_RULE = 3, K_REF = 4, K_NAME = 5, K_HELD = 6, K_ON = 7, READ = 32;
  // (a body: [count, ...steps: [kind, start, end, a, c, d]])
  const S_READ = 0, S_LABEL = 1, S_LABELLED = 2, S_GOTO = 3, S_TO = 4, STEP = 24;
  // (what is said: [at, kind, a, c])
  // (what the host is told, with --debug: a statement read and done, a rule applied and done, one defined, memory out)
  const D_STATEMENT = 1, D_STATEMENT_END = 2, D_APPLY = 3, D_APPLY_END = 4, D_DEFINE = 5, D_OOM = 6, D_BLOCK = 7, D_BLOCK_END = 8, D_TEST = 9, D_TEST_END = 10, D_FAULT = 11, D_SAID = 12, D_TYPE = 13, D_TYPE_END = 14, D_RESULT = 22, D_SETTLED = 18, D_READING = 20, D_KEY = 30, D_FREE = 32;
  const L_UNREAD = 1, L_UNLABELLED = 2, L_BUDGET = 3, L_OOM = 4, L_REPORT = 5, L_CYCLE = 6, L_NOT_ON = 7, L_EXTERNAL = 8, L_DEEP = 9, L_STYLED = 10, L_HELD = 11, L_DEFINED = 12, L_VALUED = 13, L_SILENT = 14, L_PASSED = 15, L_MEMORY = 16, L_FULL = 17, L_OUTPUT = 18, L_EXPLAIN = 19, L_TRACE = 20, L_TRACE_NONE = 21, L_TRACE_DONE = 22, L_TRACE_CHECK = 23, L_TRACE_CHECKED = 24, L_STYLE_Q = 25, T_PAINTS = 944, T_CRULE = 948, EXPLAIN_AT = 292, T_TRACE_ARM = 900, T_TRACE_E = 908, T_TRACE_N = 912, T_TRACE_MAX = 916, T_TRACE_DEPTH = 920, T_TRACE_ON = 924, T_TRACE_D = 928, HELD = 4096, DEPTH = 6000, REGION = 4096, WROTE = 1 << 16, BODIES = 1024;
  const SCRATCH = 1024;

  // ---- memory

  // Allocated: its words zero. (Past the limit: a place nothing reads, and said once.)
  // (each thread from chunks of its own, so threads don't wait on one another)
  // (what the threads share of the memory tests let go of: taken and given under a lock, the last ones tried first)
  function locked() { for (let k = 0; k < 1 << 30; k++) if (acas(POOL_LOCK, 0, 1) === 0) return; }
  function pooled(n: number): number {
    locked(); let at = 0; const pn = w(POOL_N);
    for (let i = pn - 1; i >= 0 && i >= pn - 32; i--) if (w(w(POOL) + 8 * i + 4) >= n) { at = w(w(POOL) + 8 * i); put(THREAD + T_FREE_TAKEN, w(w(POOL) + 8 * i + 4)); xadd(POOL_BYTES, -w(w(POOL) + 8 * i + 4)); put(w(POOL) + 8 * i, w(w(POOL) + 8 * (pn - 1))); put(w(POOL) + 8 * i + 4, w(w(POOL) + 8 * (pn - 1) + 4)); put(POOL_N, pn - 1); break; }
    aput(POOL_LOCK, 0); return at;
  }
  function pool(a: number, n: number): number {
    locked(); const pn = w(POOL_N); let ok = 0;
    if (pn < POOL_CAP) { put(w(POOL) + 8 * pn, a); put(w(POOL) + 8 * pn + 4, n); put(POOL_N, pn + 1); xadd(POOL_BYTES, n); ok = 1; }
    aput(POOL_LOCK, 0); return ok;
  }
  // (String.ray's `Escape`: what `\c` stands for, by c; none, -1)
  function escape_of(c: number): number {
    return c === 48 ? 0 : c === 97 ? 7 : c === 98 ? 8 : c === 116 ? 9 : c === 110 ? 10 : c === 102 ? 12 : c === 114 ? 13 : c === 101 ? 27 : c === 92 || c === 34 || c === 123 ? c : -1;
  }
  function hex_digit(c: number): number { return c >= 48 && c <= 57 ? c - 48 : c >= 97 && c <= 102 ? c - 87 : c >= 65 && c <= 70 ? c - 55 : -1; }
  // (what is allocated, a size before it when what is kept is moved together: which words are values, which bytes)
  // TODO(explicit)
  function alloc(n: number): number { return alloc_(n, 0); }
  function allocb(n: number): number { return alloc_(n, EV_BYTES); }
  function alloc_(n: number, kind: number): number {
    n = (n + 3) & -4;
    const hdr = w(THREAD + EV) && w(w(THREAD + EV)) ? 4 : 0; n += hdr;
    set(THREAD + T_ALLOCATED, w(THREAD + T_ALLOCATED) + n); if (w(THREAD + T_QUIET)) set(THREAD + T_ALLOC_QUIET, w(THREAD + T_ALLOC_QUIET) + n);
    if (DEBUG && w(THREAD + T_TESTING)) debug(D_FAULT, 1108, n, 0);
    let at = w(THREAD + T_CHUNK);
    if (at + n > w(THREAD + T_CHUNK_END)) {
      let size = n > CHUNK ? n : CHUNK;
      // (what one statement may take that is new: past that it is stopped, said (what it reads makes more and more), not
      // all the memory there is taken; as much as the run is given, `RAY_STATEMENT_MB`, a program read as one statement)
      // (a test less: every thread runs one, all of them in the same memory; past it, asked again with each new chunk, so
      // what stops it is not undone by what it was in)
      const grew = w(THREAD + T_GREW) + size, allowed = (w(FAIL_FAST) & 1024) ? 1 << 30 : w(THREAD + T_TESTING) ? TEST_GROWN : w(GROWN_AT) || GROWN;
      if (grew > allowed) { if (DEBUG && w(THREAD + T_FAULT) !== L_MEMORY) debug(D_FAULT, 1098, w(THREAD + T_DEPTH), 0); put(THREAD + T_FAULT, L_MEMORY); }
      // (and a test, when what is left of all the memory is less than one test may take: stopped too)
      // (what is free: past where the memory is used, and what tests let go of, shared)
      // (kept free past that: twice what one may take, what this one asks, and a little for each thread running a test (each may
      // take more before it asks again))
      if (w(THREAD + T_TESTING) && w(LIMIT) - aload(HEAP) + aload(POOL_BYTES) < 2 * allowed + size + aload(ACTIVE) * (1 << 20) && w(THREAD + T_FAULT) !== L_MEMORY) put(THREAD + T_FAULT, L_FULL);
      // (and a statement read, when what is left is less than one may take: stopped, the run not; given as much as the run
      // says, only when what is left is less than it asks)
      if (!w(THREAD + T_TESTING) && w(LIMIT) - aload(HEAP) + aload(POOL_BYTES) < (w(GROWN_AT) ? 0 : allowed) + size && w(THREAD + T_FAULT) !== L_MEMORY) put(THREAD + T_FAULT, L_FULL);
      // (one a test let go of, big enough; else a new one)
      const fl = w(THREAD + T_FREE), fn = w(THREAD + T_FREE_N);
      at = 0;
      // (debugging: none taken again, so what still keeps one is seen)
      for (let i = fn - 1; i >= 0 && i >= fn - 8; i--) if (w(fl + 8 * i + 4) >= n) { at = w(fl + 8 * i); size = w(fl + 8 * i + 4); put(fl + 8 * i, w(fl + 8 * (fn - 1))); put(fl + 8 * i + 4, w(fl + 8 * (fn - 1) + 4)); set(THREAD + T_FREE_N, fn - 1); break; }
      // (else one any thread's test let go of, from what they share)
      if (!at && w(POOL)) { at = pooled(n); if (at) size = w(THREAD + T_FREE_TAKEN); }
      // (in a test, a new one on pages of its own: whose it is, by its pages)
      if (!at && w(THREAD + T_REG_AT)) { size = (size + 65535) & -65536; for (let k = 0; k < 1 << 20; k++) { const h = aload(HEAP), a = (h + 65535) & -65536; if (acas(HEAP, h, a + size) === h) { at = a; break; } } if (DEBUG) { debug(D_FAULT, 1093, 4, size); debug(D_FAULT, 1093, size > 65536 ? 5 : 6, size); debug(D_FAULT, 1093, 7 + (w(THREAD + T_FREE_N) > 0 ? 1 : 0), n); } if ((at < 0 || at > w(LIMIT) - size)) { if (DEBUG) debug(D_OOM, n, 0, 0); if (!xadd(OOM, 1)) log(0, L_OOM, 0, 0); return w(TRASH); } }
      if (!at) {
        at = xadd(HEAP, size);
        if (DEBUG && w(THREAD + T_TESTING)) debug(D_FAULT, 1093, 1, size);
        if ((at < 0 || at > w(LIMIT) - size)) { if (DEBUG) debug(D_OOM, n, 0, 0); if (!xadd(OOM, 1)) log(0, L_OOM, 0, 0); return w(TRASH); }
      }
      set(THREAD + T_GREW, w(THREAD + T_GREW) + size);
      // (in a test: one of its own, let go of when it is done)
      const rg = w(THREAD + T_REG), rn = w(THREAD + T_REG_N);
      if (w(THREAD + T_REG_AT) && rn < REGION) { put(rg + 8 * rn, at); put(rg + 8 * rn + 4, size); set(THREAD + T_REG_N, rn + 1); if (!(at & 65535)) for (let pg = at >>> 16; pg < (at + size) >>> 16; pg++) put(w(OWN) + 4 * pg, w(THREAD + T_TOKEN)); else set(THREAD + T_UNALIGNED, 1); }
      set(THREAD + T_CHUNK_END, at + size);
    }
    set(THREAD + T_CHUNK, at + n);
    if (DEBUG) for (let p = at; p < at + n; p += 4) { if (w(p) !== 0 && w(p) !== -1) debug(D_FAULT, 93, p, w(p)); put(p, 0); }
    if (hdr) { set(at, (n - 4) | kind); return at + 4; }
    return at;
  }
  // (a slot of what is kept for all (read once, checked once, how a type begins) written in a test: emptied when it is done)
  function wrote(slot: number) { if (!w(THREAD + T_REG_AT)) return; const n = w(THREAD + T_WROTE_N); if (n < WROTE) { put(w(THREAD + T_WROTE) + 4 * n, slot); set(THREAD + T_WROTE_N, n + 1); } else set(THREAD + T_WROTE_N, WROTE + 1); }
  // (made in this test's own memory)
  function in_region(n: number): number {
    const rg = w(THREAD + T_REG);
    if (!w(THREAD + T_REG_AT)) return 0;
    if (n >= w(THREAD + T_REG_AT) && n < w(THREAD + T_MARK_HI)) return 1;
    // (on pages it took: by whose they are; else, one it took that is not on its own pages)
    if (n > 0 && w(w(OWN) + 4 * (n >>> 16)) === w(THREAD + T_TOKEN)) return 1;
    if (w(THREAD + T_UNALIGNED)) for (let i = 0; i < w(THREAD + T_REG_N) && i < REGION; i++) if ((w(rg + 8 * i) & 65535) && n >= w(rg + 8 * i) && n < w(rg + 8 * i) + w(rg + 8 * i + 4)) return 1;
    return 0;
  }
  // (let go of by a test that is done, and not taken again since: nothing may still keep it)
  function freed(n: number): number {
    const fl = w(THREAD + T_FREE);
    for (let i = 0; i < w(THREAD + T_FREE_N) && i < REGION; i++) if (n >= w(fl + 8 * i) && n < w(fl + 8 * i) + w(fl + 8 * i + 4)) return 1;
    return 0;
  }
  // A test's own memory: from where allocation is when it begins, what it takes after; let go of when it (and what it held) is
  // done, but for what it gave the frame it is (a value of no holes, its style: made again, kept). What was kept for all from
  // it (read once, checked once, its frames painted) is forgotten with it.
  function region_begin(t: number, f: number) {
    if (!w(t + T_REG)) { put(t + T_FREE, alloc(8 * REGION)); put(t + T_WROTE, alloc(4 * WROTE)); put(t + T_REG, alloc(8 * REGION)); put(t + T_BODIES, alloc(8 * BODIES)); if (w(MEMO)) put(t + T_OMEMO, alloc(MEMO_ENTRY * (OMEMO_MASK + 1))); }
    if (!w(t + T_HELD)) put(t + T_HELD, alloc(8 * HELD));
    if (!w(t + T_TYP)) put(t + T_TYP, alloc(12 * TYPS));
    if (!w(t + T_DECLS)) put(t + T_DECLS, alloc(12 * DECLS));
    if (!w(t + T_SH)) put(t + T_SH, alloc(12 * SHADOWS));
    if (!w(t + T_LS)) put(t + T_LS, alloc(8 * LEFTS));
    set(t + T_REG_N, 0); set(t + T_WROTE_N, 0); set(t + T_UNALIGNED, 0); put(t + T_REG_AT, w(t + T_CHUNK)); set(t + T_TOKEN, xadd(TOKEN_N, 1) + 1);
    put(t + T_REG_SLOT, w(t + T_SLOT)); put(t + T_REG_SLOTEND, w(t + T_SLOT_END)); put(t + T_REG_LAZY, aload(LAZY_N));
    return w(f + N_LAST);
  }
  function region_end(t: number, f: number, rules: number) {
    // (what it gave its frame: each value of no holes read now, its text kept)
    const keep = w(t + T_SCRATCH_END) - 256; let kn = 0;
    for (let o = w(f + N_LAST); o && o !== rules && kn < 8; o = w(o)) {
      if (w(o + R_HOLES) || !w(o + R_HEAD)) continue;
      const hd = w(o + R_HEAD), v = apply(t, o, 0, f, 0, f, w(hd + N_A), w(hd + N_B), f, f);
      if (v && w(v + N_IS) === IS_TEXT && !in_region(w(v + N_A))) { put(keep + 16 * kn, w(hd + N_A)); put(keep + 16 * kn + 4, w(hd + N_B)); put(keep + 16 * kn + 8, w(v + N_A)); put(keep + 16 * kn + 12, w(v + N_B)); kn++; }
    }
    const kept = keep;
    put(f + N_LAST, rules);
    // (forgotten: what was kept for all from it, its frames, the types it put off)
    const wn = w(t + T_WROTE_N);
    if (wn > WROTE) { for (let i = 0; i <= OMEMO_MASK && w(t + T_OMEMO); i++) aput(w(t + T_OMEMO) + MEMO_ENTRY * i, 0); for (let tab = w(TMEMO); tab; tab = w(tab - 8)) { for (let i = 0; i <= w(tab - 12); i++) aput(tab + TMEMO_ENTRY * i, 0); set(tab - 4, 0); } for (let i = 0; i < BEGINS_N; i++) aput(w(BEGINS) + 44 * i, 0); }
    else for (let i = 0; i < wn; i++) aput(w(w(t + T_WROTE) + 4 * i), 0);
    if (DEBUG && wn > WROTE) debug(D_FAULT, 94, w(f + F_START), w(f + F_END));
    // (what lies outside every chunk it took is not its own: asked first)
    let lo = w(t + T_REG_AT), hi = w(t + T_MARK_HI);
    for (let i = 0; i < w(t + T_REG_N) && i < REGION; i++) { const a = w(w(t + T_REG) + 8 * i), e = a + w(w(t + T_REG) + 8 * i + 4); if (a < lo) lo = a; if (e > hi) hi = e; }
    for (let k = w(t + T_REG_SLOT); k < w(t + T_SLOT) && k < w(LIST_CAP); k++) { const v = w(w(LIST) + 4 * k); if (v >= lo && v < hi && in_region(v)) put(w(LIST) + 4 * k, 0); }
    for (let i = w(t + T_REG_LAZY); i < aload(LAZY_N) && i < w(LAZY_CAP); i++) { const l = w(LAZY) + 24 * i, v = w(l); if (v >= lo && v < hi && in_region(v)) put(l, 0); }
    // (let go of: its chunks free for what comes after, allocation where it was)
    const rg = w(t + T_REG), fl = w(t + T_FREE);
    if (DEBUG) { let held = 0; for (let i = 0; i < w(t + T_REG_N) && i < REGION; i++) held += w(rg + 8 * i + 4); if (held > 50 << 20) debug(D_FAULT, 1094, w(f + F_START), held >> 20); }
    // (to what every thread shares, so one thread's large test is not memory only it can use again; full, its own)

    // (debugging: what it let go of unreadable until it is allocated again, so what still keeps it is seen)
    // (and as new: what is allocated is all zero)
    const was = DEBUG ? -1 : 0;
    if (DEBUG) { debug(D_FREE, w(t + T_REG_AT), w(t + T_MARK_HI), f); for (let i = 0; i < w(t + T_REG_N) && i < REGION; i++) debug(D_FREE, w(rg + 8 * i), w(rg + 8 * i) + w(rg + 8 * i + 4), f); }
    if (w(t + T_MARK_HI) > w(t + T_REG_AT)) fill(w(t + T_REG_AT), was, w(t + T_MARK_HI) - w(t + T_REG_AT));
    for (let i = 0; i < w(t + T_REG_N) && i < REGION; i++) fill(w(rg + 8 * i), was, w(rg + 8 * i + 4));
    // (given back once cleared: what another thread takes is all zero)
    for (let i = 0; i < w(t + T_REG_N) && i < REGION; i++) { if (w(POOL) && pool(w(rg + 8 * i), w(rg + 8 * i + 4))) continue; const fn = w(t + T_FREE_N); if (fn < REGION) { put(fl + 8 * fn, w(rg + 8 * i)); put(fl + 8 * fn + 4, w(rg + 8 * i + 4)); set(t + T_FREE_N, fn + 1); } }
    if (w(t + T_BODIES_N)) { for (let i = 0; i < 2 * BODIES; i++) put(w(t + T_BODIES) + 4 * i, 0); set(t + T_BODIES_N, 0); }
    set(t + T_REG_N, 0);
    set(t + T_CHUNK, w(t + T_REG_AT)); set(t + T_CHUNK_END, w(t + T_MARK_HI));
    put(t + T_REG_AT, 0);
    // (and what it gave its frame, made again here)
    for (let i = 0; i < kn; i++) {
      const hs = w(kept + 16 * i), he = w(kept + 16 * i + 4), value = node(IS_TEXT, w(kept + 16 * i + 8), w(kept + 16 * i + 12), w(TEXTS) || w(GLOBAL), 0), named_ = alloc(R_PART + PART);
      put(named_ + R_KIND, VALUE); put(named_ + R_MASK, bytes(hs, he)); put(named_ + R_BS, value); put(named_ + R_PARTS, 1); put(named_ + R_FLAGS, LED);
      put(named_ + R_HEAD, node(IS_HEAD, hs, he, f, 0)); put(named_ + R_OWNER, f); put(named_ + R_PART, LITERAL); put(named_ + R_PART + 4, skip(hs, he)); let z = he; while (z > hs && b(z - 1) <= 32) z--; put(named_ + R_PART + 8, z - skip(hs, he));
      link(f, named_);
    }
    set(t + T_SLOT, w(t + T_REG_SLOT)); set(t + T_SLOT_END, w(t + T_REG_SLOTEND));
  }
  function node(is: number, a: number, c: number, parent: number, also: number): number {
    const n = alloc(NODE), anchor = alloc(R_PART);
    put(anchor + R_FLAGS, DEAD); put(anchor + R_OWNER, n);
    put(n + N_LAST, anchor); put(n + N_BASE, anchor); put(n + N_IS, is); put(n + N_A, a); put(n + N_B, c); put(n + N_PARENT, parent); put(n + N_ALSO, also);
    return n;
  }
  // (the node a rule is in)
  function owner(rule: number) { return rule ? w(rule + R_OWNER) : w(GLOBAL); }
  // A rule's application: what its holes took (`caps`: start, end each), written with `names` (its takes read where `written`).
  function frame(rule: number, caller: number, self: number, s: number, e: number, caps: number, names: number, written: number, on: number): number {
    const holes = rule ? w(rule + R_HOLES) : 0, f = alloc(F_TAKES + TAKE * holes), seen = w(FRAMES) ? w(w(FRAMES) + N_BASE) : 0;
    put(f + N_LAST, seen); put(f + N_BASE, seen); put(f + N_IS, IS_FRAME); put(f + N_PARENT, w(FRAMES));
    put(f + F_RULE, rule); put(f + F_CALLER, caller); put(f + F_THIS, self); put(f + F_START, s); put(f + F_END, e); put(f + F_CLOSURE, rule ? w(rule + R_CLOSURE) : 0); put(f + F_RECEIVER, on);
    for (let i = 0; i < holes; i++) {
      const tk = f + F_TAKES + TAKE * i;
      // (a part of a typed hole's text another rule took (`,` in `{arguments: Arguments}`): read by that type too)
      const tv = w(THREAD + T_TV), vis = w(rule + R_PART + PART * part(rule, i) + 16) || (tv && w(rule + R_OWNER) !== tv && w(caps + 8 * i) >= w(THREAD + T_TVS) && w(caps + 8 * i + 4) <= w(THREAD + T_TVE) ? tv : 0);
      // (TODO(explicit): a hole whose code begins a member's text read in a value, `x.keys{p}#`'s `keys{p}`: read in that value
      // (`T_LEAD`), what it does not read read where the line was written; the rest of what the rule took, where the line was)
      const mb = !i && (w(rule + R_PART) & 15) === HOLE && !(w(rule + R_FLAGS) & METHOD) ? w(THREAD + T_MEMBER) : 0, leads = mb && mb !== written && w(mb + N_IS) === IS_NODE && w(caps + 8 * i) < w(caps + 8 * i + 4) && skip(w(caps + 8 * i), w(caps + 8 * i + 4)) === skip(w(THREAD + T_MEMBER_S), w(THREAD + T_MEMBER_E)) && w(caps + 8 * i + 4) <= w(THREAD + T_MEMBER_E);
      put(tk + T_START, w(caps + 8 * i)); put(tk + T_END, w(caps + 8 * i + 4)); put(tk + T_VIS, vis); put(tk + T_ORIGIN, names); put(tk + T_THIS, written); put(tk + T_LEX, w(THREAD + T_LEXV)); put(tk + T_LEAD, leads ? mb : 0);
    }
    // (in a test, when the host asks for what is painted there (`T_PAINTS`): one of a rule shown in a style told at once, gone
    // when the test is done; whether a rule is, asked of the host once) TODO(explicit)
    if (rule && w(THREAD + T_REG_AT) && w(THREAD + T_PAINTS)) {
      let fl = w(rule + R_FLAGS);
      if (!(fl & STYLE_ASKED)) { fl = fl | STYLE_ASKED | (told(0, L_STYLE_Q, rule, 0) ? STYLED_RULE : 0); set(rule + R_FLAGS, fl); }
      if (fl & STYLED_RULE) log(s, L_STYLED, f, 1);
    }
    // (listed, for what is painted; not a test's own, forgotten when it is done)
    if (rule && !w(THREAD + T_REG_AT)) {
      let k = w(THREAD + T_SLOT);
      if (k >= w(THREAD + T_SLOT_END)) { k = xadd(LIST_N, 256); set(THREAD + T_SLOT_END, k + 256); }
      set(THREAD + T_SLOT, k + 1);
      if (k < w(LIST_CAP)) set(w(LIST) + 4 * k, f);
    }
    return f;
  }
  function part(rule: number, hole: number) { for (let k = 0; k < w(rule + R_PARTS); k++) { const q = rule + R_PART + PART * k; if ((w(q) & 15) === HOLE && w(q + 12) === hole) return k; } return 0; }
  // Said: where, what kind, about what.
  function log(at: number, kind: number, a: number, c: number) {
    // (quiet, a check: nothing said; but memory running out is said wherever it happens)
    if (w(THREAD + T_QUIET) && kind !== L_OOM) return;
    told(at, kind, a, c);
  }
  function say(t: number, at: number, kind: number, a: number, c: number) {
    if (DEBUG) { debug(D_SAID, kind, a, c); debug(D_FAULT, 1091, at, w(t + T_DEPTH)); } log(at, kind, a, c); set(t + T_SAID, w(t + T_SAID) + 1);
  }
  // (too deep: the rules applied last, the fewest that repeat (the same rule again, each `period` deep), outermost first,
  // each its head and where it was applied; kept (not in what a test lets go of) to be said with the fault)
  // (a rule the map says superposes, `{f}({argument: Superposed})`, applied: its typed holes' values (read once, kept in their
  // takes), each asked as the kernel answers `superposed`; one superposed, its body (-1); none, what is read there without it,
  // given those values (not read again: a call in a call in a call is read once, not twice at each))
  function superposing(t: number, rule: number, applied: number): number {
    // (in a left side: what the rules before it read there, nothing read)
    const gs = w(t + T_GIVEN), g0 = w(t + T_GIVEN_N), asks = !w(t + T_DECL) && w(SUPER_NODE);
    let any = 0, h = 0;
    for (let k = 0, n = asks ? w(rule + R_PARTS) : 0; k < n; k++) {
      const q = rule + R_PART + PART * k; if ((w(q) & 15) !== HOLE) continue;
      if (w(q + 16)) {
        // (read as code, not by its type: the type is asked of what it answers)
        const tk = applied + F_TAKES + TAKE * h; put(tk + T_VIS, 0); const v = valued(t, tk);
        if (stopped(t)) { put(t + T_GIVEN_N, g0); return 0; }
        if (v && superposed_node(v, 0)) any = 1;
        const gn = w(t + T_GIVEN_N);
        if (gs && gn < GIVEN_N) { const x = gs + 16 * gn; put(x, skip(w(tk), w(tk + 4))); put(x + 4, trim_end(w(tk), w(tk + 4))); put(x + 8, w(tk + T_ORIGIN)); put(x + 12, v); put(t + T_GIVEN_N, gn + 1); }
      }
      h++;
    }
    if (any) { put(t + T_GIVEN_N, g0); return -1; }
    // (none: what reads it without it, given what was read (the register emptied by who reads that))
    put(t + T_ALT, 1); return 0;
  }
  // (a method applied, its typed holes each asked of what they took, as written where they were (once, now, not at every
  // reading that tries it): one not of its type, refused)
  function refused(t: number, rule: number, applied: number, written: number): number {
    if (w(t + T_DECL)) return 0;
    let h = 0;
    for (let k = 0, n = w(rule + R_PARTS); k < n; k++) {
      const q = rule + R_PART + PART * k; if ((w(q) & 15) !== HOLE) continue;
      const type = w(q + 16);
      if (type > 1) {
        const tk = follow(applied + F_TAKES + TAKE * h, 1), sc = w(t + T_SCRATCH), wv = w(t + T_WRITTEN_IN);
        if (sc + 3 * SCRATCH > w(t + T_SCRATCH_END)) return 0;
        put(t + T_SCRATCH, sc + SCRATCH); set(t + T_WRITTEN_IN, written);
        const ok = typed_(w(tk), w(tk + 4), type, sc);
        put(t + T_SCRATCH, sc); set(t + T_WRITTEN_IN, wv);
        if (!ok) return 1;
      }
      h++;
    }
    return 0;
  }
  // (a take of a span a superposing rule read, there: that value)
  function given(tk: number): number {
    const gs = w(THREAD + T_GIVEN), n = w(THREAD + T_GIVEN_N); if (!n) return 0;
    const a = skip(w(tk), w(tk + 4)), z = trim_end(w(tk), w(tk + 4)), o = w(tk + T_ORIGIN);
    for (let i = n - 1; i >= 0; i--) { const x = gs + 16 * i; if (w(x) === a && w(x + 4) === z && w(x + 8) === o) return w(x + 12); }
    return 0;
  }
  // (nothing read it: said, or, too deep, which rules went round)
  function unread(t: number, s: number, e: number) {
    if (w(t + T_FAULT) !== L_DEEP) return say(t, s, L_UNREAD, s, e);
    say(t, s, L_DEEP, w(t + T_DEEPC), 0);
  }
  function deep(t: number, depth: number) {
    const st = w(t + T_STACK); put(t + T_DEEPC, 0); if (!st) return;
    // (from the deepest: entry i at top - 8 i; a rule by its head (the same rule made again, in another frame, is the same))
    // (the deepest few may be on their way out of it: looked past, up to 256 of them)
    let top = st + 8 * (depth - 1), period = 0;
    for (let o = 0; o <= 256 && !period && o < depth; o++) {
      const at = st + 8 * (depth - 1 - o), room = depth - o;
      for (let p = 1; 3 * p <= room - 1 && p <= 300 && !period; p++) {
        let ok = 1;
        for (let i = 0; i < 3 * p && ok; i++) if (!same_step(at - 8 * i, at - 8 * (i + p))) ok = 0;
        if (ok) { period = p; top = at; }
      }
    }
    // (and where it began: the first that is not the cycle, below it, what entered it)
    let into = 0;
    if (period) { const room = (top - st) / 8 + 1; let i = period; while (i < room && same_step(top - 8 * i, top - 8 * (i - period))) { i++; } if (i < room) into = top - 8 * i; }
    // (no rules again and again: the ones most often on the way down, how often)
    const n = period ? period : 64, buf = xadd(HEAP, 16 + 16 * (n + 1));
    if (buf < 0 || buf >= w(LIMIT) - 16 - 16 * (n + 1)) return;
    put(buf, n); put(buf + 4, period); put(buf + 8, into ? 1 : 0); put(buf + 12, depth);
    for (let i = 0; i <= n; i++) { const q = buf + 16 + 16 * i; put(q, 0); put(q + 4, 0); put(q + 8, 0); put(q + 12, 0); }
    if (period) for (let i = 0; i <= n; i++) {
      let x = into; if (i < n) x = top - 8 * (n - 1 - i);
      if (!x) continue;
      const q = buf + 16 + 16 * i, r = w(x), hd = r ? w(r + R_HEAD) : 0;
      put(q, hd ? w(hd + N_A) : 0); put(q + 4, hd ? w(hd + N_B) : 0); put(q + 8, w(x + 4)); put(q + 12, 1);
    }
    else for (let d = 0; d < depth; d++) {
      const x = st + 8 * d, r = w(x); if (!r) continue;
      const hd = w(r + R_HEAD); if (!hd) continue;
      let k = 0; while (k < n && w(buf + 16 + 16 * k + 12) && w(buf + 16 + 16 * k) !== w(hd + N_A)) { k++; }
      if (k < n && w(buf + 16 + 16 * k + 12)) { put(buf + 16 + 16 * k + 12, w(buf + 16 + 16 * k + 12) + 1); continue; }
      // (a new one: in a free place, else in place of the least often seen, when that was seen once)
      let at = -1; for (let j = 0; j < n && at < 0; j++) { if (!w(buf + 16 + 16 * j + 12)) at = j; }
      if (at < 0) for (let j = 0; j < n && at < 0; j++) { if (w(buf + 16 + 16 * j + 12) === 1) at = j; }
      if (at < 0) continue;
      const q = buf + 16 + 16 * at; put(q, w(hd + N_A)); put(q + 4, w(hd + N_B)); put(q + 8, w(x + 4)); put(q + 12, 1);
    }
    // (with --debug, all of the way down, kept too: said with `RAY_DEEP`)
    if (DEBUG) { const all = xadd(HEAP, 4 + 12 * depth); if (all >= 0 && all < w(LIMIT) - 4 - 12 * depth) { put(all, depth); for (let d = 0; d < depth; d++) { const x = st + 8 * d, r = w(x), hd = r ? w(r + R_HEAD) : 0, q = all + 4 + 12 * d; put(q, hd ? w(hd + N_A) : 0); put(q + 4, hd ? w(hd + N_B) : 0); put(q + 8, w(x + 4)); } debug(D_FAULT, 1089, all, 0); } }
    put(t + T_DEEPC, buf);
  }
  function same_step(x: number, y: number): number {
    const r = w(x), q = w(y);
    if (!r || !q) return !r && !q && w(x + 4) === w(y + 4) ? 1 : 0;
    const h = w(r + R_HEAD), k = w(q + R_HEAD);
    return r === q || (h && k && w(h + N_A) === w(k + N_A)) ? 1 : 0;
  }
  // (going to a label, or stopped: what was run returns, until what has the label, or the statement)
  function stopped(t: number) { return w(t + T_JUMP_N) || w(t + T_FAULT) || w(OOM); }
  // (the text from s to e one of the words the host knows?)
  function mapped(s: number, e: number, k: number) { const n = w(w(MAPPED) + 8 * k + 4); return e - s === n && same(s, w(w(MAPPED) + 8 * k), n); }
  function word(s: number, e: number, k: number) { const n = w(w(WORDS) + 8 * k + 4); return e - s === n && same(s, w(w(WORDS) + 8 * k), n); }
  // (the text from a, n long, and from s to e, the same, each without the space around it?)
  function trimmed(a: number, n: number, s: number, e: number) {
    let z = a + n; while (a < z && b(a) <= 32) a++; while (z > a && b(z - 1) <= 32) z--;
    while (s < e && b(s) <= 32) s++; while (e > s && b(e - 1) <= 32) e--;
    return z - a === e - s && same(a, s, e - s);
  }

  // ---- reading

  // The n bytes at a and at c the same?
  // (a rule's text, each piece of it, in a text in the order written: whether it can read it at all)
  function fits(x: number, at: number, end: number): number {
    let p = at;
    for (let i = 0; i < w(x + R_PARTS); i++) { const q = x + R_PART + PART * i; if ((w(q) & 15) !== LITERAL) continue; const ls = w(q + 4), ln = w(q + 8); let f = -1; for (let c = p; c + ln <= end; c++) if (same(c, ls, ln)) { f = c; break; } if (f < 0) return 0; p = f + ln; }
    return 1;
  }
  function same(a: number, c: number, n: number) { for (let i = 0; i < n; i++) if (b(a + i) !== b(c + i)) return 0; return 1; }
  // At `at`: an opening bracket (1), a closing one (2), a quote (3), neither (0); 4 more for the header's; and 8 times how long
  // it is. The brackets are the header's, and the pairs rules taught (a head that is one hole between two characters).
  function bracket(at: number, end: number) {
    // (one byte each, the header's are in the table too: 5 and 6)
    // (one escaped, `\"`, `\{` (after an odd number of backslashes), as within quotes: opens and closes nothing; and the
    // escape's own that follows `\e`, a control sequence, `\e[2;3H`, `\e]0;`, written bare in a fragment)
    if (w(OPEN_LENGTH) === 1 && w(CLOSE_LENGTH) === 1) { const k = b(w(PAIRS) + b(at)); return !k || (b(at - 1) === 92 && escaped(at)) || (b(at - 1) === 101 && b(at - 2) === 92 && escaped(at - 1)) ? 0 : k + 8; }
    let l = w(OPEN_LENGTH);
    if (at + l <= end && same(at, w(OPEN), l)) return l * 8 + 5;
    l = w(CLOSE_LENGTH);
    if (at + l <= end && same(at, w(CLOSE), l)) return l * 8 + 6;
    const k = b(w(PAIRS) + b(at));
    return !k || (b(at - 1) === 92 && escaped(at)) || (b(at - 1) === 101 && b(at - 2) === 92 && escaped(at - 1)) ? 0 : k + 8;
  }
  function escaped(at: number): number { let n = 0; while (b(at - 1 - n) === 92) n++; return n & 1; }
  // Past what opens at `at`: to after what closes it (what opens inside it, past that too), or a quote's text.
  function past(at: number, end: number): number {
    // (where it closes, read once for each place of a file: as far as the file goes, then no further than `end`)
    const t = w(OPEN_LENGTH) === 1 && w(CLOSE_LENGTH) === 1 ? closes(at) : 0;
    if (!t) return closing(at, end);
    const v = w(t + 4 * at);
    if (v && ((v >> 24) & 127) === (w(PAIRS_GEN) & 127)) { const r = at + (v & 0xFFFFFF) - 1; return r < end ? r : end; }
    const r = closing(at, w(THREAD + T_CE));
    if (r - at < 0xFFFFFE) put(t + 4 * at, ((w(PAIRS_GEN) & 127) << 24) | (r - at + 1));
    return r < end ? r : end;
  }
  // (the file `at` is in: its table of where what opens at each place closes, less its start)
  function closes(at: number): number {
    if (at >= w(THREAD + T_CS) && at < w(THREAD + T_CE)) return w(THREAD + T_CT);
    const d = w(CLOSES);
    for (let k = 0; d && k < aload(FILES_N); k++) {
      const q = d + 12 * k;
      if (w(q) <= at && at < w(q + 4) && w(q + 8)) { put(THREAD + T_CS, w(q)); put(THREAD + T_CE, w(q + 4)); put(THREAD + T_CT, w(q + 8) - 4 * w(q)); return w(THREAD + T_CT); }
    }
    return 0;
  }
  function closing(at: number, end: number): number {
    const k = bracket(at, end);
    if ((k & 3) === 3) {
      const q = b(at);
      for (let p = at + 1; p < end;) { const c = b(p); if (c === 92) p += 2; else if (c === q) return p + 1; else p++; }
      return end;
    }
    for (let p = at + (k >> 3); p < end;) {
      const c = bracket(p, end);
      if ((c & 3) === 2) return p + (c >> 3);
      if (c & 3) p = past(p, end); else p++;
    }
    return end;
  }
  // Past the whitespace (and the newlines).
  // (whether code follows the comment at p, on a line after it (other comments not))
  function coded_after(p: number, end: number): number {
    for (;;) {
      while (p < end && b(p) !== 10) p++;
      while (p < end && b(p) <= 32) p++;
      if (p >= end) return 0;
      if (!(p + 1 < end && b(p) === 47 && b(p + 1) === 47)) return 1;
    }
  }
  // (and a comment on a line of its own: nothing (one that says `{x} => …` defines nothing), a list going on past it, its
  // next part; what it is painted as, `comments_read`)
  function skip(at: number, end: number) {
    for (;;) {
      while (at < end && b(at) <= 32) at++;
      if (at + 1 >= end || b(at) !== 47 || b(at + 1) !== 47) return at;
      let q = at; while (q < end && b(q) !== 10) q++;
      at = q;
    }
  }
  // The end of the line: its newline, not one inside brackets.
  // (a line indented deeper than the one the statement begins on continues it: `x := 5` then `  + 3`, a body on the lines
  // under `=>`; blank lines between them too)
  // (a statement's line: on to the next line no deeper than it; how deep it is, the line it begins on, in code made (not
  // written in a file, `{{body}}` of a closure) only as far back as that code begins, `lo`)
  function line(at: number, end: number, lo = 0) { return line_of(at, end, lo, at); }
  // (and as deep as the line `head` is on, before it: a rule's last hole begun on the lines under the rest, `=>` then a body)
  function line_of(at: number, end: number, lo: number, head: number) {
    let from = head; while (b(from - 1) !== 10 && b(from - 1) !== 0 && from > lo) from--;
    let indent = 0; while (b(from + indent) === 32) indent++;
    while (at < end) {
      const k = bracket(at, end);
      if ((k & 3) === 2) at += k >> 3;
      else if (k & 3) at = past(at, end);
      else if (b(at) === 10) {
        let next = at + 1;
        for (;;) { let q = next, n = 0; while (q < end && b(q) === 32) { q++; n++; } if (q < end && b(q) === 10) { next = q + 1; continue; } if (q >= end) return at; if (n <= indent && !comma_ended(from, at) && !(operator_led(q, end) && !commented(from, at))) return at; break; }
        at = next;
      }
      else at++;
    }
    return at;
  }
  // (a line beginning with `&` or `|` (`&&`, `||`), then a space: what it reads on is the line above, which it continues; and
  // the parts of a choice, `? a` and `: b`, written on lines of their own)
  function operator_led(q: number, end: number): number {
    const c = b(q);
    if (c === 58 || c === 63) return q + 1 < end && b(q + 1) === 32 ? 1 : 0;
    if (c !== 38 && c !== 124) return 0;
    const d = b(q + 1) === c ? q + 2 : q + 1;
    return d < end && b(d) === 32 ? 1 : 0;
  }
  // (and a line with a comment after it: not continued so, what the comment says is of that line alone)
  function commented(first: number, at: number): number {
    let from = at; while (from > first && b(from - 1) !== 10) from--;
    let q = from, quoted = 0;
    while (q < at) { const c = b(q); if (c === 34 || c === 96) quoted = quoted ? (quoted === c ? 0 : quoted) : c; else if (!quoted && c === 47 && b(q + 1) === 47 && q > from && b(q - 1) === 32) return 1; q++; }
    return 0;
  }
  // (a line ending in `,` (before a comment after it): a list going on, on the next line)
  function comma_ended(first: number, at: number): number {
    let from = at; while (from > first && b(from - 1) !== 10) from--;
    let e = at, q = from, quoted = 0;
    while (q < at) { const c = b(q); if (c === 34 || c === 96) quoted = quoted ? (quoted === c ? 0 : quoted) : c; else if (!quoted && c === 47 && b(q + 1) === 47 && q > from && b(q - 1) === 32) { e = q; break; } q++; }
    while (e > from && b(e - 1) <= 32) e--;
    return e > from && b(e - 1) === 44 ? 1 : 0;
  }
  // (whether p is in a file read, not in code made from one)
  function in_file(p: number): number { for (let k = 0; k < aload(FILES_N); k++) { const f = w(FILES) + 12 * k; if (p >= w(f) && p < w(f + 4)) return 1; } return 0; }
  // Do the characters at a and c belong apart (a literal begins or ends between them)? Each character has a kind: a space (0),
  // one of a word (1), one of an operator (2), or one on its own (3: a bracket, a quote, a comma).
  // (and a member after an operator, `x#.count`, `!.done`: a `.` before a word begins one, apart from what is before it
  // unless that is a `.` too (`..9`))
  // (a member named by an operator, `x.#`: a `.` on its own is apart from what follows it, as it is before a word)
  // (and `?` after `*`, `*?`: anything, or nothing (`forward: *?`, Stepped's), `*` then `x?`)
  function apart(a: number, c: number) { const t = w(CLASSES), x = b(t + b(a)), y = b(t + b(c)); return x !== y || x === 0 || x === 3 || (b(c) === 63 && b(a) === 42) || (b(c) === 46 && b(a) !== 46 && b(t + b(c + 1)) === 1) || (b(a) === 46 && b(c) !== 46 && b(a - 1) !== 46) ? 1 : 0; }
  // From `at` to `end`, what the type's own rules read whole?
  // (a rule whose typed hole is being checked is not tried again within the check: what the check reads is read without it
  // (`{f}({argument: Superposed})`, tried on every call, the calls in its argument not again), no re-entry)
  function typed(r: number, at: number, end: number, type: number, s: number): number {
    if (DEBUG && w(248)) { const h = w(248) + 8 * ((r >> 3) & 4095); put(h, r); put(h + 4, w(h + 4) + 1); }
    const n = w(THREAD + T_CHECKS); if (n < CHECKS) put(THREAD + T_CHECKS + 4 + 4 * n, r); set(THREAD + T_CHECKS, n + 1);
    const ok = typed_(at, end, type, s);
    set(THREAD + T_CHECKS, n); return ok;
  }
  function checking_rule(x: number): number { const n = w(THREAD + T_CHECKS); for (let i = 0; i < n && i < CHECKS; i++) if (w(THREAD + T_CHECKS + 4 + 4 * i) === x) return 1; return 0; }
  function typed_(at: number, end: number, type: number, s: number): number {
    // (a text: itself)
    if (w(type + N_IS) === IS_TEXT) return trimmed(w(type + N_A), w(type + N_B) - w(type + N_A), at, end) ? 1 : 0;
    // (what everything is, the language itself (`Node := .`): anything; reading it would try every rule there is)
    if (type === w(GLOBAL)) return 1;
    // (accelerated, `glyphs` in the kernel's map: a list of characters as a type (`Decimal_glyph[]`), each character one of
    // its element's, read whole by the kernel (an acceleration: the same with it and without))
    const gl = glyphs_of(type); if (gl) return glyph_read(gl, at, end);
    // (what none of its rules begins as, and no name of a value of it: none)
    if (!begins(type, b(at), 0) && !worded(at, end)) return 0;
    // (the same text checked against the same type while that is being checked (a type whose rules have holes of it, read at
    // the same place), or checks this deep: no reading)
    if (!w(THREAD + T_TYP)) put(THREAD + T_TYP, alloc(12 * TYPS));
    const ty = w(THREAD + T_TYP), tn = w(THREAD + T_TYP_N);
    if (tn >= TYPS) { set(THREAD + T_CUT, 1); return 0; }
    if (DEBUG && tn === 512) debug(D_FAULT, 98, at, end);
    // (the same text checked as the same type while it is being checked: not one, as far as that check goes (no re-entry:
    // `this` checked as `Subscript.String`, what that asks reads `this` again))
    for (let i = 0; i < tn; i++) if (w(ty + 12 * i) === at && w(ty + 12 * i + 4) === end && w(ty + 12 * i + 8) === type) { set(THREAD + T_CUT, 1); return 0; }
    // (checked once: the same text against the same type, its rules and the language's as they are, as quietly, under the same
    // shadows, is the same answer; not one a cycle cut short, nor one that ran something to answer: what it ran is the answer)
    let slot = 0;
    const memo = w(TMEMO), last = latest(type), glob = latest(w(GLOBAL)) ^ thread_level(), quiet = w(THREAD + T_QUIET) >= TYPINGS ? 1 : 0;
    // (in a test: its own, this thread's, as the readings it keeps are)
    const sh = w(THREAD + T_SH_N) ? w(THREAD + T_SH) : w(THREAD + T_REG_AT) ? THREAD | 1 : 0, gen = sh ? w(THREAD + T_SHGEN) : 0, shn = w(THREAD + T_SH_N);
    // (in each table, the newest first: a new one only in that)
    let tab = memo, first = 1;
    while (tab) {
      const mk = w(tab - 12);
      for (let h = mix(at * 31 + end * 17 + type * 13 + gen) & mk, n = 0; n < 16; n++, h = (h + 1) & mk) {
        const m = tab + TMEMO_ENTRY * h, k = aload(m);
        if (!k) { if (first) slot = m; break; }
        if (k === at && w(m + 4) === end && w(m + 8) === type && w(m + 12) === last && w(m + 20) === glob && w(m + 24) === quiet && w(m + 28) === sh && w(m + 32) === gen && w(m + 36) === shn) { const kept = aload(m + 16); if (kept) { if (DEBUG) count(15); return kept - 1; } break; }
      }
      tab = w(tab - 8); first = 0;
    }
    put(ty + 12 * tn, at); put(ty + 12 * tn + 4, end); put(ty + 12 * tn + 8, type); set(THREAD + T_TYP_N, tn + 1);
    const cut = w(THREAD + T_CUT), ran = w(THREAD + T_RAN); set(THREAD + T_CUT, 0); set(THREAD + T_RAN, 0);
    if (DEBUG) { debug(D_TYPE, at, end, type); count(K_TYPED); if (w(244)) { const h = w(244) + 8 * ((type >> 3) & 4095); put(h, type); put(h + 4, w(h + 4) + 1); } }
    // (`RAY_TRACE`: a check told, the text and the type, then what it answered)
    const tc = w(THREAD + T_TRACE_ON) && w(THREAD + T_TRACE_D) < w(THREAD + T_TRACE_DEPTH) && w(THREAD + T_TRACE_N) < w(THREAD + T_TRACE_MAX) ? w(THREAD + T_TRACE_D) + 1 : 0;
    if (tc) { set(THREAD + T_TRACE_N, w(THREAD + T_TRACE_N) + 1); set(THREAD + 932, type); told(at, L_TRACE_CHECK, at, end); set(THREAD + T_TRACE_D, tc); }
    const ok = checked(at, end, type, s);
    if (tc) { set(THREAD + T_TRACE_D, tc - 1); told(ok, L_TRACE_CHECKED, at, end); }
    if (DEBUG) debug(D_TYPE_END, at, end, ok);
    const was_cut = w(THREAD + T_CUT), was_run = w(THREAD + T_RAN); set(THREAD + T_CUT, cut | was_cut); set(THREAD + T_RAN, ran | was_run);
    set(THREAD + T_TYP_N, tn);
    if (DEBUG) { if (was_run) count(11); else if (was_cut) count(12); else count(13); if (ok) count(14); }
    if (slot && !w(THREAD + T_REG_AT) && !was_cut && (!was_run || kept_type(type)) && acas(slot, 0, at) === 0) { memo_added(TMEMO, TMEMO_ENTRY, (1 << 23) - 1); wrote(slot); put(slot + 4, end); put(slot + 8, type); put(slot + 12, last); put(slot + 20, glob); put(slot + 24, quiet); put(slot + 28, sh); put(slot + 32, gen); put(slot + 36, shn); aput(slot + 16, ok + 1); }
    return ok;
  }
  // (the type `{element}[]` made, marked: the characters its element is one of, each a text of one byte, `"0" | "1"`; one it
  // is not (a character of more bytes, a value of another kind), not marked: read by its rules)
  function glyphed(t: number, made: number, applied: number) {
    if (w(THREAD + T_REG_AT) || w(made + N_IS) !== IS_NODE || (w(FAIL_FAST) & 256)) return;
    const element = valued(t, applied + F_TAKES); if (!element) return;
    const mask = allocb(32); for (let i = 0; i < 8; i++) put(mask + 4 * i, 0);
    if (!glyph_set(t, element, mask, 0)) return;
    for (let h = (made >> 2) & (GLYPHED_N - 1), n = 0; n < 16; n++, h = (h + 1) & (GLYPHED_N - 1)) {
      const m = w(GLYPHED) + 16 * h;
      if (acas(m, 0, made) === 0 || aload(m) === made) { put(m + 4, latest(made)); put(m + 8, mask); return; }
    }
  }
  // (what a value of the element is: a text of one byte, that byte; a superposition, each of its rules a hole of a type alone
  // whose body is that hole (`{value: a} => value`), what each type is; anything else, no set)
  function glyph_set(t: number, x: number, mask: number, depth: number): number {
    if (depth > BEGUN) return 0;
    // (one character of more than one byte, `₂`: each of its bytes, a run of them its characters)
    if (w(x + N_IS) === IS_TEXT) { const a = w(x + N_A), z = w(x + N_B); if (z - a < 1 || b(a) <= 32 || (z - a > 1 && (b(a) < 192 || z - a !== (b(a) >= 240 ? 4 : b(a) >= 224 ? 3 : 2)))) return 0; for (let p = a; p < z; p++) put(mask + 4 * (b(p) >> 5), w(mask + 4 * (b(p) >> 5)) | (1 << (b(p) & 31))); return 1; }
    // (a character, or a number counted as one: its code point, one byte)
    { const gc = code_of(t, x); if (gc > 32 && gc < 256) { put(mask + 4 * (gc >> 5), w(mask + 4 * (gc >> 5)) | (1 << (gc & 31))); return 1; } }
    // (a list of characters, `"0".."9"`: each of them)
    if (w(x + N_IS) === IS_NODE && listed(t, x)) { let gn = 0, gl = held(t, x, W_HEAD, 0); while (gl && gl !== w(NOTHING) && gn < 256) { if (!glyph_set(t, held(t, gl, W_VALUE, 0), mask, depth + 1)) return 0; gn++; gl = held(t, gl, W_NEXT, 0); } return gn; }
    if (w(x + N_IS) !== IS_NODE) return 0;
    let n = 0;
    for (let o = latest(x), k = 0; o && o !== w(x + N_BASE) && k < 4096; o = w(o), k++) {
      if (w(o + R_KIND) !== RULE || (w(o + R_FLAGS) & DEAD)) continue;
      if (!(w(o + R_FLAGS) & HOLES)) continue;
      if (w(o + R_PARTS) !== 1 || (w(o + R_PART) & 15) !== HOLE || named(o, w(o + R_BS), w(o + R_BE)) !== 0) return 0;
      const ty = w(o + R_PART + 16); if (ty <= 1 || !glyph_set(t, ty, mask, depth + 1)) return 0;
      n++;
    }
    return n;
  }
  // (a type marked `external kept`: its checks kept as they are answered)
  function kept_type(type: number): number {
    for (let i = 0; i < w(KEPT_N); i++) if (w(KEPT + 4 * i) === type) return 1;
    return 0;
  }
  function glyphs_of(type: number): number {
    if (!w(GLYPHED) || w(type + N_IS) !== IS_NODE) return 0;
    for (let h = (type >> 2) & (GLYPHED_N - 1), n = 0; n < 16; n++, h = (h + 1) & (GLYPHED_N - 1)) {
      const m = w(GLYPHED) + 16 * h, k = aload(m);
      if (!k) return 0;
      if (k === type) return w(m + 4) === latest(type) ? w(m + 8) : 0;
    }
    return 0;
  }
  // What the kernel can tell of a value and a type, as `is` answers it (the language's `is_itself`): 1 it is, 0 it is not, -1
  // not known (the language's rules then). A text against a written text, String, Node, `T+`, `T[]`, a list of types read in
  // order, a superposition of them; itself; Node.
  function admits(t: number, v: number, ty: number, depth: number): number {
    if (!v || !ty || depth > 12 || stopped(t)) return -1;
    if (v === ty || ty === known_class(t, 26, W_NODE_NAME)) return 1;
    if (w(v + N_IS) !== IS_TEXT) return -1;
    // (a class written as a structure: by what it is written as, kept when it was defined (`structure_as`))
    const sa = w(ty + N_IS) === IS_NODE && held(t, ty, W_OF, 0) === ty ? member_seen(t, ty, w(w(WORDS) + 8 * W_STRUCTURE_AS), w(w(WORDS) + 8 * W_STRUCTURE_AS + 4), ty, 0) : 0;
    return text_admits(t, w(v + N_A), w(v + N_B), sa && sa !== w(NOTHING) ? sa : ty, depth);
  }
  // (a class the language names, found once: Node, String; kept in the map's slots 26, 27: past what it names and the span
  // (M_SPAN, M_SPAN + 1), before the arguments (ARGV_SLOT, 28; language.ts writes them there))
  function known_class(t: number, slot: number, k: number): number {
    // (kept with the language's last rule when it was found: the entrypoint, read again while booting, makes it again)
    const g = w(GLOBAL); if (!g) return 0;
    const at = w(MAPPED) + 8 * slot; if (w(at) && w(at + 4) === latest(g)) return w(at);
    const found = member(t, g, w(w(WORDS) + 8 * k), w(w(WORDS) + 8 * k + 4)); if (found) { put(at, found); put(at + 4, latest(g)); }
    return found;
  }
  // (what a node holds under a name, its own or what it is made of: none, 0)
  function held(t: number, nd: number, k: number, depth: number): number {
    if (!nd || depth > 3 || w(nd + N_IS) !== IS_NODE) return 0;
    const v = member(t, nd, w(w(WORDS) + 8 * k), w(w(WORDS) + 8 * k + 4));
    return v ? v : held(t, w(nd + N_ALSO), k, depth + 1);
  }
  // (a list: one, not a superposition made of lists (what it is made of answers `listing` too; it is one of them, not all))
  function listed(t: number, x: number): number { return held(t, x, W_LISTING, 0) === w(TRUE_) && member(t, x, w(w(WORDS) + 8 * W_SUPERPOSES), w(w(WORDS) + 8 * W_SUPERPOSES + 4)) !== w(TRUE_) ? 1 : 0; }
  function text_admits(t: number, s: number, e: number, ty: number, depth: number): number {
    if (depth > 12 || stopped(t)) return -1;
    // (a text a header's position read, written as a type (`rule: GRAMMAR_RULE.LHS`): what it was read by, `read_as`) TODO(explicit)
    // (or one made of such a text, `(span) &+ { }`, its parts its members)
    if (w(ty + N_IS) === IS_TEXT || (w(ty + N_IS) === IS_NODE && w(ty + N_ALSO) && w(w(ty + N_ALSO) + N_IS) === IS_TEXT)) { const ra = member(t, ty, w(w(WORDS) + 8 * W_READ_AS), w(w(WORDS) + 8 * W_READ_AS + 4)); if (ra && ra !== w(NOTHING) && ra !== ty) return text_admits(t, s, e, ra, depth + 1); }
    // (a place a list holds, `name: T` in it: by what was given that name (its type, written in what holds members, where a
    // bare name never reads it); given nothing, `x?: T`'s default: by its type)
    if (w(ty + N_IS) === IS_PLACE) { let pv = place_value(t, ty); if (pv === w(NOTHING)) { const pt = member(t, ty, w(w(WORDS) + 8 * W_TYPE), w(w(WORDS) + 8 * W_TYPE + 4)); pv = pt && pt !== ty && w(pt + N_IS) !== IS_PLACE ? pt : pv; } if (pv && w(pv + N_IS) === IS_LAZY && w(pv + N_A)) pv = valued(t, w(pv + N_A)); return pv ? text_admits(t, s, e, pv, depth + 1) : -1; }
    // (a character the kernel holds: that one character)
    if (w(ty + N_IS) === IS_NODE && w(CHARS) && w(ty + N_PARENT) === w(CHARS) && w(ty + N_A) > 0 && !w(ty + N_B)) return span_char(s, e) === w(ty + N_A) - 1 ? 1 : 0;
    if (w(ty + N_IS) === IS_TEXT) { const n = w(ty + N_B) - w(ty + N_A); return e - s === n && same(s, w(ty + N_A), n) ? 1 : 0; }
    if (w(ty + N_IS) !== IS_NODE) return -1;
    if (ty === known_class(t, 27, W_STRING_NAME) || ty === known_class(t, 26, W_NODE_NAME)) return 1;
    // (a superposition, made of what it superposes (their members its own too): one of its components, before what they are)
    const sup = member(t, ty, w(w(WORDS) + 8 * W_SUPERPOSES), w(w(WORDS) + 8 * W_SUPERPOSES + 4)) === w(TRUE_);
    // (`T+`: not empty, a T)
    const base = sup ? 0 : held(t, ty, W_NONEMPTY, 0); if (base) return e === s ? 0 : text_admits(t, s, e, base, depth + 1);
    // (`T[]` of characters: each one of them, or none (`T[]+`, at least one))
    const gl = sup ? 0 : glyphs_of(ty); if (gl) { if (e === s) return 1; for (let p = s; p < e; p++) { const c = b(p); if (!((w(gl + 4 * (c >> 5)) >>> (c & 31)) & 1)) return 0; } return 1; }
    // (`T[]`: Ts one after another, or none)
    // (what `T[]` made keeps its T in the block it was made of, marked `repeats`: its parent)
    const made_in = w(ty + N_PARENT), each = sup ? 0 : held(t, ty, W_EACH, 0) || (made_in && held(t, made_in, W_REPEATS, 0) === w(TRUE_) ? held(t, made_in, W_EACH, 0) : 0); if (each && each !== w(NOTHING)) return e === s ? 1 : text_steps(t, s, e, each, 0, depth);
    // (a range, `"0".."9"`: one of its values, which the language walks (its values made as they are asked))
    // (a range of characters, `"\t".."\r"`: one of them; of other values, which the language walks (its values made as they
    // are asked), not known) TODO(explicit)
    if (!sup && held(t, ty, W_IS_RANGE, 0) === w(TRUE_)) {
      if (!listed(t, ty) && held(t, ty, W_LISTING, 0) !== w(TRUE_)) return -1;
      let found = 0;
      for (let at = held(t, ty, W_HEAD, 0), k = 0; at && at !== w(NOTHING) && k < 1024; at = held(t, at, W_NEXT, 0), k++) { const cv = held(t, at, W_VALUE, 0); if (!cv || w(cv + N_IS) !== IS_TEXT) return -1; const m = w(cv + N_B) - w(cv + N_A); if (!found && m === e - s && same(s, w(cv + N_A), m)) found = 1; }
      return found;
    }
    // (a list of types: each in its turn, a written text where it is, any other a span of at least one character)
    if (!sup && listed(t, ty)) return text_steps(t, s, e, 0, held(t, ty, W_HEAD, 0), depth);
    // (one of a superposition's components)
    // (a superposition `a | b` keeps its components in the block it was made of, marked `superposes`: its parent)
    const cs0 = held(t, ty, W_COMPONENTS, 0) || (made_in && held(t, made_in, W_SUPERPOSES, 0) === w(TRUE_) ? held(t, made_in, W_COMPONENTS, 0) : 0), cs = cs0 === w(NOTHING) ? 0 : cs0;
    if (cs) { let unknown = 0; for (let at = held(t, cs, W_HEAD, 0), k = 0; at && at !== w(NOTHING) && k < 256; at = held(t, at, W_NEXT, 0), k++) { const cv = held(t, at, W_VALUE, 0); if (cv === w(NOTHING) && e === s) return 1; if (!cv || cv === w(NOTHING)) continue; const ch = chars_hold(t, cv, s, e); const r = ch >= 0 ? ch : text_admits(t, s, e, cv, depth + 1); if (r === 1) return 1; if (r < 0) unknown = 1; } return unknown ? -1 : 0; }
    return -1;
  }
  // (a span read as one type again and again (each), or as a list of types in turn (from its first link): which ends it can
  // reach, each a position after the one before)
  function text_steps(t: number, s: number, e: number, each: number, link: number, depth: number): number {
    const n = e - s; if (n > 4096) return -1;
    let reach = allocb(n + 1); for (let i = 0; i <= n; i++) setb(reach + i, i === 0 ? 1 : 0);
    let unknown = 0;
    for (let step = 0; step < 4096; step++) {
      const ty = each ? each : (link && link !== w(NOTHING) ? held(t, link, W_VALUE, 0) : 0);
      if (!each && !(link && link !== w(NOTHING))) break;
      if (!ty) return -1;
      // (a position given nothing, `x?: T` in a list (its default what the list holds): it takes nothing)
      if (!each && ty === w(NOTHING)) { link = held(t, link, W_NEXT, 0); continue; }
      const next = allocb(n + 1); for (let i = 0; i <= n; i++) setb(next + i, 0);
      let any = 0;
      for (let i = 0; i <= n; i++) {
        if (!b(reach + i)) continue;
        if (!each && w(ty + N_IS) === IS_TEXT) { const m = w(ty + N_B) - w(ty + N_A); if (i + m <= n && same(s + i, w(ty + N_A), m)) { setb(next + i + m, 1); any = 1; } continue; }
        // (a position in a list that may take nothing, `\s[]`, `x?: T`: none of the text too)
        for (let j = each ? i + 1 : i; j <= n; j++) { const r = text_admits(t, s + i, s + j, ty, depth + 1); if (r === 1) { setb(next + j, 1); any = 1; } else if (r < 0) unknown = 1; }
      }
      if (each) { if (b(next + n)) return 1; if (!any) return unknown ? -1 : 0; let grew = 0; for (let i = 0; i <= n; i++) if (b(next + i) && !b(reach + i)) { setb(reach + i, 1); grew = 1; } if (!grew) return unknown ? -1 : 0; continue; }
      reach = next; link = held(t, link, W_NEXT, 0);
      if (!any) return unknown ? -1 : 0;
    }
    return b(reach + n) ? 1 : (unknown ? -1 : 0);
  }
  // (the name a hole of the frame's rule (the text from s to e) is written as: `a`, `a: T`, `a = v`; else 0)
  // (`{x: f}`, braced: f, a text read where it was written (its node's parent that frame); else 0)
  function hole_mapping(fr: number, s: number, e: number): number {
    if (!fr || w(fr + N_IS) !== IS_FRAME || !w(fr + F_RULE) || e <= s) return 0;
    const h = named(w(fr + F_RULE), s, e); if (h < 0) return 0;
    const o = follow(fr + F_TAKES + TAKE * h, 1); let cs = skip(w(o), w(o + 4)), ce = w(o + 4); while (ce > cs && b(ce - 1) <= 32) ce--;
    if (ce - cs <= 2 || b(cs) !== 123) return 0;
    const be = past(cs, ce), p0 = skip(cs + 1, be - 1); let wb = p0; while (wb < be - 1 && b(w(CLASSES) + b(wb)) === 1) wb++; let c = wb; while (c < be - 1 && b(c) <= 32) c++;
    if (wb === p0 || b(c) !== 58 || b(c + 1) === 58 || b(c + 1) === 61) return 0;
    const fs = skip(c + 1, be - 1); let fe = be - 1; while (fe > fs && b(fe - 1) <= 32) fe--;
    return fe > fs ? node(IS_TEXT, fs, fe, w(o + T_ORIGIN) || fr, 0) : 0;
  }
  function hole_name(fr: number, s: number, e: number): number {
    if (!fr || w(fr + N_IS) !== IS_FRAME || !w(fr + F_RULE) || e <= s) return 0;
    const h = named(w(fr + F_RULE), s, e); if (h < 0) return 0;
    const o = follow(fr + F_TAKES + TAKE * h, 1); let cs = skip(w(o), w(o + 4)), ce = w(o + 4); while (ce > cs && b(ce - 1) <= 32) ce--;
    // (`{x: f}`, braced: x)
    if (ce - cs > 2 && b(cs) === 123) { const be = past(cs, ce), p0 = skip(cs + 1, be - 1); let wb = p0; while (wb < be - 1 && b(w(CLASSES) + b(wb)) === 1) wb++; let c = wb; while (c < be - 1 && b(c) <= 32) c++; if (wb > p0 && b(c) === 58 && b(c + 1) !== 58 && b(c + 1) !== 61) return node(IS_TEXT, p0, wb, w(TEXTS) || w(GLOBAL), 0); }
    let we = cs; while (we < ce && b(w(CLASSES) + b(we)) === 1) we++;
    if (we === cs || (b(cs) >= 48 && b(cs) <= 57)) return 0;
    let after = we; while (after < ce && b(after) <= 32) after++;
    const fits = after === ce || (b(after) === 58 && b(after + 1) !== 58 && b(after + 1) !== 61) || (b(after) === 61 && b(after + 1) !== 61 && b(after + 1) !== 62);
    if (!fits) return 0;
    // (a list written, `a: T, b`, is no name: a `,` outside brackets and quotes)
    for (let hp = after, hd = 0, hq = 0; hp < ce; hp++) { const hc = b(hp); if (hq) { if (hc === hq) hq = 0; continue; } if (hc === 34 || hc === 96) hq = hc; else if (hc === 40 || hc === 91 || hc === 123) hd++; else if (hc === 41 || hc === 93 || hc === 125) hd--; else if (hc === 44 && hd === 0) return 0; }
    return node(IS_TEXT, cs, we, w(TEXTS) || w(GLOBAL), 0);
  }
  // (the type a hole's code is written with, `a: T`: T's text; else 0)
  function hole_type(fr: number, s: number, e: number): number {
    const hn = hole_name(fr, s, e); if (!hn) return 0;
    const o = follow(fr + F_TAKES + TAKE * named(w(fr + F_RULE), s, e), 1); let ce = w(o + 4); while (ce > w(hn + N_B) && b(ce - 1) <= 32) ce--;
    let after = w(hn + N_B); while (after < ce && b(after) <= 32) after++;
    if (after >= ce || b(after) !== 58) return 0;
    const ts = skip(after + 1, ce); return ts < ce ? node(IS_TEXT, ts, ce, w(TEXTS) || w(GLOBAL), 0) : 0;
  }
  // (a span as a place reads it, the language's `type_fits` (`is`, or `as`): of a structure class, what it is written as
  // (its `written_as`, which `as` asks before it destructures))
  function span_fits(t: number, s: number, e: number, ty: number): number {
    const r = text_admits(t, s, e, ty, 0); if (r === 1 || w(ty + N_IS) !== IS_NODE) return r;
    // (marked once, when the class is defined: `structure_as`, what it is written as)
    const wa = held(t, ty, W_STRUCTURE_AS, 0); if (!wa || wa === w(NOTHING)) return r;
    return text_admits(t, s, e, wa, 0);
  }
  // (a class written as a structure, `class (a: T, `-`, b: U)`: what it is written as, as its rules answer (`written_as` of the
  // class whose header is written so, `header_quoted`), read once for the cut it is in; any other, 0)
  function shape_of(t: number, ty: number): number {
    if (!ty || w(ty + N_IS) !== IS_NODE) return 0;
    const hq = held(t, ty, W_HEADER_QUOTED, 0); if (!hq || hq === w(NOTHING) || w(hq + N_IS) !== IS_NODE) return 0;
    const wa = member_seen(t, hq, w(w(WORDS) + 8 * W_WRITTEN_AS), w(w(WORDS) + 8 * W_WRITTEN_AS + 4), hq, 0);
    return wa && wa !== w(NOTHING) && w(wa + N_IS) === IS_NODE && listed(t, wa) ? wa : 0;
  }
  // (of a list of types from a link and a text, `{at} first_cut_in {text}`: what is left after the first type's span, the nearest
  // after which the rest reads, as the language's loop finds it; none, nothing; not known, 0)
  function cut_of(t: number, link: number, x: number): number {
    if (!link || link === w(NOTHING) || !x || w(x + N_IS) !== IS_TEXT) return 0;
    const s = w(x + N_A), e = w(x + N_B), n = e - s; if (n > 2048) return 0;
    const types = alloc(4 * 65); let k = 0;
    for (let at = link; at && at !== w(NOTHING) && k < 64; at = held(t, at, W_NEXT, 0)) { const ty = held(t, at, W_VALUE, 0); if (!ty) return 0; put(types + 4 * k++, shape_of(t, ty) || ty); if (stopped(t)) return 0; }
    if (k >= 64 || stopped(t)) return 0;
    // (reads[i][p], from the last type back: 1 the types from i read the text from p, 0 they do not, 2 not known)
    const reads = allocb((k + 1) * (n + 1));
    for (let p = 0; p <= n; p++) setb(reads + k * (n + 1) + p, p === n ? 1 : 0);
    for (let i = k - 1; i >= 0; i--) {
      const ty = w(types + 4 * i), row = reads + i * (n + 1), next = reads + (i + 1) * (n + 1);
      for (let p = 0; p <= n; p++) {
        let r = 0;
        if (w(ty + N_IS) === IS_TEXT) { const m = w(ty + N_B) - w(ty + N_A); r = p + m <= n && same(s + p, w(ty + N_A), m) ? b(next + p + m) : 0; }
        else for (let q = p + 1; q <= n && r !== 1; q++) { const rest = b(next + q); if (!rest) continue; const f = span_fits(t, s + p, s + q, ty); if (f < 0) r = 2; else if (f === 1) { if (rest === 1) r = 1; else r = 2; } }
        setb(row + p, r);
      }
    }
    // (the first type, as the loop tries it: the shortest span after which the rest reads; one not known before it, not known)
    const first = w(types), rest = reads + n + 1;
    if (w(first + N_IS) === IS_TEXT) { const m = w(first + N_B) - w(first + N_A); if (m < 1 || m > n || !same(s, w(first + N_A), m)) return w(NOTHING); const r = b(rest + m); return r === 1 ? node(IS_TEXT, s + m, e, w(TEXTS) || w(GLOBAL), 0) : r === 2 ? 0 : w(NOTHING); }
    // (a repeat, `T[]`, `T[]+`: the longest span after which the rest reads, as many Ts as there are)
    const greedy = repeat_type(t, first, 0);
    for (let q0 = 1; q0 <= n; q0++) { const q = greedy ? n + 1 - q0 : q0; const r = b(rest + q); if (!r) continue; const f = span_fits(t, s, s + q, first); if (f < 0 || (f === 1 && r === 2)) return 0; if (f === 1) return node(IS_TEXT, s + q, e, w(TEXTS) || w(GLOBAL), 0); }
    return w(NOTHING);
  }
  // (what the type's rules read: one of the characters, then, after any space, one again, to the end, spaces after it)
  function glyph_read(mask: number, at: number, end: number): number {
    while (end > at && b(end - 1) <= 32) end--;
    if (at >= end) return 0;
    for (let p = at; p < end; p++) { const c = b(p); if (c <= 32) { if (p === at) return 0; continue; } if (!((w(mask + 4 * (c >> 5)) >>> (c & 31)) & 1)) return 0; }
    return 1;
  }
  // What a value of a type can begin with: the characters its own rules with holes begin with, a hole there what its type
  // does (an untyped one, anything). Derived from its rules, kept with the last of them (one more, derived again).
  function begins(type: number, c: number, depth: number): number {
    if (w(type + N_IS) === IS_TEXT) { const a = skip(w(type + N_A), w(type + N_B)); return a >= w(type + N_B) || b(a) === c ? 1 : 0; }
    if (type === w(GLOBAL) || depth > BEGUN || !w(BEGINS)) return 1;
    const mask = begun(type, depth);
    return (w(mask + 4 * (c >> 5)) >>> (c & 31)) & 1;
  }
  // (all it can begin with, at once: a mask of 256 bits, one per character; a hole's type's mask added to it whole)
  // (the rules what is being read now reads without: each one whose other reading this is)
  // (a rule whose body is one of its holes: what it reads, passed through)
  // (a rule that is its first word and then a hole, `as {target}`, `static {statement}`: what follows that word, read as
  // its operand; not one written with more of its own text after it, `as (=== {type})`)
  function operand_led(x: number): number { const n = w(x + R_PARTS); let k = 1; while (k < n && (w(x + R_PART + PART * k) & 15) === SPACE) k++; return k < n && (w(x + R_PART + PART * k) & 15) === HOLE ? 1 : 0; }
  function passes(x: number): number {
    if (w(x + R_KIND) !== RULE) return 0;
    // (by its text, not read here: its body, written, one of its holes' names, bare or in brackets)
    let bs = skip(w(x + R_BS), w(x + R_BE)), be = trim_end(w(x + R_BS), w(x + R_BE));
    if (be - bs > 2 && same(bs, w(OPEN), w(OPEN_LENGTH)) && same(be - w(CLOSE_LENGTH), w(CLOSE), w(CLOSE_LENGTH))) { bs += w(OPEN_LENGTH); be -= w(CLOSE_LENGTH); }
    for (let k = 0, n = w(x + R_PARTS); k < n; k++) {
      const q = x + R_PART + PART * k; if ((w(q) & 15) !== HOLE) continue;
      const a = w(q + 4); let z = a; while (z < a + w(q + 8) && b(w(CLASSES) + b(z)) === 1) z++;
      if (z > a && be - bs === z - a && same(bs, a, z - a)) return 1;
    }
    return 0;
  }
  // (and the level read with in this thread, `external level_in L`: what is read under it is kept apart)
  function skips_key(): number { const n = w(THREAD + T_SKIPS_N), bs = w(THREAD + T_SKIPS), tl = thread_level(); let k = 0; for (let i = 0; i < n && i < 32; i++) k = mix(k * 31 + w(bs + 4 * i)) | 0; if (tl) k = mix(k * 31 + tl) | 0; return n || tl ? k | 1 : 0; }
  // (the level this thread reads with, the last given it; none, 0)
  function thread_level(): number { const n = w(THREAD + T_LEVELS_N); return n > 0 && n <= LEVELS ? w(THREAD + T_LEVELS + 4 * (n - 1)) : 0; }
  // (`external level_in L`: L read with from here on in this thread, its rules first; `external level_out`: the one before; what
  // was read under another kept apart (readings by the level, bodies this thread's own while it is))
  function levels(t: number, a: number, m: number, rest: number, z: number, names: number, f: number, self: number): number {
    const n = w(THREAD + T_LEVELS_N);
    if (word(a, m, W_LEVEL_OUT)) { if (n > 0) { set(THREAD + T_LEVELS_N, n - 1); thread_bodies_cleared(t); } return w(TRUE_); }
    const lv = rest < z ? block(t, rest, z, names, f, self, 0, 1, 0, self, 0) : 0;
    if (!lv || stopped(t) || w(lv + N_IS) !== IS_NODE || n >= LEVELS) return w(FALSE_);
    set(THREAD + T_LEVELS + 4 * n, node(IS_NODE, 0, 0, 0, lv)); set(THREAD + T_LEVELS_N, n + 1); thread_bodies_cleared(t);
    return w(TRUE_);
  }
  // (`external level_reads L v`: v read by L's own rules, its readers among them (`{text: String} => …`), v spliced in as a
  // text of its own; what reads it, applied; none, nothing)
  function level_reads(t: number, rest: number, z: number, names: number, f: number, self: number): number {
    let q = rest; while (q < z && b(q) > 32) q++;
    const lv = block(t, rest, q, names, f, self, 0, 1, 0, self, 0); if (stopped(t)) return 0;
    const val = q < z ? block(t, skip(q, z), z, names, f, self, 0, 1, 0, self, 0) : 0; if (stopped(t)) return 0;
    if (!lv || !val || w(lv + N_IS) !== IS_NODE || !latest(lv)) return w(NOTHING);
    const text = allocb(2); setb(text, 113); setb(text + 1, 118);
    const hold = node(IS_NODE, 0, 0, w(GLOBAL), 0); bound(text, text + 2, hold, val);
    const fr = frame(0, 0, hold, text, text + 2, 0, 0, hold, hold), was = w(t + T_SPLICE), was_v = w(t + T_SPLICE_V);
    put(t + T_SPLICE, text); put(t + T_SPLICE_V, val);
    const r = reading(t, text, text + 2, 0, 0, latest(lv), hold, 0, w(lv + N_BASE), 0, 0);
    const read_ = w(r) === K_UNREAD || w(r) === K_EMPTY || stopped(t) ? 0 : ev(t, r, fr, fr, hold, 1, hold, hold);
    put(t + T_SPLICE, was); put(t + T_SPLICE_V, was_v);
    return read_ && !stopped(t) ? read_ : w(NOTHING);
  }
  // (what a value's method of one argument answers, `a word b`, asked of the language: a and b spliced in as texts of their own)
  function asked_of(t: number, a: number, k: number, x: number): number {
    const kw = w(w(WORDS) + 8 * k), kn = w(w(WORDS) + 8 * k + 4);
    const text = allocb(kn + 10); let at = text;
    setb(at++, 40); const as_ = at; setb(at++, 113); setb(at++, 97); const ae = at; setb(at++, 41); setb(at++, 32);
    for (let i = 0; i < kn; i++) setb(at++, b(kw + i));
    setb(at++, 32); setb(at++, 40); const xs = at; setb(at++, 113); setb(at++, 120); const xe = at; setb(at++, 41);
    const hold = node(IS_NODE, 0, 0, w(GLOBAL), 0); bound(as_, ae, hold, a); bound(xs, xe, hold, x);
    const fr = frame(0, 0, hold, text, at, 0, 0, hold, hold);
    const r = reading(t, text, at, 0, 0, latest(hold), hold, 0, 0, 0, 0);
    if (w(r) === K_UNREAD || w(r) === K_EMPTY || stopped(t)) return 0;
    return ev(t, r, fr, fr, hold, 1, hold, hold);
  }
  function thread_bodies_cleared(t: number) {
    // (made where nothing lets go of it: past where any statement's memory is)
    if (!w(t + T_BODIES)) { const a = xadd(HEAP, 8 * BODIES); if (a <= 0 || a + 8 * BODIES >= w(LIMIT)) return; set(t + T_BODIES, a); }
    for (let i = 0; i < BODIES; i++) put(w(t + T_BODIES) + 8 * i, 0);
    set(t + T_BODIES_N, 0);
  }
  function skipped_rule(x: number): number { const n = w(THREAD + T_SKIPS_N), bs = w(THREAD + T_SKIPS); for (let i = 0; i < n && i < 32; i++) if (w(bs + 4 * i) === x) return 1; return 0; }
  function begun_now(x: number): number { const n = w(THREAD + T_BEGUN_N), bs = w(THREAD + T_BEGUN); for (let i = 0; i < n && i < 64 && bs; i++) if (w(bs + 4 * i) === x) return 1; return 0; }
  function begun(type: number, depth: number): number {
    const last = latest(type);
    let slot = 0, h = (type >> 2) & (BEGINS_N - 1);
    for (let n = 0; n < 8; n++, h = (h + 1) & (BEGINS_N - 1)) {
      const m = w(BEGINS) + 44 * h, k = aload(m);
      if (k === type && w(m + 4) === last) return m + 8;
      if (!k || k === type) { slot = m; break; }
    }
    // (derived: into a mask of 256 bits)
    const mask = allocb(32);
    for (let i = 0; i < 8; i++) put(mask + 4 * i, 0);
    for (let o = last, n = 0; o && o !== w(type + N_BASE) && n < 4096; o = w(o), n++) {
      const f = w(o + R_FLAGS);
      if (!(f & HOLES) || (f & (METHOD | DEAD)) || w(o + R_KIND) !== RULE) continue;
      const q = o + R_PART, kind = w(q) & 15;
      if (kind === LITERAL) { const x = b(w(q + 4)); put(mask + 4 * (x >> 5), w(mask + 4 * (x >> 5)) | (1 << (x & 31))); continue; }
      const ty = kind === HOLE ? w(q + 16) : 0;
      // (one whose type is not read yet reads nothing yet; one of this type begins as the others do; a word, with a character
      // of a word; one of no type, anything)
      if (ty === 1 || (ty === type && kind === HOLE)) continue;
      if (!ty && kind === HOLE && (w(q) & WORD)) { for (let x = 0; x < 256; x++) if (b(w(CLASSES) + x) === 1) put(mask + 4 * (x >> 5), w(mask + 4 * (x >> 5)) | (1 << (x & 31))); continue; }
      if (!ty) { for (let i = 0; i < 8; i++) put(mask + 4 * i, -1); break; }
      if (w(ty + N_IS) === IS_TEXT) { const a = skip(w(ty + N_A), w(ty + N_B)); if (a >= w(ty + N_B)) { for (let i = 0; i < 8; i++) put(mask + 4 * i, -1); break; } const x = b(a); put(mask + 4 * (x >> 5), w(mask + 4 * (x >> 5)) | (1 << (x & 31))); continue; }
      // (as deep as a superposition of many is written, `"0" | "1" | … | "9"`, each one deeper)
      if (ty === w(GLOBAL) || depth >= BEGUN || begun_now(ty)) { for (let i = 0; i < 8; i++) put(mask + 4 * i, -1); break; }
      // (one being derived, its rules' types of it (String's reader typed a narrowing of String): anything, no re-entry)
      const bn = w(THREAD + T_BEGUN_N), bs = w(THREAD + T_BEGUN); if (bs && bn < 64) put(bs + 4 * bn, type); put(THREAD + T_BEGUN_N, bn + 1);
      const sub = begun(ty, depth + 1);
      put(THREAD + T_BEGUN_N, bn);
      for (let i = 0; i < 8; i++) put(mask + 4 * i, w(mask + 4 * i) | w(sub + 4 * i));
    }
    if (slot && !w(THREAD + T_REG_AT) && acas(slot, aload(slot), type) !== -1) { wrote(slot); put(slot + 4, last); for (let i = 0; i < 8; i++) put(slot + 8 + 4 * i, w(mask + 4 * i)); }
    return mask;
  }
  // (a type no rule of which reads it, a value, `{a: false | true}`: a name of that value, read where everything is, is one)
  function named_as(at: number, end: number, type: number, sc: number): number {
    if (!worded(at, end)) return 0;
    if (w(THREAD + T_QUIET) >= TYPINGS) return 0;
    // (or the value a level reads, spliced in as a text: one of the type, as the language says what a value is)
    const sp = w(THREAD + T_SPLICE), spliced = sp && at === sp && end === sp + 2 ? w(THREAD + T_SPLICE_V) : 0;
    if (spliced === type) return 1;
    if (!spliced && read(at, end, latest(w(GLOBAL)), 0, 0, HOLES | METHOD, sc) < 0) return 0;
    const rule = spliced ? 0 : w(sc + 512);
    if (!spliced && w(rule + R_KIND) === VALUE) return w(rule + R_BS) === type ? 1 : 0;
    const quiet = w(THREAD + T_QUIET), said = w(THREAD + T_SAID), hole = w(THREAD + T_HOLE), fault = w(THREAD + T_FAULT), jump = w(THREAD + T_JUMP_N);
    set(THREAD + T_QUIET, quiet + 1); put(THREAD + T_HOLE, 0);
    const g = w(GLOBAL);
    let v = 0;
    if (spliced) { set(THREAD + T_RAN, 1); put(THREAD + T_SPLICE, 0); v = asked_of(THREAD, spliced, W_IS, type) === w(TRUE_) ? type : 0; put(THREAD + T_SPLICE, sp); }
    else v = apply(THREAD, rule, 0, frame(0, 0, g, at, end, 0, 0, g, g), 0, g, at, end, g, g);
    set(THREAD + T_QUIET, quiet); set(THREAD + T_SAID, said); put(THREAD + T_HOLE, hole); put(THREAD + T_FAULT, fault || (w(THREAD + T_FAULT) === L_DEEP || w(THREAD + T_FAULT) === L_MEMORY || w(THREAD + T_FAULT) === L_FULL ? w(THREAD + T_FAULT) : 0)); put(THREAD + T_JUMP_N, jump);
    return v && v === type ? 1 : 0;
  }
  function checked(at: number, end: number, type: number, s: number): number {
    const was = w(THREAD + T_SCRATCH);
    if (s + 3 * SCRATCH > w(THREAD + T_SCRATCH_END)) { set(THREAD + T_CUT, 1); return 0; }
    // (what it reads, past what the reading checking it holds; and what that reads in turn, past that)
    put(THREAD + T_SCRATCH, s + 2 * SCRATCH);
    const ok = checking(at, end, type, s + SCRATCH);
    put(THREAD + T_SCRATCH, was);
    return ok;
  }
  function checking(at: number, end: number, type: number, sc: number): number {
    // (what reads it in the language binding looser than the type's own rules (declared after them, `,` in `true, false` as
    // Arguments): its parts, each of the type)
    const last = latest(type);
    if (last && last !== w(type + N_BASE) && read(at, end, latest(w(GLOBAL)), 0, HOLES, METHOD | SUPERPOSING, sc) === end) {
      const g = w(sc + 512), gh = w(g + R_HOLES);
      // (not one that takes it whole, a reader of it (`{digits: Decimal_glyphs}`): that is no reading of it in parts)
      const whole = gh === 1 && skip(w(sc + 516), w(sc + 520)) === skip(at, end) && w(sc + 520) >= end;
      if (gh && !whole && w(g + R_OWNER) !== type && declared_at(g) > declared_at(last)) {
        const parts = alloc(8 * gh); for (let i = 0; i < gh; i++) { put(parts + 8 * i, w(sc + 516 + 12 * i)); put(parts + 8 * i + 4, w(sc + 520 + 12 * i)); }
        for (let i = 0; i < gh; i++) if (!typed_(w(parts + 8 * i), w(parts + 8 * i + 4), type, sc + SCRATCH)) return 0;
        return 1;
      }
    }
    // (by its own rules with holes: what it holds under a name is no reading of it; none of which begins as it does, none reads it)
    if (!begins(type, b(at), 0) || read(at, end, latest(type), w(type + N_BASE), HOLES, METHOD, sc) !== end) return named_as(at, end, type, sc);
    // (and what it reads it as: one whose body is a hole of its own is the text; any other, a value (a narrowing's, when what
    // it narrows to holds), read here without saying anything: one that says something, or is none, is no reading)
    const rule = w(sc + 512), holes = w(rule + R_HOLES);
    if (named(rule, w(rule + R_BS), w(rule + R_BE)) >= 0 || ref(rule, 0, w(rule + R_BS), w(rule + R_BE), 1)) return 1;
    // (a check inside what a check runs: its rules reading it is the answer (what it reads it as is not run again, and again))
    const quiet = w(THREAD + T_QUIET);
    // (inside a check, a reading by one of its rules is the answer; but a rule that is one hole alone reads anything, so
    // that it reads says nothing: what it answers is asked, one check deeper (`"0" | "1"`, a list read as a type); deeper
    // still, no reading)
    // (one hole of no type, or of one reading anything, `{value: narrowed}` of a narrowing of Node)
    // (or one hole of a type, a narrowing's (`{value: narrowed}`): that its type reads it says nothing of its condition)
    const anything = w(rule + R_PARTS) === 1 && (w(rule + R_PART) & 15) === HOLE;
    if (quiet >= TYPINGS && !anything) return 1;
    // (of a type kept, `external kept`: its rules answer what they read, so one reading it is the answer, not run to be asked)
    if (kept_type(type)) return 1;
    if (quiet >= TYPINGS + 2) return 0;
    const caps = alloc(8 * holes);
    for (let i = 0; i < holes; i++) { put(caps + 8 * i, w(sc + 516 + 12 * i)); put(caps + 8 * i + 4, w(sc + 520 + 12 * i)); }
    const said = w(THREAD + T_SAID), hole = w(THREAD + T_HOLE), fault = w(THREAD + T_FAULT), jump = w(THREAD + T_JUMP_N);
    set(THREAD + T_QUIET, quiet + 1); put(THREAD + T_HOLE, 0); put(THREAD + T_FAULT, 0); put(THREAD + T_JUMP_N, 0);
    // (what it took read where it is written: `f(x: other)`'s `other` the caller's)
    const wv = w(THREAD + T_WRITTEN_IN), written = wv && w(wv + N_IS) === IS_NODE ? wv : type;
    const v = apply(THREAD, rule, caps, frame(0, 0, type, at, end, 0, 0, written, type), 0, type, at, end, written, type);
    // (and what went too deep in it, too deep for what checks it too: kept)
    const ok = v && w(THREAD + T_SAID) === said && !w(THREAD + T_FAULT) && !w(THREAD + T_JUMP_N) ? 1 : 0;
    set(THREAD + T_QUIET, quiet); set(THREAD + T_SAID, said); put(THREAD + T_HOLE, hole); put(THREAD + T_FAULT, fault || (w(THREAD + T_FAULT) === L_DEEP || w(THREAD + T_FAULT) === L_MEMORY || w(THREAD + T_FAULT) === L_FULL ? w(THREAD + T_FAULT) : 0)); put(THREAD + T_JUMP_N, jump);
    return ok;
  }

  // Rule r's head from part k, at `at`: where it ends (-1: it doesn't match), each hole's span at s. A hole ends the nearest the
  // rest matches, nothing open in it (and, typed, what its type reads whole); the last one at the end of the line.
  function match(r: number, k: number, at: number, end: number, s: number): number {
    const n = w(r + R_PARTS);
    // (where the space this matched last began: the last hole, begun on a line under it, as deep as the line before it)
    let sp = -1;
    while (k < n) {
      // (a rule the map says superposes (`{f}({argument: Superposed})`): its type asked of the value, when it is applied)
      const q = r + R_PART + PART * k, kind = w(q) & 15, hug = w(q) & HUG, a = w(q + 4), len = w(q + 8), type = (w(r + R_FLAGS) & (SUPERPOSING | REFUSES)) ? 0 : w(q + 16);
      if (type === 1) return -1;
      if (kind === LITERAL) {
        if (at + len > end || !same(at, a, len) || !apart(at - 1, at)) return -1;
        // (in a body, a hole of its rule by its name, `{key}`, is that hole: no text written in a head reads its brackets)
        if (w(THREAD + T_BODY) && same(a, w(OPEN), w(OPEN_LENGTH)) && bracket(at, end) === w(OPEN_LENGTH) * 8 + 5 && ref(w(THREAD + T_BODY), 0, at, past(at, end), 1)) return -1;
        at += len;
        // (but against text of its own written right after it, `{operator}=` with `+` in it: one word, `+=`)
        if (at < end && !apart(at - 1, at) && !(k + 1 < n && (w(r + R_PART + PART * (k + 1)) & 15) === LITERAL)) return -1;
        k++; continue;
      }
      // (a space, and in what continues a statement, a newline)
      // (no space where one is written before a hole, at brackets right after a word: those are the word's, `static{2 <= .}`
      // is no `static {statement}`; brackets written in the head, `some (predicate)`, read `some(…)`)
      if (kind === SPACE) {
        const from = at; sp = from; while (at < end && b(at) <= 32) at++; if (at === from && (hug || (at < end && (b(at) === 40 || b(at) === 91 || b(at) === 123) && b(w(CLASSES) + b(at - 1)) === 1 && k + 1 < n && (w(r + R_PART + PART * (k + 1)) & 15) === HOLE))) return -1;
        k++; continue; }
      const cap = s + 12 * w(q + 12);
      if (w(q) & VALUED_HOLE) { let o = at; while (o < end && b(w(CLASSES) + b(o)) === 2) o++; if (o > at && (o >= end || b(o) <= 32)) return -1; if (o === at && keyword_led(at, end)) return -1; }
      k++;
      if (k === n) {
        // (the last: to the end of the line; written against text, not beginning with a space, and none in it outside brackets
        // (`.{member}` of `.me() == p` is `me()`, what follows read on what it answers); a word, of a word's characters)
        if (hug && b(at) <= 32) return -1;
        let nl = 0; if (sp > 0) for (let x = sp; x < at && nl >= 0; x++) nl = b(x) === 10 ? 1 : b(x) <= 32 ? nl : -1;
        let p = line_of(at, end, 0, nl > 0 ? sp - 1 : at);
        if (hug) { let u = at; while (u < p && b(u) > 32) u = (bracket(u, p) & 3) === 1 ? past(u, p) : u + 1; if (u < p) p = u; }
        while (p > at && b(p - 1) <= 32) p--;
        if (p <= at) return -1;
        if (w(q) & WORD) for (let x = at; x < p; x++) if (b(w(CLASSES) + b(x)) !== 1) return -1;
        if (w(q) & OPER) for (let x = at; x < p; x++) if (b(w(CLASSES) + b(x)) !== 2) return -1;
        if (type && !typed(r, at, p, type, s)) return -1;
        put(cap, at); put(cap + 4, p);
        return p;
      }
      // (after what opens a pair, the hole all there is before what closes it: what is inside it, up to that)
      if (k >= 2 && (w(r + R_PART + PART * (k - 2)) & 15) === LITERAL && (bracket(at - 1, end) & 1) && (w(r + R_PART + PART * k) & 15) === LITERAL && (bracket(w(r + R_PART + PART * k + 4), w(r + R_PART + PART * k + 4) + w(r + R_PART + PART * k + 8)) & 3) >= 2) {
        let p = past(at - 1, end);
        const c = bracket(p - 1, end);
        if ((c & 3) !== 2 && (c & 3) !== 3) return -1;
        p -= c >> 3;
        if (p <= at) return -1;
        // (typed: what its type reads, too; when nothing after it is typed, asked once the rest reads)
        const later = type && !untyped(r, k);
        if (later && !typed(r, at, p, type, s)) return -1;
        const e: number = match(r, k, p, end, s);
        if (e < 0 || (type && !later && !typed(r, at, p, type, s))) return -1;
        put(cap, at); put(cap + 4, p);
        return e;
      }
      // (an operator hole, `[x]`: the operator there, all of it, and no more)
      if (w(q) & OPER) { let oe = at; while (oe < end && b(w(CLASSES) + b(oe)) === 2) oe++; if (oe === at) return -1; const e: number = match(r, k, oe, end, s); if (e >= 0) { put(cap, at); put(cap + 4, oe); return e; } return -1; }
      const later = type && !untyped(r, k);
      // (before brackets written against it, `{f}(…)`: never ending in an operator, `(on).(code)` is no call of `(on).`)
      const nq = r + R_PART + PART * k, called = (w(nq) & 15) === LITERAL && (b(w(nq + 4)) === 40 || b(w(nq + 4)) === 91) ? 1 : 0;
      // (an untyped hole never ends inside a word; a typed one ends where its type reads (`{first: Digit}{rest: Digit[]}` of `10`))
      // (nor inside a choice, ` ? … : ` written apart, but for a rule of one, `{condition} ? {yes} : {no}`: `c ? a, b : d` is
      // the choice of `a, b`; written as a statement, not in brackets, its second holds the rest too, `c ? [] : x, rest`; in
      // brackets a `,` after it is the next item, `f(sign: c ? None : "-", integer)`)
      const chooses = choice_led(r, k), listed_by = comma_led(r, k);
      // (a hole between two texts of their own that open and close, `/* {comment} */`: none ends inside one in it, nested)
      const nests = nested_pair(r, k); let nest = 0;
      // (led by it, then an operator: read left to right, the hole the farthest the rest matches, `1 - 2 - 3` as `(1 - 2) - 3`;
      // not a definition's, an assignment's (`a = b = c`) or a member's)
      const leftward = k === 1 && !type && !(w(r + R_FLAGS) & 1) && operator_next(r, k) ? 1 : 0; let farthest = -1;
      // (right before a typed hole, `{type}{length: Subscript.String}` of `Binary₃₂`: inside a word too, where its characters
      // change kind (a letter to a digit, to one of more bytes), where that one reads)
      const before_typed = (w(r + R_PART + PART * k) & 15) === HOLE && w(r + R_PART + PART * k + 16) > 1 ? 1 : 0;
      for (let p = at; p < end;) {
        if (nests) { const oq = w(r + R_PART), cq = w(r + R_PART + PART * (w(r + R_PARTS) - 1)); if (same(p, w(oq + 4), w(oq + 8))) { nest++; p += w(oq + 8); continue; } if (nest > 0 && same(p, w(cq + 4), w(cq + 8))) { nest--; p += w(cq + 8); continue; } }
        if (p > at && (type || apart(p - 1, p) || (before_typed && b(p - 1) < 128 && (b(p) >= 192 || (b(p) >= 48 && b(p) <= 57 && !(b(p - 1) >= 48 && b(p - 1) <= 57))))) && !(called && b(w(CLASSES) + b(p - 1)) === 2) && (!later || (starts(r, k, p, end) && typed(r, at, p, type, s)))) {
          const e: number = match(r, k, p, end, s);
          if (e >= 0 && (!type || later || typed(r, at, p, type, s))) { if (leftward) farthest = p; else { put(cap, at); put(cap + 4, p); return e; } }
        }
        if (!chooses && p > at && b(p) === 63 && b(p - 1) <= 32 && p + 1 < end && b(p + 1) <= 32) { if (listed_by && !enclosed(at)) break; const ce = choice_end(p, end); if (ce > 0) { p = ce; continue; } }
        const c = bracket(p, end);
        if ((c & 3) === 2) break;
        if (c & 1) { p = past(p, end); continue; }
        if (hug && b(p) <= 32) break;
        p++;
      }
      if (farthest >= 0) { const e: number = match(r, k, farthest, end, s); put(cap, at); put(cap + 4, farthest); return e; }
      return -1;
    }
    return at;
  }

  // (whether rule r's next text from part k is a choice's own, `?` or `:` (`{condition} ? {yes} : {no}`))
  function choice_led(r: number, k: number): number {
    for (let n = w(r + R_PARTS); k < n; k++) { const q = r + R_PART + PART * k, kind = w(q) & 15; if (kind === SPACE) continue; if (kind === LITERAL) return b(w(q + 4)) === 63 || b(w(q + 4)) === 58 ? 1 : 0; return 0; }
    return 0;
  }
  // (whether rule r is two texts of their own around the hole before part k, `/*`, `*/` (two characters or more, not the same):
  // a pair, nested)
  function nested_pair(r: number, k: number): number {
    const n = w(r + R_PARTS); if (n < 3) return 0;
    const oq = r + R_PART, cq = r + R_PART + PART * (n - 1);
    if ((w(oq) & 15) !== LITERAL || (w(cq) & 15) !== LITERAL || w(oq + 8) < 2 || w(cq + 8) < 2) return 0;
    if (w(oq + 8) === w(cq + 8) && same(w(oq + 4), w(cq + 4), w(oq + 8))) return 0;
    let holes = 0; for (let i = 1; i < n - 1; i++) { const kind = w(r + R_PART + PART * i) & 15; if (kind === HOLE) holes++; else if (kind !== SPACE) return 0; }
    return holes === 1 ? 1 : 0;
  }
  // (whether rule r's next text from part k is an infix operator's, `-`, `==`, `plus`: not one that gives (`=`, `:=`, `+=`,
  // `=>`), a member's `.`, a list's `,`, a choice's, or one that composes)
  function operator_next(r: number, k: number): number {
    for (let n = w(r + R_PARTS); k < n; k++) {
      const q = r + R_PART + PART * k, kind = w(q) & 15; if (kind === SPACE) continue; if (kind !== LITERAL) return 0;
      const a = w(q + 4), len = w(q + 8), last = b(a + len - 1);
      if (b(a) === 46 || b(a) === 44 || b(a) === 63 || b(a) === 58) return 0;
      // (nor one that composes, `|` or `&`: either way the same, and read nearest it is not read again for each)
      if (len === 1 && (b(a) === 124 || b(a) === 38)) return 0;
      if (last === 62 && len >= 2 && b(a + len - 2) === 61) return 0;
      if (last === 61 && !(len >= 2 && (b(a + len - 2) === 61 || b(a + len - 2) === 33 || b(a + len - 2) === 60 || b(a + len - 2) === 62))) return 0;
      // (and a hole after it: infix, not `{type}[]`)
      for (let j = k + 1; j < n; j++) if ((w(r + R_PART + PART * j) & 15) === HOLE) return 1;
      return 0;
    }
    return 0;
  }
  // (whether rule r's next text from part k is `,`, what makes a list (`{list}, {other}`))
  function comma_led(r: number, k: number): number {
    for (let n = w(r + R_PARTS); k < n; k++) { const q = r + R_PART + PART * k, kind = w(q) & 15; if (kind === SPACE) continue; if (kind === LITERAL) return b(w(q + 4)) === 44 ? 1 : 0; return 0; }
    return 0;
  }
  // (whether what is read from at is what brackets hold, `(` or `[` before it: items, which `,` separates)
  function enclosed(at: number): number { let q = at - 1; while (q > 0 && b(q) <= 32 && b(q) !== 10) q--; return b(q) === 40 || b(q) === 91 ? 1 : 0; }
  // (from a choice's ` ? ` at p: just past its ` : `, choices in it counted, brackets skipped; none, 0)
  function choice_end(p: number, end: number): number {
    let depth = 1;
    for (let q = p + 1; q < end;) {
      const c = bracket(q, end);
      if ((c & 3) === 2) return 0;
      if (c & 1) { q = past(q, end); continue; }
      if (b(q - 1) <= 32 && q + 1 < end && b(q + 1) <= 32) { if (b(q) === 63) depth++; else if (b(q) === 58) { depth--; if (depth === 0) return q + 1; } }
      if (b(q) === 10) return 0;
      q++;
    }
    return 0;
  }
  // (can rule r's parts from k begin at p: a space skipped, text as written, a typed hole how its type begins)
  function starts(r: number, k: number, p: number, end: number): number {
    for (let n = w(r + R_PARTS); k < n; k++) {
      const q = r + R_PART + PART * k, kind = w(q) & 15;
      if (kind === SPACE) { while (p < end && b(p) <= 32) p++; continue; }
      if (p >= end) return 0;
      if (kind === LITERAL) return same(p, w(q + 4), 1);
      // (one whose type is not read yet reads nothing yet)
      return w(q + 16) === 1 ? 0 : w(q + 16) ? begins(w(q + 16), b(p), 0) : 1;
    }
    return 1;
  }
  // (rule r's parts from k: none typed, reading them asks nothing of a type)
  function untyped(r: number, k: number): number { for (let n = w(r + R_PARTS); k < n; k++) if ((w(r + R_PART + PART * k) & 15) === HOLE && w(r + R_PART + PART * k + 16)) return 0; return 1; }
  // A statement at `at`, read with the rules from `vis` on (to `stop`), the ones `want` asks for and not `refuse`: where it ends
  // (-1: none reads it). Of the rules that read the whole line, a definition first, then one led by text, then the latest
  // (declaration order is precedence: what is declared last binds loosest); it goes at s + 512, its holes' spans after it. Past a
  // node's own rules: what it is also made of (and what that sees), then its parent's.
  function read(at: number, end: number, vis: number, stop: number, want: number, refuse: number, s: number): number {
    if (DEBUG) count(K_READ);
    let best = 0, longest = -1, ends = -1, backs = 0, deferred = 0, weak = 0, group = 0, found_in = 0, found_seq = 0;
    const out = s + 512, has = bytes(at, end), led = 1 + (b(at) & 63), back = s + 800;
    // (a comment after it, `//` after a space, outside brackets and quotes: a rule with `//` in its head that reads it first
    // (what is before it then read alone): no hole takes a comment, `true // a ?= b` is no `?=`)
    let commented = 0;
    for (let p = at + 1; p + 1 < end;) { const c = b(p); if (c === 47 && b(p + 1) === 47 && b(p - 1) <= 32) { commented = 1; if (coded_after(p, end)) commented = 2; break; } if (c === 40 || c === 91 || c === 123 || c === 34 || c === 96 || c === 39) { const q = past(p, end); p = q > p ? q : p + 1; } else p++; }
    // (one with lines after it, a list going on past a comment: not read as a comment, which ends its line)
    let lo = 0, hi = 0, kinds = 0, refused = 0, best_fit = 0, best_lit = 0;
    // (a name defined more than once, with parameters and without (`min (b) =>`, `min =>`): by what is given, brackets after it
    // or none)
    let calling = 0; { let q = end; while (b(q) === 32) q++; calling = b(q) === 40 ? 1 : 0; }
    let cyc_mark = 0, cyc_n = 0, cyc_backs = 0, bare = 0;
    // (the level the language is read with, `O`, first: its rules before any the text is read in, a scope of its own (what it is
    // made of, never what it is in); then where the text is)
    const level_now = (w(THREAD + T_QUIET) ? 0 : thread_level()) || w(LEVEL);
    let leveling = level_now && !(refuse & VALUE_OWN) && vis ? 1 : 0;
    for (let r = leveling ? latest(level_now) : vis; r && r !== stop;) {
      if (DEBUG) count(K_NODE);
      // (--debug: a reading that has walked very far, what it sees asked whether it goes round (a node made of, or in, what is
      // made of or in it): said, with the node, not gone round forever)
      if (DEBUG && ++cyc_n > 1048576) {
        if (!cyc_mark) { cyc_mark = 1; const c = cycle_of(owner(vis), 0); if (c) { debug(D_FAULT, 86 + 1000, c, 0); return -1; } cyc_mark = r; cyc_backs = backs; }
        // (and the same rules again, where the walk was, a chain of them spliced into itself)
        else if (r === cyc_mark && backs === cyc_backs) { debug(D_FAULT, 86 + 1001, w(r + R_OWNER), r); return -1; }
        else if ((cyc_n & (cyc_n - 1)) === 0) { cyc_mark = r; cyc_backs = backs; }
      }
      // (a node's rules, from r: the ones led by a hole, then the ones led by text that begins as this does; each in the
      // order they were declared, the last first)
      let x = r;
      // (wanting one led by text: none led by a hole is)
      for (let pass = want & LED ? 1 : 0; pass < 2; pass++) {
        group++;
        // (led by a hole: of a node with many, by the kind of the first text in its head, of the kinds this text has (none: any
        // text), else all of them; led by text, by how it begins. Of a kind, as declared, the last first: across kinds, the one
        // declared last of them)
        const tr = w(r + R_SKIP), many = !pass && tr && w(tr + 4 * SEQ_AT) > MANY ? 1 : 0;
        // (the kinds of character the text has, once)
        if (many && !kinds) { kinds = 1; for (let p = at, kt = w(KINDS), cl = w(CLASSES); p < end;) { if (b(cl + b(p)) === 1) { const c = worded_kind(p, end); hi |= 1 << (c - 32); while (p < end && b(cl + b(p)) === 1) p++; continue; } const c = b(kt + b(p)); if (c < 32) lo |= 1 << c; else hi |= 1 << (c - 32); p++; } }
        let m = many ? lo : 0, mh = many ? hi : 0, k = many ? -1 : 64;
        for (;;) {
        const kind = k === 64 ? (pass ? led : 0) : k < 0 ? 129 : 65 + k;
        // (from the first of that kind)
        x = many && w(tr + 4 * KIND_AT) !== kind ? w(tr + 4 * kind) : r;
        while (x && x !== stop && !(w(x + R_FLAGS) & DEAD)) {
          if (DEBUG && freed(x)) { debug(D_FAULT, 95, at, end); return -1; }
          const f = w(x + R_FLAGS), tb = w(x + R_SKIP), kx = tb ? w(tb + 4 * KIND_AT) : kind_of(x);
          if (DEBUG) { count(K_VISIT); if (!pass) { count(K_HOLE_LED); if (w(240)) { const o = w(x + R_OWNER), h = w(240) + 8 * ((o >> 3) & 4095); put(h, o); put(h + 4, w(h + 4) + 1); } } }
          if (DEBUG && (w(FAIL_FAST) & 64) && b(at) === 46) { const hd = w(x + R_HEAD); if (hd && w(hd + N_B) - w(hd + N_A) === 9 && b(w(hd + N_A)) === 46 && b(w(hd + N_A) + 1) === 123 && b(w(hd + N_A) + 2) === 109) debug(D_FAULT, 79, ((kind ? kx === kind : kx >= 65) ? 1 : 0) | (x !== w(THREAD + T_SKIP) ? 2 : 0) | ((f & want) === want ? 4 : 0) | (!(f & refuse) ? 8 : 0) | (!(w(x + R_MASK) & ~has) ? 16 : 0) | ((f & LED ? b(at) === b(w(x + R_PART + 4)) : written(x, at, end)) ? 32 : 0) | (match(x, 0, at, end, s) >= 0 ? 64 : 0), match(x, 0, at, end, s) - end); }
          // (not the one rule that never reads itself here, `T_SKIP`)
          if ((kind ? kx === kind : kx >= 65) && !(commented === 2 && comments(x)) && x !== w(THREAD + T_SKIP) && (!w(THREAD + T_SKIPS_N) || !skipped_rule(x)) && !(w(THREAD + T_NAMING) === at && (w(x + R_PART) & 15) === LITERAL && w(x + R_PART + 8) === w(THREAD + T_NAMING_N) && same(w(x + R_PART + 4), at, w(THREAD + T_NAMING_N)) && !passes(x) && operand_led(x) && (!DEBUG || debug(D_FAULT, 1097, at, x) || 1)) && (f & want) === want && !(f & refuse) && !((refuse & TYPE_READER) && (f & READER) && w(x + R_OWNER) !== w(GLOBAL)) && !(w(x + R_MASK) & ~has) && (f & LED ? b(at) === b(w(x + R_PART + 4)) : written(x, at, end))) {
            if (DEBUG) count(K_MATCH);
            // (the numeral the kernel's map names, on digits in ten: what it reads, without asking its type (which is made of
            // numbers it reads: `Decimal.String` is `"0".."9"`))
            let e = -1;
            // (and on a text of other characters each one byte, none: its digits are `"0".."9"`)
            // (a level's rule: only where the text it is written with is there, in order, before any hole is read)
            if (leveling && !fits(x, at, end)) { x = tb && kind ? w(tb + 4 * kind) : w(x); continue; }
            if ((w(x + R_FLAGS) & NUMERAL) && numeral_of(at, end) >= 0) { put(s, at); put(s + 4, end); e = end; } else if ((w(x + R_FLAGS) & NUMERAL) && ascii(at, end)) e = -1; else e = match(x, 0, at, end, s);
            // (a bare name, not read on a value: never a member's (a word-led rule of a node holding members))
            if (e >= 0 && (refuse & MEMBER) && (f & LED) && !(f & STATIC) && b(w(CLASSES) + b(w(x + R_PART + 4))) === 1 && w(x + R_OWNER) && w(w(w(x + R_OWNER) + N_BASE) + R_KIND) === MEMBERS_MARK && !same_block(w(x + R_HEAD), at)) { refused = 1; e = -1; }
            if (e >= 0) {
              while (e < end && b(e) <= 32) e++;
              // (a definition first, then one led by text, then a method led by a hole (`{this}{argument}`, after `{this}(…)`))
              const score = (f & 1) * 4 + (f & LED ? 2 : f & METHOD ? 1 : 0);
              // (a name given a place, what nothing defined yet: one defined further out reads it instead)
              const placed_ = w(x + R_KIND) === VALUE && w(w(x + R_BS) + N_IS) === IS_PLACE ? 1 : 0;
              const seq = w(x + R_STAMP);
              // (one led by text but declared before one led by a hole whose word leads statements too, `return n if n == 0`:
              // the one declared later binds looser, `{guarded} if {condition}` guarding `return n`)
              // (and on a line with a comment after it, a rule with `//` in its head first: no other's hole takes the comment)
              const over = best && e >= end ? (commented && comments(x) && !comments(best) ? 1 : commented && comments(best) && !comments(x) ? -1 : guards(x, best) ? 1 : guards(best, x) ? -1 : 0) : 0;
              const fit = ((f & CALLS) ? 1 : 0) === calling ? 1 : 0;
              // (of two led by text that read it all, the one with more of its text written (`@me/{path}` over `@{name}/{path}`,
              // §4.3 the longest declared word), then the one declared later)
              let lit = 0; for (let lit_k = 0; lit_k < w(x + R_PARTS); lit_k++) { const lit_q = x + R_PART + PART * lit_k; if ((w(lit_q) & 15) === LITERAL) lit += w(lit_q + 8); }
              if (e >= end && over >= 0 && (over > 0 || score > longest || (score === longest && ((weak && !placed_) || (found_in === group && (fit !== best_fit ? fit > best_fit : (f & LED) && (w(best + R_FLAGS) & LED) && lit !== best_lit ? lit > best_lit : seq > found_seq)))))) {
                best = x; longest = score; ends = e; weak = placed_; found_in = group; found_seq = seq; best_fit = fit; best_lit = lit;
                const h = w(x + R_HOLES) * 12;
                for (let i = 0; i < h; i += 4) put(out + 4 + i, w(s + i));
              }
            }
          }
          if (DEBUG) { const nx = tb && kind ? w(tb + 4 * kind) : w(x); if (nx && w(nx + R_FLAGS) === -1) { const hd = w(x + R_HEAD); debug(D_FAULT, 95, hd ? w(hd + N_A) : at, hd ? w(hd + N_B) : end); return -1; } }
          x = tb && kind ? w(tb + 4 * kind) : w(x);
        }
        if (m) { k = ctz(m); m &= m - 1; } else if (mh) { k = 32 + ctz(mh); mh &= mh - 1; } else break;
        }
      }
      // (past its rules (x, where they end): what it is also made of (and what that sees, and so on), then its parent's)
      if (!x || x === stop) break;
      r = w(x);
      if (!r) {
        const o = w(x + R_OWNER);
        // (a member read (VALUE_OWN), `x.name`: x's own rules and what it is made of; past where any of it was made, a method's
        // own node not what that method runs on (a value made in a list's method is no list: §21.3, a member that is not there
        // is nothing))
        if (o && w(o + N_ALSO) && backs < 48 && !(bare && run_node(o))) { put(back + 4 * backs, leveling ? 0 : w(o + N_PARENT)); backs++; r = latest(w(o + N_ALSO)); continue; }
        if (refuse & VALUE_OWN) bare = 1;
        let p = o && !leveling ? w(o + N_PARENT) : 0;
        // (what everything is in, the language itself, after every component still to see: a component's way out is not
        // past the rest of what the value is made of (`X &+= Y`: X's own class body before the language's))
        if (p === w(GLOBAL) && backs) { deferred = p; p = 0; }
        while (!p && backs) { backs--; p = w(back + 4 * backs); if (p === w(GLOBAL) && backs) { deferred = p; p = 0; } }
        if (!p) p = deferred, deferred = 0;
        if (!p && leveling) { leveling = 0; backs = 0; deferred = 0; r = vis; continue; }
        if (!p) break;
        r = latest(p);
      }
    }
    if (DEBUG && refused && !best) debug(D_FAULT, 1113, at, end);
    // (nothing reads it as the node was when this was taken; a value given that name in that node since, `x: T` read after
    // this was taken (a header's field, a type after it naming it): that one)
    if (!best && vis && !(refuse & VALUE_OWN)) {
      const ow = w(vis + R_OWNER);
      if (ow && w(ow + N_IS) === IS_NODE && ow !== w(GLOBAL) && latest(ow) !== vis) for (let nr = latest(ow), k = 0; nr && nr !== vis && k < 4096; nr = w(nr), k++) {
        const nh = w(nr + R_HEAD);
        if (w(nr + R_KIND) === VALUE && !w(nr + R_HOLES) && nh && !(w(nr + R_FLAGS) & DEAD) && trimmed(w(nh + N_A), w(nh + N_B) - w(nh + N_A), at, end)) { best = nr; ends = end; break; }
      }
    }
    // (`RAY_EXPLAIN`: the rule read there told the host, the statement the host named)
    if (w(EXPLAIN_AT) === at) { const hd = best ? w(best + R_HEAD) : 0; told(at, L_EXPLAIN, hd ? w(hd + N_A) : 0, hd ? w(hd + N_B) : 0); }
    // (`RAY_TRACE`: the rule read there traced when it is applied; what nothing reads while it is, told)
    if (w(THREAD + T_TRACE_MAX)) { if (w(EXPLAIN_AT) === at && best && !w(THREAD + T_TRACE_ON)) set(THREAD + T_TRACE_ARM, best); if (w(THREAD + T_TRACE_ON) && !best && w(THREAD + T_TRACE_N) < w(THREAD + T_TRACE_MAX) && w(THREAD + T_TRACE_D) < w(THREAD + T_TRACE_DEPTH)) { set(THREAD + T_TRACE_N, w(THREAD + T_TRACE_N) + 1); set(THREAD + 932, vis ? w(vis + R_OWNER) : 0); told(at, L_TRACE_NONE, at, end); } }
    put(out, best);
    return ends;
  }
  // (a node made by `|` or `&`: its own, or what it is made of short of Node, holding `superposes`, `conjoins` or `conjoined`)
  function superposed_node(x: number, depth: number): number {
    if (!x || depth > 6 || x === w(GLOBAL) || x === w(SUPER_NODE) || w(x + N_IS) !== IS_NODE) return 0;
    for (let r = latest(x); r && !(w(r + R_FLAGS) & DEAD); r = w(r)) {
      const hd = w(r + R_HEAD); if (!hd || w(r + R_HOLES)) continue;
      const a = w(hd + N_A), n = w(hd + N_B) - a;
      if ((n === 10 && same(a, w(w(MAPPED) + 8 * M_SUPERPOSED), 9) && b(a + 9) === 115) || (n === 8 && b(a + 0) === 99 && b(a + 1) === 111 && b(a + 2) === 110 && b(a + 3) === 106 && b(a + 4) === 111 && b(a + 5) === 105 && b(a + 6) === 110 && b(a + 7) === 115) || (n === 9 && b(a + 0) === 99 && b(a + 1) === 111 && b(a + 2) === 110 && b(a + 3) === 106 && b(a + 4) === 111 && b(a + 5) === 105 && b(a + 6) === 110 && b(a + 7) === 101 && b(a + 8) === 100)) { if (DEBUG && w(THREAD + T_TESTING)) debug(D_FAULT, 1106, a, a + n); return 1; }
    }
    // (what it is made of, as Node.ray's rule reads it on the value; not where it is written, what it is in)
    return superposed_node(w(x + N_ALSO), depth + 1) || (made_link(x) ? superposed_node(w(x + N_PARENT), depth + 1) : 0);
  }
  // (a link of components, `X &+= Y` again: its parent is what X was made of before, not where it is)
  function made_link(x: number): number { return w(x + N_IS) === IS_NODE && !w(x + N_A) && !w(x + N_B) && latest(x) === w(x + N_BASE) && w(x + N_ALSO) ? 1 : 0; }
  // (of what s is made of, in the order it is seen, the first whose own or what it is made of holds o's rules: that one when it
  // is a value (not a class: a class defines its `of`), its methods run on it; else none, they run on s)
  function valued_component(s: number, o: number): number {
    let c = w(s + N_ALSO);
    for (let n = 0; c && n < 16; n++) {
      // (a link of components, `X &+= Y` more than once: the last added (its own also), then the ones before (its parent))
      const link = w(c + N_IS) === IS_NODE && !w(c + N_A) && !w(c + N_B) && latest(c) === w(c + N_BASE) && w(c + N_ALSO);
      const v = link ? w(c + N_ALSO) : c;
      if (reaches(v, o, 0)) return classed(v) ? 0 : v;
      c = link ? w(c + N_PARENT) : 0;
    }
    return 0;
  }
  // (a node on a cycle of what nodes are made of and in, from v: one met again while it is being walked; else 0. With --debug
  // only: each node's mark, its depth on the path being walked, in the scratch after the reading's)
  function cycle_of(v: number, depth: number): number {
    if (!v || depth > 1024 || v === w(GLOBAL) || w(v + N_IS) !== IS_NODE) return 0;
    const path = w(THREAD + T_SCRATCH) + 4096;
    for (let i = 0; i < depth; i++) if (w(path + 4 * i) === v) return v;
    put(path + 4 * depth, v);
    return cycle_of(w(v + N_ALSO), depth + 1) || cycle_of(w(v + N_PARENT), depth + 1);
  }
  // (whether the text from at begins with a word that leads a rule taking more after it, `checked {type}`, `is {type}`: no
  // value of its own, what juxtaposition (`n T`) takes is not one)
  function keyword_led(at: number, end: number): number {
    let o = at; while (o < end && b(w(CLASSES) + b(o)) === 1) o++;
    if (o === at || o >= end || b(o) > 32) return 0;
    for (let r = latest(w(GLOBAL)), k = 0; r && !(w(r + R_FLAGS) & DEAD) && k < 1 << 16; r = w(r), k++) {
      if (w(r + R_PARTS) < 2 || !w(r + R_HOLES) || (w(r + R_PART) & 15) !== LITERAL) continue;
      if (w(r + R_PART + 8) === o - at && same(w(r + R_PART + 4), at, o - at)) return 1;
    }
    return 0;
  }
  // (whether v is, or is made of, o (what it is made of, and what that is made of in turn; a link of components, both))
  // (the rule a node sees by a name (from s, n long): its own, else what it is made of sees (the last it was made of first), else
  // what it is in; not the language's own; none, 0)
  function rule_seen(t: number, nd: number, s: number, n: number, depth: number): number {
    if (!nd || depth > 64 || nd === w(GLOBAL) || w(nd + N_IS) !== IS_NODE) return 0;
    for (let r = latest(nd); r && r !== w(nd + N_BASE); r = w(r)) {
      const hd = w(r + R_HEAD);
      if (!w(r + R_HOLES) && hd && trimmed(w(hd + N_A), w(hd + N_B) - w(hd + N_A), s, s + n)) return r;
      // (a head written as written, `` `.` ``: the name it is, inside the backticks)
      if (!w(r + R_HOLES) && hd && w(hd + N_B) - w(hd + N_A) > 2 && b(w(hd + N_A)) === 96 && b(w(hd + N_B) - 1) === 96 && trimmed(w(hd + N_A) + 1, w(hd + N_B) - w(hd + N_A) - 2, s, s + n)) return r;
    }
    return rule_seen(t, w(nd + N_ALSO), s, n, depth + 1) || rule_seen(t, w(nd + N_PARENT), s, n, depth + 1);
  }
  // (a character as a type: a text of one character, or a character the kernel holds (its code point); else -1)
  function char_of(t: number, x: number): number {
    if (!x) return -1;
    if (w(x + N_IS) === IS_TEXT) { const xs = w(x + N_A), xe = w(x + N_B); if (xe <= xs) return -1; const c0 = b(xs), n0 = c0 < 0x80 ? 1 : c0 < 0xE0 ? 2 : c0 < 0xF0 ? 3 : 4; if (xe - xs !== n0) return -1; let cp = c0 < 0x80 ? c0 : c0 < 0xE0 ? c0 & 31 : c0 < 0xF0 ? c0 & 15 : c0 & 7; for (let i = 1; i < n0; i++) cp = cp << 6 | (b(xs + i) & 63); return cp; }
    if (w(x + N_IS) === IS_NODE && w(CHARS) && w(x + N_PARENT) === w(CHARS) && w(x + N_A) > 0 && !w(x + N_B)) return w(x + N_A) - 1;
    return -1;
  }
  // (a character, or a number the kernel counts (a range of characters steps by numbers): its code point; else -1)
  function code_of(t: number, x: number): number {
    const c = char_of(t, x); if (c >= 0) return c;
    return x && w(x + N_IS) === IS_NODE && w(x + N_A) > 0 && !w(x + N_B) && (w(x + N_PARENT) === w(COUNTED) || w(x + N_PARENT) === w(NUMBERS)) ? w(x + N_A) - 1 : -1;
  }
  // (whether a code point is one of what a superposition of characters is (written ones, characters, lists of them); not such
  // a superposition, -1)
  function chars_among(t: number, ty: number, cp: number): number {
    if (!ty || w(ty + N_IS) !== IS_NODE) return -1;
    const made_in = w(ty + N_PARENT), cs0 = held(t, ty, W_COMPONENTS, 0) || (made_in && held(t, made_in, W_SUPERPOSES, 0) === w(TRUE_) ? held(t, made_in, W_COMPONENTS, 0) : 0);
    let cs = cs0 && cs0 !== w(NOTHING) ? cs0 : 0;
    // (else what it sees, `superposes` answering true: a value kept for a type (`static Blank: Char = …`) is made of the one written)
    if (!cs) { const ws = w(w(WORDS) + 8 * W_SUPERPOSES), wc = w(w(WORDS) + 8 * W_COMPONENTS); if (member_seen(t, ty, ws, w(w(WORDS) + 8 * W_SUPERPOSES + 4), ty, 0) === w(TRUE_)) cs = member_seen(t, ty, wc, w(w(WORDS) + 8 * W_COMPONENTS + 4), ty, 0); }
    if (!cs || cs === w(NOTHING)) return -1;
    let any = 0;
    for (let at = held(t, cs, W_HEAD, 0), k = 0; at && at !== w(NOTHING) && k < 256; at = held(t, at, W_NEXT, 0), k++) {
      const cv = held(t, at, W_VALUE, 0); if (!cv || cv === w(NOTHING)) continue;
      const c1 = code_of(t, cv); if (c1 >= 0) { if (c1 === cp) any = 1; continue; }
      if (!listed(t, cv)) return -1;
      for (let l = held(t, cv, W_HEAD, 0), j = 0; l && l !== w(NOTHING) && j < 4096; l = held(t, l, W_NEXT, 0), j++) { const c2 = code_of(t, held(t, l, W_VALUE, 0)); if (c2 < 0) return -1; if (c2 === cp) any = 1; }
    }
    return any;
  }
  // (the one character a span is: its code point; not one character, -1)
  function span_char(s: number, e: number): number {
    if (e <= s) return -1; const c0 = b(s), n0 = c0 < 0x80 ? 1 : c0 < 0xE0 ? 2 : c0 < 0xF0 ? 3 : 4; if (e - s !== n0) return -1;
    let cp = c0 < 0x80 ? c0 : c0 < 0xE0 ? c0 & 31 : c0 < 0xF0 ? c0 & 15 : c0 & 7; for (let i = 1; i < n0; i++) cp = cp << 6 | (b(s + i) & 63); return cp;
  }
  // (a list of characters, `"\t".."\r"`, as one of what a superposition is: whether a span is one of them; not a list of
  // characters only, -1)
  function chars_hold(t: number, ty: number, s: number, e: number): number {
    if (!listed(t, ty)) return -1;
    const sc = span_char(s, e); let any = 0;
    for (let at = held(t, ty, W_HEAD, 0), k = 0; at && at !== w(NOTHING) && k < 4096; at = held(t, at, W_NEXT, 0), k++) { const c = code_of(t, held(t, at, W_VALUE, 0)); if (c < 0) return -1; if (c === sc) any = 1; }
    return any;
  }
  // (a list of characters (a range of them steps by numbers, each one counted): what `chars_hold` tells a component of a
  // superposition by)
  function chars_listed(t: number, ty: number): number {
    for (let at = held(t, ty, W_HEAD, 0), k = 0; at && at !== w(NOTHING) && k < 4096; at = held(t, at, W_NEXT, 0), k++) if (code_of(t, held(t, at, W_VALUE, 0)) < 0) return 0;
    return 1;
  }
  // (a type that is a repeat: what `T[]` made (its block marked `repeats`), or `T+` of one)
  function repeat_type(t: number, ty: number, depth: number): number {
    if (!ty || depth > 8 || w(ty + N_IS) !== IS_NODE) return 0;
    const made_in = w(ty + N_PARENT); if (made_in && held(t, made_in, W_REPEATS, 0) === w(TRUE_)) return 1;
    const base = held(t, ty, W_NONEMPTY, 0); return base ? repeat_type(t, base, depth + 1) : 0;
  }
  // (whether `text_admits` can tell of every text by a type: a text, String, Node, `T+`, `T[]`, a list of types, a superposition of
  // them, a place holding one)
  function readable(t: number, ty: number, depth: number): number {
    if (!ty || depth > 12 || stopped(t)) return 0;
    if (w(ty + N_IS) === IS_TEXT) return 1;
    if (w(ty + N_IS) === IS_PLACE) { const pv = place_value(t, ty); return pv ? readable(t, pv, depth + 1) : 0; }
    if (char_of(t, ty) >= 0) return 1;
    if (w(ty + N_IS) !== IS_NODE) return 0;
    if (ty === known_class(t, 27, W_STRING_NAME) || ty === known_class(t, 26, W_NODE_NAME)) return 1;
    const base = held(t, ty, W_NONEMPTY, 0); if (base) return readable(t, base, depth + 1);
    if (glyphs_of(ty)) return 1;
    if (listed(t, ty)) { for (let at = held(t, ty, W_HEAD, 0), k = 0; at && at !== w(NOTHING) && k < 256; at = held(t, at, W_NEXT, 0), k++) if (!readable(t, held(t, at, W_VALUE, 0), depth + 1)) return 0; return 1; }
    // (`T[]`: its T, kept in the block it was made of, marked `repeats` (not a method named `each`))
    const made_in = w(ty + N_PARENT), each = made_in && held(t, made_in, W_REPEATS, 0) === w(TRUE_) ? held(t, made_in, W_EACH, 0) : 0;
    if (each && each !== w(NOTHING)) return readable(t, each, depth + 1);
    const cs0 = held(t, ty, W_COMPONENTS, 0) || (made_in && held(t, made_in, W_SUPERPOSES, 0) === w(TRUE_) ? held(t, made_in, W_COMPONENTS, 0) : 0);
    // (a component that is nothing (what could not be made, a range the library does not make yet) reads nothing: passed over)
    if (cs0 && cs0 !== w(NOTHING)) { for (let at = held(t, cs0, W_HEAD, 0), k = 0; at && at !== w(NOTHING) && k < 256; at = held(t, at, W_NEXT, 0), k++) { const rcv = held(t, at, W_VALUE, 0); if (rcv && rcv !== w(NOTHING) && !readable(t, rcv, depth + 1) && !(held(t, rcv, W_LISTING, 0) === w(TRUE_) && chars_listed(t, rcv))) return 0; } return 1; }
    return 0;
  }
  // (whether a node has a rule of its own by a name, from s to e)
  // (whether v has a rule of its own led by itself and brackets, `{this}({argument})`, among its latest: what calls it)
  // (its own, or of what it was made of after, `x &+= { … }`: its `made_of`)
  function callable_(t: number, v: number): number {
    // (a list called so, a key (a class's own call is what makes one: `C.( … )` reads in it))
    return v && w(v + N_IS) === IS_NODE && listed(t, v) ? calls_any(t, v) : 0;
  }
  function calls_any(t: number, v: number): number {
    if (!v || w(v + N_IS) !== IS_NODE || v === w(GLOBAL)) return 0;
    if (calls_itself(v)) return 1;
    const mo = member(t, v, w(w(WORDS) + 8 * W_MADE_OF), w(w(WORDS) + 8 * W_MADE_OF + 4));
    for (let lk = mo && mo !== w(NOTHING) ? held(t, mo, W_HEAD, 0) : 0, n = 0; lk && lk !== w(NOTHING) && n < 16; lk = held(t, lk, W_NEXT, 0), n++) { const mv = held(t, lk, W_VALUE, 0); if (mv && mv !== v && calls_itself(mv)) return 1; }
    return 0;
  }
  function calls_itself(v: number): number {
    if (!v || w(v + N_IS) !== IS_NODE || v === w(GLOBAL)) return 0;
    // (led by itself, `{this}`, kept as what follows it: its first part the bracket)
    for (let r = latest(v), k = 0; r && r !== w(v + N_BASE) && k < 64; r = w(r), k++) { if (w(r + R_FLAGS) & DEAD) continue; const hd = w(r + R_HEAD); if (hd && w(r + R_PARTS) >= 2 && (w(r + R_PART) & 15) === LITERAL && b(w(r + R_PART + 4)) === 40 && b(w(hd + N_A)) === b(w(OPEN)) && w(hd + N_B) - w(hd + N_A) > w(OPEN_LENGTH) + 4 && word(w(hd + N_A) + w(OPEN_LENGTH), w(hd + N_A) + w(OPEN_LENGTH) + 4, W_THIS)) return 1; }
    return 0;
  }
  // (the language's `.{member}`: a literal `.`, a hole, its own)
  function dot_member(r: number): number {
    return w(r + R_OWNER) === w(GLOBAL) && w(r + R_PARTS) === 2 && (w(r + R_PART) & 15) === LITERAL && w(r + R_PART + 8) === 1 && b(w(r + R_PART + 4)) === 46 && (w(r + R_PART + PART) & 15) === HOLE ? 1 : 0;
  }
  // (the language's `.({member})`: a literal `.(`, a hole, a literal `)`, its own)
  function dot_paren(r: number): number {
    return w(r + R_OWNER) === w(GLOBAL) && w(r + R_PARTS) === 3 && (w(r + R_PART) & 15) === LITERAL && w(r + R_PART + 8) === 2 && b(w(r + R_PART + 4)) === 46 && b(w(r + R_PART + 4) + 1) === 40 && (w(r + R_PART + PART) & 15) === HOLE && (w(r + R_PART + 2 * PART) & 15) === LITERAL ? 1 : 0;
  }
  function own_named(nd: number, s: number, e: number): number {
    for (let r = latest(nd), k = 0; r && r !== w(nd + N_BASE) && k < 1 << 16; r = w(r), k++) { const hd = w(r + R_HEAD); if (!w(r + R_HOLES) && hd && trimmed(w(hd + N_A), w(hd + N_B) - w(hd + N_A), s, e)) return 1; }
    return 0;
  }
  // (the value a name was given in a node before its place p was made there: a value, not a place; none, 0)
  function given_already(nd: number, s: number, e: number, p: number): number {
    if (!nd || (w(nd + N_IS) !== IS_NODE && w(nd + N_IS) !== IS_FRAME)) return 0;
    let past = 0;
    for (let r = latest(nd), k = 0; r && r !== w(nd + N_BASE) && k < 1 << 16; r = w(r), k++) {
      const hd = w(r + R_HEAD); if (w(r + R_HOLES) || !hd || !trimmed(w(hd + N_A), w(hd + N_B) - w(hd + N_A), s, e)) continue;
      if (w(r + R_KIND) !== VALUE) return 0;
      const bs = w(r + R_BS);
      if (bs === p) { past = 1; continue; }
      if (!past) continue;
      // (a type given lazily, the same declaration read before: no value given)
      return bs && w(bs + N_IS) !== IS_PLACE && w(bs + N_IS) !== IS_LAZY ? bs : 0;
    }
    return 0;
  }
  // (what a place's name was given where it was named, a value (`x: T` given its type); none, 0)
  function place_value(t: number, p: number): number {
    const sc = place_in(p); if (!sc) return 0;
    let r = 0;
    // (named in a frame: its own rules; in a node: what it sees)
    if (w(sc + N_IS) === IS_FRAME) { for (let fr = latest(sc), k = 0; fr && fr !== w(sc + N_BASE) && k < 4096; fr = w(fr), k++) { const fh = w(fr + R_HEAD); if (!w(fr + R_HOLES) && fh && trimmed(w(fh + N_A), w(fh + N_B) - w(fh + N_A), w(p + N_A), w(p + N_B))) { r = fr; break; } } }
    else if (w(sc + N_IS) === IS_NODE) r = rule_seen(t, sc, w(p + N_A), w(p + N_B) - w(p + N_A), 0);
    const pv = r && w(r + R_KIND) === VALUE ? lazy_read(t, r) : 0;
    if (pv && pv !== p && w(pv + N_IS) !== IS_PLACE) return pv;
    // (given nothing yet (named in a test, where a name nothing reads is no member): the type it was written with, kept on it)
    const pt = member(t, p, w(w(WORDS) + 8 * W_TYPE), w(w(WORDS) + 8 * W_TYPE + 4));
    return pt && pt !== p && w(pt + N_IS) !== IS_PLACE ? pt : 0;
  }
  // (what a node answers under a name, read on another (on): that rule, applied; none, 0)
  // (a member a value does not have, s to e its name: what the value's own `missing` answers, given the name (`missing_name`,
  // a list's: each of its values' own, `.statement` of the Statements read); none, None) TODO(explicit)
  function missed(t: number, on: number, s: number, e: number): number {
    const wm = w(w(WORDS) + 8 * W_MISSING), wl = w(w(WORDS) + 8 * W_MISSING + 4);
    // (not while one is read: what `missing` reads is not asked of it again)
    // (of a place, `.` a closure is given (`.on(xs)`): what it holds)
    if (on && w(on + N_IS) === IS_PLACE) { const pv = place_value(t, on); on = pv && pv !== w(NOTHING) ? pv : 0; }
    if (!on || w(on + N_IS) !== IS_NODE || e <= s || w(t + 944) || !rule_seen(t, on, wm, wl, 0)) return w(NOTHING);
    // (asked only of a list each of whose values a class made holds it as its own, a field it was given; a method is its class's)
    let lk = held(t, on, W_HEAD, 0), lk_n = 0;
    for (; lk && lk !== w(NOTHING) && lk_n < 1 << 16; lk = held(t, lk, W_NEXT, 0), lk_n++) { const lv = held(t, lk, W_VALUE, 0); if (!lv || w(lv + N_IS) !== IS_NODE || !own_named(lv, s, e) || !rule_seen(t, lv, w(w(WORDS) + 8 * W_OF), w(w(WORDS) + 8 * W_OF + 4), 0)) return w(NOTHING); }
    if (!lk_n) return w(NOTHING);
    // (the name on one made of it, not on it: what it holds is not changed while it may be read)
    const wn = w(w(WORDS) + 8 * W_MISSING_NAME), asked = node(IS_NODE, 0, 0, on, on);
    bound(wn, wn + w(w(WORDS) + 8 * W_MISSING_NAME + 4), asked, node(IS_TEXT, s, e, w(TEXTS) || w(GLOBAL), 0));
    // (read apart from what asked it: what it reads in turn leaves the reading it is in as it was)
    const fault = w(t + T_FAULT), jn = w(t + T_JUMP_N), js = w(t + T_JUMP_S), jv = w(t + T_JUMP_V), on0 = w(t + T_ON), dc0 = w(t + T_DECL), ho0 = w(t + T_HOLE);
    const mw = w(t + T_MEMBER), ms = w(t + T_MEMBER_S), me = w(t + T_MEMBER_E), sc0 = w(t + T_SCRATCH), wr0 = w(t + T_WRITER), ws0 = w(t + T_WRITER_SELF), wa0 = w(t + T_WRITER_S), we0 = w(t + T_WRITER_E);
    put(t + 944, 1); put(t + T_JUMP_N, 0); put(t + T_DECL, 0); put(t + T_HOLE, 0); put(t + T_MEMBER, 0); put(t + T_WRITER, 0);
    const v = member_seen(t, on, wm, wl, asked, 0); put(t + 944, 0);
    const ok = !w(t + T_FAULT) && !w(t + T_JUMP_N);
    put(t + T_FAULT, fault || (w(t + T_FAULT) === L_DEEP || w(t + T_FAULT) === L_MEMORY || w(t + T_FAULT) === L_FULL ? w(t + T_FAULT) : 0)); put(t + T_JUMP_N, jn); put(t + T_JUMP_S, js); put(t + T_JUMP_V, jv); put(t + T_ON, on0); put(t + T_DECL, dc0); put(t + T_HOLE, ho0);
    put(t + T_MEMBER, mw); put(t + T_MEMBER_S, ms); put(t + T_MEMBER_E, me); put(t + T_SCRATCH, sc0); put(t + T_WRITER, wr0); put(t + T_WRITER_SELF, ws0); put(t + T_WRITER_S, wa0); put(t + T_WRITER_E, we0);
    if (!ok) return w(NOTHING);
    return v || w(NOTHING);
  }
  // (a type nd has under a name, written as one, led by a capital (`A := class …`); not any member, a method may read the name
  // again (`next` of `is_zero => next === None`); none, 0)
  // (and such a name read again where it is now, before that: one declared after the code naming it was read, `Anchored`
  // in Node.ray; none, 0)
  function read_again(t: number, s: number, n: number, names: number, self: number): number {
    if (n <= 0 || b(s) < 65 || b(s) > 90) return 0;
    const fr = names && w(names + N_IS) === IS_FRAME ? names : 0, rr = reading(t, s, s + n, fr ? w(fr + F_RULE) : 0, fr ? w(fr + F_CLOSURE) : 0, latest(self), self, 0, 0, 0, 0);
    // (a name given a place, what nothing defined yet where it was named (`Vector` in `distance (other: Vector)` in Vector's
    // block): not what it names, the classes it is written in are asked)
    const placed_ = w(rr) === K_RULE && w(w(rr + 12) + R_KIND) === VALUE && w(w(rr + 12) + R_BS) && w(w(w(rr + 12) + R_BS) + N_IS) === IS_PLACE && !place_value(t, w(w(rr + 12) + R_BS));
    if (w(rr) !== K_UNREAD && w(rr) !== K_EMPTY && !placed_) return rr;
    if (placed_) return 0;
    // (what a text or another value sees may not reach what is global: there too)
    const gr = self !== w(GLOBAL) ? reading(t, s, s + n, 0, 0, latest(w(GLOBAL)), w(GLOBAL), 0, 0, 0, 0) : 0;
    return gr && w(gr) !== K_UNREAD && w(gr) !== K_EMPTY ? gr : 0;
  }
  function valued_member(t: number, nd: number, s: number, n: number): number {
    return n > 0 && b(s) >= 65 && b(s) <= 90 ? member_seen(t, nd, s, n, nd, 0) : 0;
  }
  // (a type named in the classes a node is written in, the nearest first (`outer_block`, and so on out); none, 0)
  function outer_valued(t: number, nd: number, s: number, n: number): number {
    let sm = 0;
    for (let o = nd && w(nd + N_IS) === IS_NODE && nd !== w(GLOBAL) ? held(t, nd, W_OUTER_BLOCK, 0) : 0, k = 0; !sm && o && o !== w(NOTHING) && w(o + N_IS) === IS_NODE && k < 16; o = held(t, o, W_OUTER_BLOCK, 0), k++) sm = valued_member(t, o, s, n);
    return sm && w(sm + N_IS) !== IS_PLACE ? sm : 0;
  }
  // (a type named in what the code being read was written in, through the frames it was given along (each one's node, then
  // the classes that is written in); none, 0)
  function written_valued(t: number, names: number, self: number, written: number, s: number, n: number): number {
    // (where it was written first: a hole's code, read on another value, `it.({constraint})`)
    if (written && written !== self && written !== w(GLOBAL) && w(written + N_IS) === IS_NODE) { const v = valued_member(t, written, s, n) || outer_valued(t, written, s, n); if (v && v !== w(NOTHING) && w(v + N_IS) !== IS_PLACE) return v; }
    // (or the node the code being read whole was taken in, when the name is in it (`T_WRITER`))
    const wr = w(t + T_WRITER);
    if (wr && wr !== self && wr !== written && wr !== w(GLOBAL) && w(wr + N_IS) === IS_NODE && s >= w(t + T_WRITER_S) && s + n <= w(t + T_WRITER_E)) { const v = valued_member(t, wr, s, n) || outer_valued(t, wr, s, n); if (v && v !== w(NOTHING) && w(v + N_IS) !== IS_PLACE) return v; }
    // (each frame's closure, else what called it: a rule's frame is called by where its code was written)
    for (let fr = names, d = 0; fr && w(fr + N_IS) === IS_FRAME && d < 16; fr = w(fr + F_CLOSURE) || w(fr + F_CALLER), d++) {
      const ft = w(fr + F_THIS);
      if (ft && ft !== w(GLOBAL) && ft !== self && w(ft + N_IS) === IS_NODE) { const v = valued_member(t, ft, s, n) || outer_valued(t, ft, s, n); if (v && v !== w(NOTHING) && w(v + N_IS) !== IS_PLACE) return v; }
    }
    return 0;
  }
  // (a function called bare, its `this` none of its own (a node made in its call, given no receiver): the frame of the call
  // it was made in, the nearest, when that one was given one, `two := (a) => ((b) => this)` (the reading of its body is
  // shared, so not where that was read); else the frame itself)
  function called_in(fr: number): number {
    const lc = w(fr + F_THIS);
    if (!lc || w(lc + N_IS) !== IS_NODE || w(lc + N_B) !== fr || w(lc + N_ALSO) || w(fr + F_RECEIVER) !== lc) return fr;
    const fnc = w(lc + N_PARENT), mk = fnc && w(fnc + N_IS) === IS_NODE ? w(fnc + N_B) : 0;
    if (!(mk > 1 && w(mk + N_IS) === IS_FRAME)) return fr;
    for (let cf = w(mk + F_CALLER), up = 0; cf && w(cf + N_IS) === IS_FRAME && up < 16; cf = w(cf + F_CALLER), up++) {
      const ml = w(cf + F_THIS);
      if (!ml || w(ml + N_IS) !== IS_NODE || w(ml + N_B) !== cf) continue;
      return w(ml + N_ALSO) && run_node(ml) ? cf : fr;
    }
    return fr;
  }
  // (the frame `this` is read in, written in a function's body, inlined in its call (`{{body}}`): where the function was
  // written, the frame it was read from, out through the functions it is written in; not out of a method, read where its
  // class's constructor read the class's block) (not by where the `this` is: a reading is shared by every `this`)
  function written_this(fr: number, ts: number, te: number): number {
    for (let hp = 0; hp < 8; hp++) { const fru = w(fr + F_RULE), lit = fru ? w(fru + R_IN2_F) : 0; if (!lit || w(lit + N_IS) !== IS_FRAME || classed(w(fru + R_OWNER)) || (w(lit + F_RULE) && classed(w(w(lit + F_RULE) + R_OWNER)))) break; const wr_ = w(lit + F_CALLER); if (!wr_ || w(wr_ + N_IS) !== IS_FRAME || !w(wr_ + F_RULE)) break; fr = wr_; }
    return fr;
  }
  function member_seen(t: number, nd: number, s: number, n: number, on: number, depth: number): number {
    const r = rule_seen(t, nd, s, n, depth), hd = r ? w(r + R_HEAD) : 0;
    return r ? apply(t, r, 0, frame(0, 0, on, 0, 0, 0, 0, on, on), 0, on, w(hd + N_A), w(hd + N_B), on, on) : 0;
  }
  function made_of_deep(v: number, o: number, depth: number): number {
    if (!v || depth > 64 || v === w(GLOBAL)) return 0;
    if (v === o) return 1;
    const link = w(v + N_IS) === IS_NODE && !w(v + N_A) && !w(v + N_B) && latest(v) === w(v + N_BASE) && w(v + N_ALSO);
    return made_of_deep(w(v + N_ALSO), o, depth + 1) || (link ? made_of_deep(w(v + N_PARENT), o, depth + 1) : 0);
  }
  function reaches(v: number, o: number, depth: number): number {
    if (!v || depth > 8 || v === w(GLOBAL)) return 0;
    if (v === o) return 1;
    return reaches(w(v + N_ALSO), o, depth + 1) || reaches(w(v + N_PARENT), o, depth + 1);
  }
  // (a class: what defines `of` itself, the class its instances are of (its own rules: an instance sees its class's `of`))
  function classed(v: number): number {
    if (w(v + N_IS) !== IS_NODE || w(v + N_A) !== 0) return 0;
    for (let r = latest(v); r && r !== w(v + N_BASE) && !(w(r + R_FLAGS) & DEAD); r = w(r)) { const hd = w(r + R_HEAD); if (hd && !w(r + R_HOLES) && w(hd + N_B) - w(hd + N_A) === 2 && b(w(hd + N_A)) === 111 && b(w(hd + N_A) + 1) === 102) return 1; }
    return 0;
  }
  // (each character one byte)
  function ascii(a: number, z: number): number { for (let i = a; i < z; i++) if (b(i) >= 128) return 0; return 1; }
  // (where what ends at p began: a text in quotes, `"b"`, or what brackets enclose, `(x)`, `[x]`; p, none)
  function token_start(s: number, p: number): number {
    const c = b(p - 1);
    if (c === 34 || c === 96) { for (let q = p - 2; q >= s; q--) if (b(q) === c) return q; return p; }
    if (c === 41 || c === 93) { const o = c === 41 ? 40 : 91; let d = 0; for (let q = p - 1; q >= s; q--) { if (b(q) === c) d++; else if (b(q) === o && --d === 0) return q; } return p; }
    return p;
  }
  // (rule r's head has `//` written in it: a comment's)
  function comments(r: number): number { for (let k = 0; k < w(r + R_PARTS); k++) { const q = r + R_PART + PART * k; if ((w(q) & 15) === LITERAL && w(q + 8) >= 2 && b(w(q + 4)) === 47 && b(w(q + 4) + 1) === 47) return 1; } return 0; }
  // (rule h, led by a hole, then a word that leads statements of its own (`if`, `unless`), declared after rule l, led by text:
  // h binds looser, around what l reads (declaration order); a word leading none (`reads_closed`) or an operator does not)
  function guards(h: number, l: number): number {
    const fh = w(h + R_FLAGS), fl = w(l + R_FLAGS);
    if ((fh & (LED | METHOD | 1)) || !(fl & LED) || (fl & 1) || declared_at(h) <= declared_at(l) || (w(h + R_PART) & 15) !== HOLE) return 0;
    // (nor around a comment: no hole takes one)
    if (w(l + R_PART + 8) >= 2 && b(w(l + R_PART + 4)) === 47 && b(w(l + R_PART + 4) + 1) === 47) return 0;
    let k = 1; if ((w(h + R_PART + PART) & 15) === SPACE) k++;
    if (k >= w(h + R_PARTS)) return 0;
    const q = h + R_PART + PART * k, a = w(q + 4), n = w(q + 8);
    if ((w(q) & 15) !== LITERAL) return 0;
    for (let i = 0; i < n; i++) if (b(w(CLASSES) + b(a + i)) !== 1) return 0;
    // (a word that leads a rule led by text, where the language is)
    for (let r = latest(w(GLOBAL)); r && !(w(r + R_FLAGS) & DEAD); r = w(r)) if ((w(r + R_FLAGS) & LED) && w(r + R_PART + 8) === n && same(w(r + R_PART + 4), a, n) && (w(r + R_PARTS) === 1 || (w(r + R_PART + PART) & 15) === SPACE)) return 1;
    return 0;
  }
  // Counts: a Number the kernel holds as how many links it is (N_A, one more; a node otherwise has none there).
  // (on a place, its type as written: the code the hole named from s to e took, a text (`type_written`))
  function type_written_on(t: number, p: number, names: number, s: number, e: number) {
    while (e > s && b(e - 1) <= 32) e--;
    const hx = names ? named(w(names + F_RULE), s, e) : -1; if (hx < 0) return;
    const tk = follow(names + F_TAKES + TAKE * hx, 1); if (!tk) return;
    code(t, w(tk), w(tk + 4)); const ca = w(t + T_A), cz = w(t + T_B); if (ca >= cz) return;
    const ww = w(w(WORDS) + 8 * W_TYPE_WRITTEN);
    bound(ww, ww + w(w(WORDS) + 8 * W_TYPE_WRITTEN + 4), p, node(IS_TEXT, ca, cz, w(TEXTS) || w(GLOBAL), 0));
  }
  // (the text of x's characters, then y's: both texts; else nothing)
  function joined_text(x: number, y: number): number {
    if (!x || !y || w(x + N_IS) !== IS_TEXT || w(y + N_IS) !== IS_TEXT) return w(NOTHING);
    const xa = w(x + N_A), xn = w(x + N_B) - xa, ya = w(y + N_A), yn = w(y + N_B) - ya;
    if (!yn) return x;
    if (!xn) return y;
    const at = allocb(xn + yn);
    for (let i = 0; i < xn; i++) setb(at + i, b(xa + i));
    for (let i = 0; i < yn; i++) setb(at + xn + i, b(ya + i));
    return node(IS_TEXT, at, at + xn + yn, w(TEXTS) || w(GLOBAL), 0);
  }
  // (how many vertices a list links, from its head along each `next`, as Array's `count` walks them; not a list, nothing)
  // (a list's own member of a name, the rule giving it (the latest); none, 0)
  function own_value(nd: number, k: number): number {
    const ws = w(w(WORDS) + 8 * k), wn = w(w(WORDS) + 8 * k + 4);
    for (let r = latest(nd), n = 0; r && r !== w(nd + N_BASE) && n < 1 << 16; r = w(r), n++) { const hd = w(r + R_HEAD); if (w(r + R_KIND) === VALUE && !w(r + R_HOLES) && hd && !(w(r + R_FLAGS) & DEAD) && w(hd + N_B) - w(hd + N_A) === wn && same(w(hd + N_A), ws, wn)) return r; }
    return 0;
  }
  // (given a value: its own one, changed; none, one bound)
  function give(nd: number, k: number, v: number) {
    // (given again, as the language gives it, never changed where it is: what reads a node keeps it by its latest rule (the
    // memos), and what was made before a test is the test's own shadow of it)
    const ws = w(w(WORDS) + 8 * k); bound(ws, ws + w(w(WORDS) + 8 * k + 4), nd, v);
  }
  function own_of(nd: number, k: number): number { const r = own_value(nd, k); return r ? w(r + R_BS) : 0; }
  // (a link of a list: its value, none after or before it, no name it was written as)
  // (in what the list is in, as `Array.linked` makes it: in Array, not in what everything is)
  function link_of(v: number, cls: number): number {
    const l = node(IS_NODE, 0, 0, cls || w(GLOBAL), 0);
    give(l, W_VALUE, v); give(l, W_NEXT, w(NOTHING)); give(l, W_PREVIOUS, w(NOTHING)); give(l, W_WRITTEN_NAME, w(NOTHING));
    return l;
  }
  // (a list made: its own head and tail (none), a list, not spread; and its own copy of each rule every list is given (its
  // reading as a type, `{written}`), as the language gives each one: what a list read as a type reads with are its own rules)
  function arrayed_new(t: number, cls: number, reading: number): number {
    const n = node(IS_NODE, 0, 0, cls, 0);
    for (let r = reading ? latest(reading) : 0, k = 0; r && r !== w(reading + N_BASE) && k < 8; r = w(r), k++) {
      if (w(r + R_FLAGS) & DEAD) continue;
      // (its body read once, on the rule copied: each list's copy reads with it, not each one its own)
      if (w(r + R_KIND) === RULE && !w(r + R_BODY)) body(t, r);
      const size = R_PART + PART * w(r + R_PARTS), c = alloc(size);
      for (let i = 0; i < size; i += 4) put(c + i, w(r + i));
      const hd = w(r + R_HEAD);
      if (hd) put(c + R_HEAD, node(IS_HEAD, w(hd + N_A), w(hd + N_B), n, 0));
      put(c + R_OWNER, n); put(c + R_SKIP, 0);
      link(n, c);
    }
    give(n, W_HEAD, w(NOTHING)); give(n, W_TAIL, w(NOTHING)); give(n, W_LISTING, w(TRUE_)); give(n, W_SPREAD, w(FALSE_));
    put(w(n + N_BASE) + R_KIND, MEMBERS_MARK);
    return n;
  }
  function none_(v: number): number { return !v || v === w(NOTHING) ? 1 : 0; }
  function arrayed_append(list: number, v: number): number {
    const l = link_of(v, w(list + N_PARENT)), tl = own_of(list, W_TAIL);
    if (!none_(tl)) { give(l, W_PREVIOUS, tl); give(tl, W_NEXT, l); } else give(list, W_HEAD, l);
    give(list, W_TAIL, l);
    return l;
  }
  // (what it does: `new` (the class, the rules every list reads with), `append`/`prepend` (the list, a value), `listed` (a copy,
  // each link's name kept), `joined` (the list, another: each of the other's put after, its names kept; not a list, it))
  // (`external names L a b` / `external named_like L at`: as apply_ reads them)
  function names_given(t: number, a: number, m: number, rest: number, z: number, names: number, f: number, self: number): number {
    let q = rest; while (q < z && b(q) > 32) q++;
    const list = block(t, rest, q, names, f, self, 0, 1, 0, self, 0); if (!list || stopped(t)) return list;
    let q2 = skip(q, z), e2 = q2; while (e2 < z && b(e2) > 32) e2++;
    const wn = w(w(WORDS) + 8 * W_WRITTEN_NAME), wz = wn + w(w(WORDS) + 8 * W_WRITTEN_NAME + 4);
    if (word(a, m, W_NAMED_LIKE)) {
      const from = block(t, q2, e2, names, f, self, 0, 1, 0, self, 0), was = from && w(from + N_IS) === IS_NODE ? held(t, from, W_WRITTEN_NAME, 0) : 0;
      if (was && was !== w(NOTHING)) {
        const lk = held(t, list, W_TAIL, 0), tw = w(w(WORDS) + 8 * W_TYPE_WRITTEN), ty = held(t, from, W_TYPE_WRITTEN, 0);
        if (lk && lk !== w(NOTHING)) { bound(wn, wz, lk, was); if (ty && ty !== w(NOTHING)) bound(tw, tw + w(w(WORDS) + 8 * W_TYPE_WRITTEN + 4), lk, ty); }
      }
      return list;
    }
    let q3 = skip(e2, z), e3 = q3; while (e3 < z && b(e3) > 32) e3++;
    const first = hole_name(names, q2, e2), last_ = hole_name(names, q3, e3);
    // (and the type each is written with, `a: T`: T's text, `type_written`)
    const tw = w(w(WORDS) + 8 * W_TYPE_WRITTEN), twz = tw + w(w(WORDS) + 8 * W_TYPE_WRITTEN + 4), ty1 = first ? hole_type(names, q2, e2) : 0, ty2 = last_ ? hole_type(names, q3, e3) : 0;
    // (and what a position `{x: f}: T` maps what it reads by, f)
    const wm = w(w(WORDS) + 8 * W_MAPPED_BY), wmz = wm + w(w(WORDS) + 8 * W_MAPPED_BY + 4), mf1 = first ? hole_mapping(names, q2, e2) : 0, mf2 = last_ ? hole_mapping(names, q3, e3) : 0;
    if (first) { const l1 = held(t, list, W_HEAD, 0); if (l1 && l1 !== w(NOTHING)) { bound(wn, wz, l1, first); if (ty1) bound(tw, twz, l1, ty1); if (mf1) bound(wm, wmz, l1, mf1); } }
    if (last_) { const l2 = held(t, list, W_TAIL, 0); if (l2 && l2 !== w(NOTHING)) { bound(wn, wz, l2, last_); if (ty2) bound(tw, twz, l2, ty2); if (mf2) bound(wm, wmz, l2, mf2); } }
    return list;
  }
  // (`arrayed op a b …`: op as written, each argument read (one in brackets whole), up to four)
  function arrayed_read(t: number, rest: number, z: number, names: number, f: number, self: number): number {
    let oq = rest; while (oq < z && b(oq) > 32) oq++;
    const args = alloc(16); let an = 0;
    for (let p = skip(oq, z); p < z && an < 4; p = skip(p, z)) { let q = p, d = 0; while (q < z && (d > 0 || b(q) > 32)) { const c = b(q); if (c === 40) d++; else if (c === 41) d--; q++; } const v = block(t, p, q, names, f, self, 0, 1, 0, self, 0); if (stopped(t)) return 0; put(args + 4 * an, v); an++; p = q; }
    return arrayed(t, rest, oq, args, an);
  }
  function arrayed(t: number, os: number, oe: number, args: number, an: number): number {
    const x = w(args), y = an > 1 ? w(args + 4) : 0;
    // (which, by its first letter and length: new, append, prepend, listed, joined)
    const c0 = b(os), ln = oe - os, is_reading = c0 === 114 && ln === 7 ? 1 : 0, is_new = c0 === 110 && ln === 3 ? 1 : 0, is_append = c0 === 97 && ln === 6 ? 1 : 0, is_prepend = c0 === 112 && ln === 7 ? 1 : 0, is_listed = c0 === 108 && ln === 6 ? 1 : 0, is_joined = c0 === 106 && ln === 6 ? 1 : 0;
    // (`reading r`: the rules every list is given, kept once for all (the map gives them when it is read))
    if (is_reading) { if (x && w(x + N_IS) === IS_NODE) put(LIST_READING, x); return w(NOTHING); }
    if (is_new) return x ? arrayed_new(t, x, w(LIST_READING)) : w(NOTHING);
    // (not a list whose head is its own: nothing, the language's way then)
    if (!x || w(x + N_IS) !== IS_NODE || !(own_value(x, W_TAIL) || own_value(x, W_HEAD))) return w(NOTHING);
    if (is_append) { arrayed_append(x, y); return x; }
    if (is_prepend) {
      const l = link_of(y, w(x + N_PARENT)), hd = own_of(x, W_HEAD);
      if (!none_(hd)) { give(hd, W_PREVIOUS, l); give(l, W_NEXT, hd); } else give(x, W_TAIL, l);
      give(x, W_HEAD, l);
      return x;
    }
    if (is_listed || is_joined) {
      const into = is_listed ? arrayed_new(t, w(x + N_PARENT), w(LIST_READING)) : x;
      const from = is_listed ? x : y;
      if (!from || w(from + N_IS) !== IS_NODE || !own_value(from, W_HEAD)) { if (is_joined && !(y && w(y + N_IS) === IS_NODE && listed(t, y))) { arrayed_append(x, y); return x; } return w(NOTHING); }
      // (the links to copy counted first: a list joined with itself takes what it held before)
      let n = 0; for (let at = own_of(from, W_HEAD); !none_(at) && n < 1 << 20; at = own_of(at, W_NEXT)) n++;
      for (let at = own_of(from, W_HEAD), k = 0; !none_(at) && k < n; at = own_of(at, W_NEXT), k++) { const l = arrayed_append(into, own_of(at, W_VALUE)); const wn = own_of(at, W_WRITTEN_NAME); if (!none_(wn)) give(l, W_WRITTEN_NAME, wn); }
      return into;
    }
    return w(NOTHING);
  }
  function linked_count(t: number, x: number): number {
    if (!x || w(x + N_IS) !== IS_NODE || !listed(t, x)) return w(NOTHING);
    let n = 0;
    let v = held(t, x, W_HEAD, 0);
    // (no head it holds (one a method answers): the language's walk)
    if (!v) return w(NOTHING);
    while (v && v !== w(NOTHING) && w(v + N_IS) === IS_NODE && n < 1048576) {
      n++;
      v = member(t, v, w(w(WORDS) + 8 * W_NEXT), w(w(WORDS) + 8 * W_NEXT + 4));
    }
    if (n >= 1048576) return w(NOTHING);
    return counted(n);
  }
  function counted(c: number): number { return node(IS_NODE, c + 1, 0, w(COUNTED) || w(NUMBERS), 0); }
  // (how many a Number is: a count's; one written by the language, `Number(next: x)`, its own `next` counted on, down to None;
  // anything else (not made of Number, or too long), -1)
  function count_of(t: number, x: number, names: number, f: number): number {
    let c = 0;
    for (let n = 0; n < 64; n++) {
      if (!x || w(x + N_IS) !== IS_NODE) return -1;
      if (w(x + N_A) > 0) return w(x + N_A) - 1 + c;
      if (!numbered_node(x, 0)) return -1;
      // (its own `next`, what it was given, read)
      let own = 0;
      for (let r = latest(x); r && !(w(r + R_FLAGS) & DEAD); r = w(r)) { const hd = w(r + R_HEAD); if (hd && !w(r + R_HOLES) && w(hd + N_B) - w(hd + N_A) === 4 && same(w(hd + N_A), w(w(WORDS) + 8 * W_NEXT), 4)) { own = r; break; } }
      // (none of its own: the `next` it sees, what it is made of or in (Ray's: none past its end), asked; reading nothing,
      // or none at all (`Number()`), it is zero after c)
      if (!own) { const nr = nexted(x, 0); if (!nr) return c; if (numbered_node(w(nr + R_OWNER), 0)) return -1; const nv = member_seen(t, x, w(w(WORDS) + 8 * W_NEXT), 4, x, 0); if (stopped(t)) return -1; return !nv || nv === w(NOTHING) ? c : -1; }
      const hd = w(own + R_HEAD), v = apply(t, own, 0, names, f, x, w(hd + N_A), w(hd + N_B), x, 0);
      if (stopped(t)) return -1;
      if (!v || v === w(NOTHING)) return c;
      c++; x = v;
    }
    return -1;
  }
  // (the `next` (of no holes) defined in what x is, is made of or is in, short of the global scope: its rule, or 0)
  function nexted(x: number, depth: number): number {
    if (!x || depth > 8 || x === w(GLOBAL)) return 0;
    for (let r = latest(x); r && r !== w(x + N_BASE); r = w(r)) { const hd = w(r + R_HEAD); if (hd && !w(r + R_HOLES) && w(hd + N_B) - w(hd + N_A) === 4 && same(w(hd + N_A), w(w(WORDS) + 8 * W_NEXT), 4)) return r; }
    return nexted(w(x + N_ALSO), depth + 1) || nexted(w(x + N_PARENT), depth + 1);
  }
  // (made of Number: through what it is in and made of, near)
  function numbered_node(x: number, depth: number): number {
    if (!x || depth > 8 || x === w(GLOBAL)) return 0;
    if (x === w(NUMBERS)) return 1;
    return numbered_node(w(x + N_ALSO), depth + 1) || numbered_node(w(x + N_PARENT), depth + 1);
  }
  function numeral_of(a: number, z: number): number {
    a = skip(a, z); while (z > a && b(z - 1) <= 32) z--;
    // (in sixteen, `0x0C`: below 2^31)
    if (z - a >= 3 && b(a) === 48 && (b(a + 1) === 120 || b(a + 1) === 88)) {
      if (z - a > 10 || (z - a === 10 && b(a + 2) > 55)) return -1;
      let h = 0; for (let i = a + 2; i < z; i++) { const c = b(i), d = c >= 48 && c <= 57 ? c - 48 : c >= 97 && c <= 102 ? c - 87 : c >= 65 && c <= 70 ? c - 55 : -1; if (d < 0) return -1; h = h * 16 + d; }
      return h;
    }
    if (a >= z || z - a > 9) return -1;
    let c = 0; for (let i = a; i < z; i++) { const d = b(i) - 48; if (d < 0 || d > 9) return -1; c = c * 10 + d; }
    return c;
  }
  // (a head the kernel's map names as a numeral's, `numeral `{head}``: one of two)
  function numeral_head(hs: number, hn: number): number {
    if (w(NUMERAL_AT) && hn === w(NUMERAL_AT + 4) && same(hs, w(NUMERAL_AT), hn)) return 1;
    const second = w(NUMERAL_AT2); return second && hn === w(second + 4) && same(hs, w(second), hn) ? 1 : 0;
  }
  // (rule r, Number's own, one of those the kernel's map names (`number succ == < + …`): the name's first character (`succ`:
  // `s`, `==`: `=`); else 0)
  function number_op(r: number): number {
    if (!w(NUMBER_OPS) || !r) return 0;
    const hd = w(r + R_HEAD); if (!hd) return 0;
    const ha = w(hd + N_A), hn = w(hd + N_B) - ha, l = w(NUMBER_OPS), le = l + w(NUMBER_OPS + 4);
    // (the one equality, Node's: answered so too, on counts (and texts, by their characters))
    if (w(r + R_OWNER) === w(SUPER_NODE) && w(SUPER_NODE) && hn === 2 && b(ha) === 61 && b(ha + 1) === 61) return 61;
    if (w(r + R_OWNER) !== w(NUMBERS)) return 0;
    for (let p = l; p < le;) { while (p < le && b(p) <= 32) p++; let q = p; while (q < le && b(q) > 32) q++; if (q - p === hn && same(p, ha, hn)) return b(ha); p = q; }
    return 0;
  }
  // (what an operator answers on two counts, as the language's rules do; -1, nothing it answers)
  function number_answer(op: number, cx: number, cy: number): number {
    if (op === 43) return cx + cy < 0x7FFFFFFE ? counted(cx + cy) : -1;
    if (op === 45) return counted(cx > cy ? cx - cy : 0);
    if (op === 42) return cy === 0 || cx <= 0x7FFFFFFE / cy ? counted(cx * cy) : -1;
    if (op === 47) return counted(cy === 0 || cx < cy ? 0 : (cx / cy) | 0);
    if (op === 37) return counted(cy === 0 || cx < cy ? cx : cx % cy);
    if (op === 60) return w(TRUE_) && w(FALSE_) ? (cx < cy ? w(TRUE_) : w(FALSE_)) : -1;
    if (op === 61) return w(TRUE_) && w(FALSE_) ? (cx === cy ? w(TRUE_) : w(FALSE_)) : -1;
    return -1;
  }
  // (an i32's bits: its 32 binary digits as written, the most significant first (a Binary's `integer`, `Binary₃₂`, the first
  // the sign's); or a count, how many it is)
  function int32(v: number): number { const at = allocb(32); for (let i = 0; i < 32; i++) setb(at + i, (v >>> (31 - i)) & 1 ? 49 : 48); return node(IS_TEXT, at, at + 32, w(TEXTS) || w(GLOBAL), 0); }
  function int32_is(x: number): number {
    if (!x) return 0;
    if (w(x + N_IS) === IS_NODE) return w(x + N_A) > 0 ? 1 : 0;
    if (w(x + N_IS) !== IS_TEXT || w(x + N_B) - w(x + N_A) !== 32) return 0;
    for (let i = w(x + N_A); i < w(x + N_B); i++) if (b(i) !== 48 && b(i) !== 49) return 0;
    return 1;
  }
  function int32_value(x: number): number { if (w(x + N_IS) === IS_NODE) return w(x + N_A) - 1; let v = 0; for (let i = w(x + N_A); i < w(x + N_B); i++) v = (v << 1) | (b(i) - 48); return v; }
  // (what WebAssembly's i32 instruction answers of x and y, named as written from a, n long: `plus minus times over rem` (over and
  // rem toward zero; by zero, nothing), `and or xor`, `shl shr shru` (the shift taken of 32), `eq ne lt le gt ge` (true or false))
  function int32_answer(a: number, n: number, x: number, y: number): number {
    if (n === 4 && b(a + 0) === 112 && b(a + 1) === 108 && b(a + 2) === 117 && b(a + 3) === 115) return int32((x + y) | 0);
    if (n === 5 && b(a + 0) === 109 && b(a + 1) === 105 && b(a + 2) === 110 && b(a + 3) === 117 && b(a + 4) === 115) return int32((x - y) | 0);
    if (n === 5 && b(a + 0) === 116 && b(a + 1) === 105 && b(a + 2) === 109 && b(a + 3) === 101 && b(a + 4) === 115) return int32((x * y) | 0);
    if (n === 4 && b(a + 0) === 111 && b(a + 1) === 118 && b(a + 2) === 101 && b(a + 3) === 114) return y === 0 ? w(NOTHING) : int32((x / y) | 0);
    if (n === 3 && b(a + 0) === 114 && b(a + 1) === 101 && b(a + 2) === 109) return y === 0 ? w(NOTHING) : int32((x % y) | 0);
    if (n === 3 && b(a + 0) === 97 && b(a + 1) === 110 && b(a + 2) === 100) return int32(x & y);
    if (n === 2 && b(a + 0) === 111 && b(a + 1) === 114) return int32(x | y);
    if (n === 3 && b(a + 0) === 120 && b(a + 1) === 111 && b(a + 2) === 114) return int32(x ^ y);
    if (n === 3 && b(a + 0) === 115 && b(a + 1) === 104 && b(a + 2) === 108) return int32(x << y);
    if (n === 3 && b(a + 0) === 115 && b(a + 1) === 104 && b(a + 2) === 114) return int32(x >> y);
    if (n === 4 && b(a + 0) === 115 && b(a + 1) === 104 && b(a + 2) === 114 && b(a + 3) === 117) return int32((x >>> y) | 0);
    if (n === 2 && b(a + 0) === 101 && b(a + 1) === 113) return x === y ? w(TRUE_) : w(FALSE_);
    if (n === 2 && b(a + 0) === 110 && b(a + 1) === 101) return x !== y ? w(TRUE_) : w(FALSE_);
    if (n === 2 && b(a + 0) === 108 && b(a + 1) === 116) return x < y ? w(TRUE_) : w(FALSE_);
    if (n === 2 && b(a + 0) === 108 && b(a + 1) === 101) return x <= y ? w(TRUE_) : w(FALSE_);
    if (n === 2 && b(a + 0) === 103 && b(a + 1) === 116) return x > y ? w(TRUE_) : w(FALSE_);
    if (n === 2 && b(a + 0) === 103 && b(a + 1) === 101) return x >= y ? w(TRUE_) : w(FALSE_);
    return w(NOTHING);
  }
  // (an i32 as its digits in ten, `-` before them below zero: taken from the last digit, so the least needs no positive)
  function int32_text(v: number): number {
    const at = allocb(12), e = at + 11; let r = v, p = e;
    do { const d = r % 10; setb(p, 48 + (d < 0 ? 0 - d : d)); p--; r = (r / 10) | 0; } while (r !== 0);
    if (v < 0) { setb(p, 45); p--; }
    return node(IS_TEXT, p + 1, e + 1, w(TEXTS) || w(GLOBAL), 0);
  }
  // (a numeral as JavaScript reads one and `| 0` keeps it: digits in ten, an exponent after `e`, or digits in sixteen after `0x`;
  // what is past 32 bits wraps)
  function int32_numeral(s: number, e: number): number {
    let v = 0, p = s;
    if (e - s > 2 && b(s) === 48 && (b(s + 1) | 32) === 120) { for (p = s + 2; p < e; p++) { const c = b(p) | 32; v = ((v << 4) + (c >= 97 ? c - 87 : c - 48)) | 0; } return v; }
    while (p < e && b(p) >= 48 && b(p) <= 57) { v = (v * 10 + b(p) - 48) | 0; p++; }
    if (p < e && (b(p) | 32) === 101) { let x = 0; for (p++; p < e; p++) x = x * 10 + b(p) - 48; while (x-- > 0) v = (v * 10) | 0; }
    return v;
  }
  // (the characters from `at` to `end`, as bits: which of 32 kinds each is)
  function bytes(at: number, end: number) { let m = 0; for (; at < end; at++) m |= 1 << (b(at) & 31); return m; }
  // (one led by a hole: its texts written from `at` to `end`, one after another, or it can't read it)
  function written(r: number, at: number, end: number) {
    for (let k = 0; k < w(r + R_PARTS); k++) {
      const q = r + R_PART + PART * k;
      if ((w(q) & 15) !== LITERAL) continue;
      const a = w(q + 4), n = w(q + 8), c = b(a);
      let p = at;
      while (p + n <= end && !(b(p) === c && same(p, a, n))) p++;
      if (p + n > end) return 0;
      at = p + n;
    }
    return 1;
  }
  // A head written from `at` to `end`, into rule `out`'s parts: literal text, spaces, holes. Its holes, how many.
  function parts(at: number, end: number, out: number) {
    let k = 0, h = 0;
    const hole = w(OPEN_LENGTH) * 8 + 5;
    while (at < end) {
      const q = out + R_PART + PART * k;
      k++; put(q + 16, 0); put(q + 20, 0);
      if (bracket(at, end) === hole) {
        const e = past(at, end);
        // (one with nothing in it: the space it holds, there)
        if (skip(at + w(OPEN_LENGTH), e - w(CLOSE_LENGTH)) >= e - w(CLOSE_LENGTH)) { put(q, SPACE | HUG); at = e; continue; }
        put(q, HOLE); at += w(OPEN_LENGTH); put(q + 4, at); put(q + 8, e - w(CLOSE_LENGTH) - at); put(q + 12, h); h++;
        at = e; continue;
      }
      if (b(at) <= 32) { put(q, SPACE); while (at < end && b(at) <= 32) at++; continue; }
      put(q, LITERAL); put(q + 4, at);
      at++;
      while (at < end && b(at) > 32 && bracket(at, end) !== hole) at++;
      put(q + 8, at - w(q + 4));
    }
    put(out + R_PARTS, k); put(out + R_HOLES, h);
    return h;
  }

  // The separator (`=>`) in it, nothing open around it: only a rule with it in its head reads it (a definition).
  // (a statement of a class's block that is the class's, read once: a definition (`=>`), `static …`, `assert …`, a class or an
  // enum named (`X := class …`))
  function hoisted(s: number, e: number) {
    if (defines(s, e)) return 1;
    if (word_at(s, e, 115, 116, 97, 116, 105, 99) || word_at(s, e, 97, 115, 115, 101, 114, 116)) return 1;
    // (names given together, `initial | (internal ⊢) : Boundary = …`: the class's shape)
    { let v = s; while (v < e && b(w(CLASSES) + b(v)) === 1) v++; if (v > s && v + 2 < e && b(v) === 32 && b(v + 1) === 124 && b(v + 2) === 32) return 1; }
    for (let at = s; at + 1 < e;) {
      if (b(at) === 58 && b(at + 1) === 61) { let v = at + 2; while (v < e && b(v) <= 32) v++; return word_at(v, e, 99, 108, 97, 115, 115, 0) || (v + 6 <= e && b(v) === 99 && b(v + 1) === 108 && b(v + 2) === 97 && b(v + 3) === 115 && b(v + 4) === 115 && b(v + 5) === 58) || word_at(v, e, 101, 110, 117, 109, 0, 0) ? 1 : 0; }
      at = bracket(at, e) & 1 ? past(at, e) : at + 1;
    }
    return 0;
  }
  // (a statement giving a name its default, `x: T = v`, `x := v`, `x: T`, the name already given in what it is read in (by name,
  // when it was made): passed over)
  function given_here(self: number, s: number, e: number) {
    let v = s; while (v < e && b(w(CLASSES) + b(v)) === 1) v++;
    if (v === s || v >= e || !(b(v) === 58 || (b(v) === 32 && v + 2 < e && b(v + 1) === 58 && b(v + 2) === 61))) return 0;
    for (let fr = latest(self), k = 0; fr && fr !== w(self + N_BASE) && !(w(fr + R_FLAGS) & DEAD) && k < 256; fr = w(fr), k++) { const fh = w(fr + R_HEAD); if (!w(fr + R_HOLES) && fh && trimmed(w(fh + N_A), w(fh + N_B) - w(fh + N_A), s, v)) return 1; }
    return 0;
  }
  // (TODO(explicit): a definition read bare in the block it is written in, a position's type, `r: (f (x) => …, f(1))` (its
  // locals, the body it is written in): the `( … )` after a `:` around its head, which holds where it is read)
  function same_block(hd: number, at: number) {
    if (!hd || w(hd + N_IS) !== IS_HEAD && w(hd + N_IS) !== IS_TEXT) return 0;
    const h = w(hd + N_A); if (!h || at <= h) return 0;
    let depth = 0, open = 0;
    for (let p = h - 1, k = 0; p > 0 && k < 65536; p--, k++) { const c = b(p); if (c === 41 || c === 93 || c === 125) depth++; else if (c === 40 || c === 91 || c === 123) { if (depth === 0) { open = c === 40 ? p : 0; break; } depth--; } }
    if (!open) return 0;
    // (a header: after `:`, after a word with a space between, `class (a = 1, b = a)`, or a statement of a block, what a class
    // made reads its fields as (`{ ({{fields}}) taking … }`))
    { let q = open - 1; while (q > 0 && b(q) <= 32) q--; if (b(q) !== 58 && b(q) !== 123 && !(q < open - 1 && b(w(CLASSES) + b(q)) === 1)) return 0; }
    depth = 0;
    for (let p = open, k = 0; k < 65536; p++, k++) { const c = b(p); if (c === 40 || c === 91 || c === 123) depth++; else if (c === 41 || c === 93 || c === 125) { depth--; if (depth === 0) return at < p ? 1 : 0; } }
    return 0;
  }
  // (a word of up to six letters (0 after the last) at s, then a space or the end)
  function word_at(s: number, e: number, c0: number, c1: number, c2: number, c3: number, c4: number, c5: number) {
    const n = c5 ? 6 : c4 ? 5 : c3 ? 4 : 3;
    if (s + n > e) return 0;
    if (b(s) !== c0 || b(s + 1) !== c1 || b(s + 2) !== c2 || (n > 3 && b(s + 3) !== c3) || (n > 4 && b(s + 4) !== c4) || (n > 5 && b(s + 5) !== c5)) return 0;
    return s + n === e || b(s + n) <= 32 ? 1 : 0;
  }
  function defines(s: number, e: number) {
    const sep = w(SEPARATOR), n = w(SEPARATOR_LENGTH);
    for (let at = s; at < e;) { if (at + n <= e && same(at, sep, n)) return 1; at = bracket(at, e) & 1 ? past(at, e) : at + 1; }
    return 0;
  }
  // `{name}` (or, `bracketed` 0, `name`) written from s to e: the hole it names, (how many frames out << 16 | which) + 1; or 0.
  function ref(rule: number, f: number, s: number, e: number, bracketed: number) {
    while (e > s && b(e - 1) <= 32) e--; while (s < e && b(s) <= 32) s++;
    const open = w(OPEN_LENGTH), close = w(CLOSE_LENGTH);
    if (bracketed) { if (e - s <= open + close || bracket(s, e) !== 5 + 8 * open || past(s, e) !== e) return 0; s += open; e -= close; }
    for (let depth = 0; rule; depth++) {
      const i = named(rule, s, e);
      if (i >= 0) return (depth << 16 | i) + 1;
      rule = f ? w(f + F_RULE) : 0; f = f ? w(f + F_CLOSURE) : 0;
    }
    return 0;
  }
  // (as ref, for what `names` (a frame of `rule`) reads: in what its rule inlined (`{{x}}`), the rule's own holes, then the names
  // of where that was written; the frame to take from at T_REFF)
  function refer(names: number, rule: number, closure: number, s: number, e: number, bracketed: number) {
    while (e > s && b(e - 1) <= 32) e--; while (s < e && b(s) <= 32) s++;
    const open = w(OPEN_LENGTH), close = w(CLOSE_LENGTH);
    let a = s, z = e;
    if (bracketed) { if (e - s <= open + close || bracket(s, e) !== 5 + 8 * open || past(s, e) !== e) return 0; a += open; z -= close; }
    let base = names, depth = 0;
    for (let n = 0; rule && n < 256; n++) {
      if (DEBUG && (w(rule + R_PARTS) < 0 || w(rule + R_PARTS) > 64 || (w(rule + R_PARTS) && (w(rule + R_PART + 4) < 0 || w(rule + R_PART + 8) < 0 || w(rule + R_PART + 8) > 1 << 20)))) { debug(D_FAULT, 1100, base, rule); return 0; }
      const i = named(rule, a, z);
      if (i >= 0) { set(THREAD + T_REFF, base); return (depth << 16 | i) + 1; }
      // (written in what this rule inlined: on from where that was written)
      if (w(rule + R_INL_F) && s >= w(rule + R_INL_S) && e <= w(rule + R_INL_E)) { if (DEBUG && w(w(rule + R_INL_F) + N_IS) !== IS_FRAME) { debug(D_FAULT, 1101, w(rule + R_INL_F), rule); return 0; } base = w(rule + R_INL_F); depth = 0; rule = w(base + F_RULE); closure = w(base + F_CLOSURE); continue; }
      if (w(rule + R_IN2_F) && s >= w(rule + R_IN2_S) && e <= w(rule + R_IN2_E)) { if (DEBUG && w(w(rule + R_IN2_F) + N_IS) !== IS_FRAME) { debug(D_FAULT, 1101, w(rule + R_IN2_F), rule); return 0; } base = w(rule + R_IN2_F); depth = 0; rule = w(base + F_RULE); closure = w(base + F_CLOSURE); continue; }
      if (DEBUG && closure && w(closure + N_IS) !== IS_FRAME) { debug(D_FAULT, 1101, closure, rule); return 0; }
      rule = closure ? w(closure + F_RULE) : 0; closure = closure ? w(closure + F_CLOSURE) : 0; depth++;
    }
    return 0;
  }
  // (the hole of `rule` written as the text from s to e: which, or -1)
  function named(rule: number, s: number, e: number) {
    for (let k = 0; k < w(rule + R_PARTS); k++) { const q = rule + R_PART + PART * k; if ((w(q) & 15) === HOLE && trimmed(w(q + 4), w(q + 8), s, e)) return w(q + 12); }
    return -1;
  }
  // Text taken as code: in brackets, what is inside them (at T_A, T_B).
  function code(t: number, s: number, e: number) {
    s = skip(s, e); while (e > s && b(e - 1) <= 32) e--;
    if (bracket(s, e) === 5 + 8 * w(OPEN_LENGTH) && past(s, e) === e) { s += w(OPEN_LENGTH); e -= w(CLOSE_LENGTH); }
    put(t + T_A, s); put(t + T_B, e);
  }

  // Text from s to e read (`Statements`'s statement): with the names of `rule` (and the frames it was defined in, from
  // `closure`), with the rules from `vis` on (to `stop`), in `self`; `on`: what follows a value, read on it.
  function reading(t: number, s: number, e: number, rule: number, closure: number, vis: number, self: number, want: number, stop: number, refuse: number, on: number): number {
    s = skip(s, e); while (e > s && b(e - 1) <= 32) e--;
    if (DEBUG) count(K_READING);
    // (what a hole being declared reads, the names in it: no reader reads them)
    if (w(t + T_HOLE)) refuse |= READER;
    // (read once: the same text, with the same rules and names, is the same reading; not one in a frame, nor one nothing read)
    // (read in a check, quietly: what it checks in turn is not read (TYPINGS), so a reading of its own)
    const flags = want | refuse << 8 | on << 16 | (w(THREAD + T_QUIET) >= TYPINGS ? 1 << 24 : 0), framed = s < e && w(self + N_IS) === IS_FRAME;
    // (what is visible from a node with no rules of its own, nor made of anything: what its parent sees; read once for all such)
    // (not a member read (VALUE_OWN): where a value was made is not what it holds)
    for (let n = 0; n < 16 && !(refuse & VALUE_OWN) && vis && (w(vis + R_FLAGS) & DEAD) && vis !== stop; n++) {
      const o = w(vis + R_OWNER);
      if (!o || w(o + N_ALSO) || !w(o + N_PARENT) || w(o + N_IS) === IS_FRAME) break;
      vis = latest(w(o + N_PARENT));
    }
    let slot = 0, gslot = 0;
    // (with shadows, a test's or a file's own: read once in that one, by where it began)
    // (under shadows, a test's or a file's own: read once while they are as they are)
    // (exactly: these shadows (whose, as changed how often, how many), none: 0)
    // (in a test: its own, this thread's (another's may read it; what it keeps is its own memory))
    const sh = w(THREAD + T_REG_AT) ? 0 : w(THREAD + T_SH_N) ? w(THREAD + T_SH) : 0, gen = sh ? w(THREAD + T_SHGEN) : 0, shn = sh ? w(THREAD + T_SH_N) : 0;
    // (and as what it sees is: the last rule of every node it sees past the first, as they are now)
    // (in a frame with no rules of its own: what it reads there is what its rule names, and what it sees; read once for all of
    // that rule's frames that see the same)
    const bare = framed && latest(self) === w(self + N_BASE) ? 1 : 0;
    // (not while a rule is kept from reading itself: that reading is its own)
    // (in a test: what it made itself kept as what it is written as, the rest as itself)
    const reg = w(THREAD + T_REG_AT) ? 1 : 0, keeps = (!framed || bare) && w(MEMO) && !w(THREAD + T_SKIP), at_ = reg ? kept_as(vis) : vis, named_by = bare ? (reg ? kept_as(w(self + F_RULE)) : w(self + F_RULE)) | 1 : 0;
    // (read without some rules, the other reading of one: kept as one of those, by which rules it is without)
    const sees = keeps ? seen(vis, stop, t) : 0, names_k = reg ? names_as(rule, closure) : rule, closure_k = (reg ? 0 : closure) ^ skips_key();
    // (the readings kept for all made larger only by what tests keep there: what is read outside them is let go of when the
    // files are merged, and what a test reads again is what pays for them)
    // (in a test: what it kept, in this thread's own table, first (what other threads keep never changes what it finds), then
    // what was kept for all before the tests)
    if (keeps) {
      const own = w(THREAD + T_REG_AT) ? w(THREAD + T_OMEMO) : 0, h0 = mix(s * 31 + at_ * 17 + names_k * 13 + e + gen * 7 + sees + named_by * 3);
      for (let pass = own ? 0 : 1; pass < 2; pass++) {
        let tab = pass ? w(MEMO) : own, first = 1;
        while (tab) {
          const mask = pass ? w(tab - 12) : OMEMO_MASK;
          for (let h = h0 & mask, n = 0; n < 32; n++, h = (h + 1) & mask) {
            const m = tab + MEMO_ENTRY * h, at = aload(m);
            if (!at) { if (first) { if (pass ? !own : 1) slot = m; if (pass) gslot = m; } break; }
            if (at === s && w(m + 4) === e && w(m + 8) === at_ && w(m + 12) === names_k && w(m + 16) === closure_k && w(m + 20) === flags && w(m + 24) === stop && w(m + 32) === sh && w(m + 36) === gen && w(m + 40) === shn && w(m + 44) === sees && w(m + 48) === named_by) { const kept = aload(m + 28); if (kept && (w(t + T_BUDGET) < w(m + 52) || w(t + T_QBUDGET) < w(m + 56))) break; if (kept) { set(t + T_BUDGET, w(t + T_BUDGET) - w(m + 52)); set(t + T_QBUDGET, w(t + T_QBUDGET) - w(m + 56)); if (DEBUG && (w(FAIL_FAST) & 4)) { const fresh = remembered(t, s, e, rule, closure, vis, self, want, stop, refuse, on); if (!alike_reading(fresh, kept)) { debug(D_FAULT, 88, s, e); debug(D_FAULT, 82, w(kept) * 1000 + w(fresh), w(kept + 12) === w(fresh + 12) ? 1 : 0); for (let i = 0; i < 2; i++) { const x = i ? fresh : kept; if (w(x) === K_RULE) { const hd = w(w(x + 12) + R_HEAD), ow = w(w(x + 12) + R_OWNER); if (hd) debug(D_FAULT, i ? 84 : 85, w(hd + N_A), w(hd + N_B)); debug(D_FAULT, 83, ow * 10 + w(w(x + 12) + R_KIND), in_region(w(x + 12)) ? 1 : 0); } } } if (w(kept) !== w(fresh)) debug(D_FAULT, 86, s, e); } return reg ? relit(kept, vis) : kept; } break; }
          }
          tab = pass ? w(tab - 8) : 0; first = 0;
        }
      }
    }
    if (DEBUG) { count(K_AFRESH); if (framed && !bare) count(K_FRAMED); else if (w(THREAD + T_SH_N)) count(K_SHADOWED); }
    // (not one a cycle cut short: read as far as that check went, it is not the reading)
    const cut = w(THREAD + T_CUT); set(THREAD + T_CUT, 0);
    // (and what reading it cost, the rules it applied: what reading it again, kept, costs too, so a test may apply as much with
    // what was kept as without it, whoever kept it)
    const b0 = w(t + T_BUDGET), q0 = w(t + T_QBUDGET);
    const r = remembered(t, s, e, rule, closure, vis, self, want, stop, refuse, on);
    const spent = b0 - w(t + T_BUDGET), qspent = q0 - w(t + T_QBUDGET);
    if (DEBUG) debug(D_READING, s, e, r);
    const was_cut = w(THREAD + T_CUT); set(THREAD + T_CUT, cut | was_cut);
    // (in a test too: what it kept is forgotten when it is done)
    // (what is kept for all is never forgotten: it holds nothing a test lets go of, and another thread may be writing it)
    // (in a test, one holding nothing of the test's own: kept for all, a copy where nothing lets go of it (another test reads
    // the same text the same way); one holding the test's own, not kept)
    if (DEBUG && keeps && w(r) !== K_UNREAD && !was_cut && (!reg || lasting(r))) { debug(D_KEY, s, e, at_); debug(D_KEY + 1, names_k, sees, named_by); debug(D_KEY + 2, flags, stop, closure_k); }
    if (reg) { slot = 0; if (gslot && !(w(FAIL_FAST) & 16) && !was_cut && w(r) !== K_UNREAD && lasting(r) && !(w(THREAD + T_LVL_N) && s >= w(w(THREAD + T_LVL)))) { const p = lasted(r); if (p && acas(gslot, 0, s) === 0) { memo_added(MEMO, MEMO_ENTRY, (1 << 20) - 1); put(gslot + 4, e); put(gslot + 8, at_); put(gslot + 12, names_k); put(gslot + 16, closure_k); put(gslot + 20, flags); put(gslot + 24, stop); put(gslot + 32, sh); put(gslot + 36, gen); put(gslot + 40, shn); put(gslot + 44, sees); put(gslot + 48, named_by); put(gslot + 52, spent); put(gslot + 56, qspent); aput(gslot + 28, p); } } }
    // (kept weakly, when that is on: written without keeping what it holds; forgotten when that is let go of) TODO(explicit)
    if (slot && !was_cut && w(r) !== K_UNREAD && w(THREAD + T_WEAK_ON) && w(THREAD + T_LVL_N) && w(THREAD + T_WEAK) && w(THREAD + T_WEAK_N) < 1 << 20 && acas(slot, 0, s) === 0) { if (slot === gslot) memo_added(MEMO, MEMO_ENTRY, 0); wrote(slot); set(slot + 4, e); set(slot + 8, at_); set(slot + 12, names_k); set(slot + 16, closure_k); set(slot + 20, flags); set(slot + 24, stop); set(slot + 32, sh); set(slot + 36, gen); set(slot + 40, shn); set(slot + 44, sees); set(slot + 48, named_by); set(slot + 52, spent); set(slot + 56, qspent); astore(slot + 28, r); const wk_ = w(THREAD + T_WEAK_N); set(w(THREAD + T_WEAK) + 4 * wk_, slot | 1); set(THREAD + T_WEAK_N, wk_ + 1); slot = 0; }
    if (slot && !was_cut && w(r) !== K_UNREAD && acas(slot, 0, s) === 0) { if (slot === gslot) memo_added(MEMO, MEMO_ENTRY, 0); wrote(slot); put(slot + 4, e); put(slot + 8, at_); put(slot + 12, names_k); put(slot + 16, closure_k); put(slot + 20, flags); put(slot + 24, stop); put(slot + 32, sh); put(slot + 36, gen); put(slot + 40, shn); put(slot + 44, sees); put(slot + 48, named_by); put(slot + 52, spent); put(slot + 56, qspent); aput(slot + 28, r); }
    return r;
  }
  // (a number's bits, mixed: so that numbers near one another are not near in a table)
  // (what is kept for all, a table made larger as it fills: half full, a new one twice as large before it, up to `most` (a
  // mask); the older ones still read, never moved (a reading holds where in them it keeps what it is reading); each table's
  // size, the one before it and how full it is, the words before it)
  function memo_added(at: number, entry: number, most: number) {
    const tab = aload(at); if (!tab) return; const mask = w(tab - 12);
    if (xadd(tab - 4, 1) + 1 !== (mask + 1) >> 1 || mask >= most) return;
    const n = 2 * (mask + 1), size = (12 + entry * n + 15) & -16, a = xadd(HEAP, size);
    if (a < 0 || a > w(LIMIT) - size) return;
    fill(a, 0, size); set(a, n - 1); set(a + 4, tab);
    cas(at, tab, a + 12);
  }
  function mix(x: number): number { x = (x ^ (x >> 16)) * 0x45d9f3b | 0; x = (x ^ (x >> 16)) * 0x45d9f3b | 0; return x ^ (x >> 16); }
  // (what a reading from `vis` sees, as one number: the last rule of each node it goes on to, as read() goes)
  function seen(vis: number, stop: number, t: number): number {
    let h = 0, backs = 0, deferred = 0, o = vis ? w(vis + R_OWNER) : 0, prev_seen = vis;
    const back = w(t + T_SCRATCH);
    for (let n = 0; o && n < 64; n++) {
      if (w(o + N_ALSO) && backs < 48) { put(back + 4 * backs, w(o + N_PARENT)); backs++; o = w(o + N_ALSO); }
      else { o = w(o + N_PARENT); if (o === w(GLOBAL) && backs) { deferred = o; o = 0; } while (!o && backs) { backs--; o = w(back + 4 * backs); if (o === w(GLOBAL) && backs) { deferred = o; o = 0; } } if (!o) o = deferred, deferred = 0; }
      if (!o) break;
      if (DEBUG && w(o + N_IS) === -1) { debug(D_FAULT, 92, prev_seen, o); return h; }
      prev_seen = o;
      const l = latest(o);
      if (l === stop) break;
      h = mix(h + kept_as(l));
    }
    return h;
  }
  // (what follows a value, read on it, in this reading's scratch: what that reads in turn, further on)
  // (the reading of an operator and what it takes, by declaration order: [reading of what is before p, p])
  function precedence(t: number, s: number, e: number, rule: number, closure: number, vis: number, self: number, stop: number, on: number, sc: number, cut_only: number, want: number): number {
    const s0 = skip(s, e), cl = w(CLASSES);
    let o1 = s0; while (o1 < e && b(cl + b(o1)) === 2) o1++;
    if (o1 === s0 || o1 >= e || b(o1) > 32) return 0;
    const r1 = op_rule(t, s0, o1, on, sc); if (!r1) return 0;
    let cut = 0;
    for (let p = o1; p < e;) {
      if (b(p) > 32 && b(p - 1) <= 32 && b(cl + b(p)) === 2) {
        let q = p; while (q < e && b(cl + b(q)) === 2) q++;
        if (q < e && b(q) <= 32) {
          const rk = op_rule(t, p, q, on, sc);
          // (any operator the value reads, wherever it was written (`==` of Node's, `+` of Number's): by when it was declared)
          if (!rk) return 0;
          // (the same operator again, `1 < 2 < 3`: not where a rule of the value's reads all of it, a chain (`chainable`))
          if (declared_at(rk) <= declared_at(r1)) { if (q - p === o1 - s0 && same(p, s0, q - p) && chained(t, s0, e, r1, on, sc)) return 0; cut = p; break; }
        }
        p = q; continue;
      }
      p = bracket(p, e) & 1 ? past(p, e) : p + 1;
    }
    if (cut_only && !cut) return 0;
    // (what is before the cut read as all of it was, led by text when it was: `+ b` of `a + b + c` is `+`'s, not `{this}{rest}`'s)
    const at = cut || o1, left = reading(t, s, cut ? cut : o1, rule, closure, vis, self, cut ? want & LED : 0, stop, 0, 1);
    if (w(left) === K_UNREAD || w(left) === K_EMPTY) return 0;
    const pr = alloc(8); put(pr, left); put(pr + 4, at); return pr;
  }
  // (whether a rule of on's other than r reads all from a to z, led by the operator: a chain, `< {middle} < {last}`)
  function chained(t: number, a: number, z: number, r: number, on: number, sc: number): number {
    put(t + T_SCRATCH, sc + SCRATCH);
    const end = read(a, z, latest(on), 0, LED, 0, sc), found = w(sc + 512);
    put(t + T_SCRATCH, sc);
    return end === z && found && found !== r && w(found + R_PARTS) >= 4 ? 1 : 0;
  }
  function op_rule(t: number, a: number, z: number, on: number, sc: number): number {
    put(t + T_SCRATCH, sc + SCRATCH);
    const end = read(a, z, latest(on), 0, LED, 0, sc);
    put(t + T_SCRATCH, sc);
    return end === z ? w(sc + 512) : 0;
  }
  function on_read(p: number, e: number, vis: number, stop: number, t: number, sc: number): number {
    put(t + T_SCRATCH, sc + SCRATCH);
    let end = read(p, e, vis, stop, LED | (defines(p, e) ? DEFINES : 0), 0, sc);
    // (or a reader the language has, a literal of its own (`{digits: Decimal_glyph[]}`, `13`))
    if (end < 0 && b(w(CLASSES) + b(p)) === 1) { end = read(p, e, latest(w(GLOBAL)), 0, READER, METHOD, sc); if (end >= 0 && w(w(sc + 512) + R_OWNER) !== w(GLOBAL)) end = -1; }
    put(t + T_SCRATCH, sc);
    return end;
  }
  function remembered(t: number, s: number, e: number, rule: number, closure: number, vis: number, self: number, want: number, stop: number, refuse: number, on: number): number {
    // (and what is read within a left side being declared, `twice (x)` of `static twice (x) => …`: one too)
    const r = alloc(READ), left = (want & LEFT) || (w(t + T_DECL) && lefts() && in_left(s, e)) ? 1 : 0;
    want &= ~LEFT;
    put(r + 4, s); put(r + 8, e);
    if (s >= e) { put(r, K_EMPTY); return r; }
    // (read in a frame: what it holds: its takes as text, its caller, its this)
    // (not text read on a value, what follows it: that value's own to read (`<` given `this`, called without brackets))
    if (w(self + N_IS) === IS_FRAME && !on) {
      const ns = b(s) === 46 ? s + 1 : s;
      let h = -3;
      if (word(ns, e, W_CALLER)) h = -1; else if (word(ns, e, W_THIS)) h = -2; else if (w(self + F_RULE)) { const i = named(w(self + F_RULE), ns, e); if (i >= 0) h = i; }
      if (h !== -3) { put(r, K_HELD); put(r + 12, h); return r; }
    }
    // (in what a body inlined, `{{x}}`: the names of where that was written)
    // (in what a rule inlined: its own holes first, the parameters of the rule it is in; then the names where that was written)
    // (but `this` in a function's body, inlined in its call, `{this}(…)`: not that hole, the function, but `this` where the
    // function was written, below)
    const fn_this = rule && word(s, e, W_THIS) && w(rule + R_IN2_F) && s >= w(rule + R_IN2_S) && e <= w(rule + R_IN2_E) && !classed(w(rule + R_OWNER));
    let x = fn_this ? 0 : refer(0, rule, closure, s, e, 1);
    if (x) { put(r, K_REF); put(r + 12, (x - 1) >> 16); put(r + 16, (x - 1) & 0xFFFF); put(r + 20, w(THREAD + T_REFF)); return r; }
    x = fn_this ? 0 : refer(0, rule, closure, s, e, 0);
    if (x) { put(r, K_NAME); put(r + 12, (x - 1) >> 16); put(r + 16, (x - 1) & 0xFFFF); put(r + 20, w(THREAD + T_REFF)); return r; }
    // (`this` written in a rule's body, no hole of it named so: that application's first argument, what it was read on,
    // wherever the code is read (a value given as an argument, read in the callee, is the caller's `this`); but not in code
    // a class's constructor inlined, its block (`{{block}}`, the constructor the class's own): what that is read in, `.` (a
    // method's body, its rule its block's, and code given to a rule, `{. ^ degree <= this}` in `root`: as before))
    const inlined_ = rule && w(rule + R_IN2_F) && s >= w(rule + R_IN2_S) && e <= w(rule + R_IN2_E) && classed(w(rule + R_OWNER));
    if (rule && !on && !inlined_ && word(s, e, W_THIS)) { put(r, K_HELD); put(r + 12, -4); return r; }
    // (its scratch, the next free: what it reads, and what reading it reads in turn, further on)
    const sc = w(t + T_SCRATCH);
    if (sc + 3 * SCRATCH > w(t + T_SCRATCH_END)) { if (DEBUG) debug(D_FAULT, 97, s, e); if (!w(t + T_FAULT)) deep(t, w(t + T_DEPTH)); put(t + T_FAULT, L_DEEP); put(r, K_UNREAD); return r; }
    put(t + T_SCRATCH, sc + SCRATCH);
    // (a reader, a head that is one hole, reads only where a type's own rules read (a typed hole's value, read by them alone:
    // `stop`), and where a type is checked: anywhere else it would read everything)
    // (a reader in a type, a head that is one hole there, reads only where that type's own rules read (`stop`) and where it is
    // checked: anywhere else it would read everything in it; one in the language itself is a literal (`{digits: Decimal.String}`))
    // (read as part of a rule's body: its holes' names are its holes)
    if (DEBUG && (w(FAIL_FAST) & 64) && b(skip(s, e)) === 46) debug(D_FAULT, 81, s, e);
    // (an operator read on a value, and another of the value's after it that binds as loose or looser, `+ 12 == 24` on 12: what
    // the first takes ends there, whatever reads it whole (`+ {other}`))
    if (on && self && self !== w(GLOBAL) && w(self + N_IS) !== IS_FRAME && !left && !(w(FAIL_FAST) & 2048) && b(w(CLASSES) + b(s)) === 2) { const pr = precedence(t, s, e, rule, closure, vis, self, stop, self, sc, 1, want); if (stopped(t)) { put(t + T_SCRATCH, sc); put(r, K_UNREAD); return r; } if (pr) { put(t + T_SCRATCH, sc); put(r, K_ON); put(r + 12, w(pr)); put(r + 16, w(pr + 4)); put(r + 20, e); return r; } }
    const body_of = w(t + T_BODY); put(t + T_BODY, rule);
    // (in a left side, a name (a word, or an operator) and then its parameters in brackets alone, `f (x)`, `as (base: T)`,
    // `* (times: Number)`: that name being declared, not read by a rule that is it and an operand (`as {target}` is not applied to define `as`); but by one
    // that passes what follows through, a modifier (`static {statement} => {statement}`), or one of its own form (`as (=== T)`))
    const naming = w(t + T_NAMING), naming_n = w(t + T_NAMING_N);
    if (left && !on) {
      let o = skip(s, e); const a0 = o, z = trim_end(s, e), cl = w(CLASSES), kind0 = b(cl + b(o)); while (o < z && b(cl + b(o)) === kind0 && (kind0 === 1 || kind0 === 2)) o++; let p = o; while (p < z && b(p) === 32) p++; if (o > a0 && p > o && p < z && (bracket(p, z) & 3) === 1 && bracket(p, z) !== 5 + 8 * w(OPEN_LENGTH) && past(p, z) >= z) { let q = p + 1; while (q < z && b(q) === 32) q++; if (b(q) === b(z - 1) || b(cl + b(q)) === 1) { put(t + T_NAMING, a0); put(t + T_NAMING_N, o - a0); } }
      // (or, in a rule's body, one of its holes, `as {type} =>`: the name declared with what that hole took)
      else if (o > a0 && p > o && p < z && rule && bracket(p, z) === 5 + 8 * w(OPEN_LENGTH) && past(p, z) >= z && ref(rule, 0, p, z, 1)) { put(t + T_NAMING, a0); put(t + T_NAMING_N, o - a0); } }
    // (a member read, `x.name`: the name read in x is x's (its text, or written right after a `.`, wherever it is read))
    const sa = skip(s, e), member_read = (w(t + T_MEMBER) && s >= w(t + T_MEMBER_S) && s < w(t + T_MEMBER_E)) || (sa > 1 && b(sa - 1) === 46 && b(sa - 2) !== 46) ? 1 : 0;
    const end = read(s, e, vis, stop, want | (!refuse && defines(s, e) ? DEFINES : 0), refuse | (stop ? 0 : TYPE_READER) | (on ? 0 : METHOD) | (on || left || member_read ? 0 : MEMBER), sc);
    put(t + T_NAMING, naming); put(t + T_NAMING_N, naming_n);
    put(t + T_BODY, body_of);
    if (end >= 0) {
      const found = w(sc + 512), holes = w(found + R_HOLES), caps = alloc(8 * holes);
      for (let i = 0; i < holes; i++) { put(caps + 8 * i, w(sc + 516 + 12 * i)); put(caps + 8 * i + 4, w(sc + 520 + 12 * i)); }
      put(t + T_SCRATCH, sc);
      // (found in a component that is a value, `e` of a vertex `e + Ray`: run on that value)
      const so = vis ? w(vis + R_OWNER) : 0;
      put(r, K_RULE); put(r + 12, found); put(r + 16, caps); put(r + 20, vis); put(r + 24, !NOVIA && so && w(found + R_OWNER) !== so && w(so + N_ALSO) ? valued_component(so, w(found + R_OWNER)) : 0); put(r + 28, 0);
      // (a rule the map says superposes: what reads it without that rule, read alike, kept with it; the one taken when what
      // it is applied to is not superposed; none, the text unread here (read again when it runs, a parameter declared
      // by then, `f(x)` in `(f) => f(x)`; a name bare in a method's body, `holds(value)`, read on what it runs on))
      if (w(found + R_FLAGS) & (SUPERPOSING | REFUSES)) { if (DEBUG) debug(D_FAULT, 1093, 9, 1); const sn = w(t + T_SKIPS_N); if (sn >= 32 || !w(t + T_SKIPS)) { put(r, K_UNREAD); return r; } put(w(t + T_SKIPS) + 4 * sn, found); set(t + T_SKIPS_N, sn + 1); const h0 = DEBUG ? aload(HEAP) + w(t + T_CHUNK) : 0; const alt = remembered(t, s, e, rule, closure, vis, self, want | (left ? LEFT : 0), stop, refuse, on); if (DEBUG) debug(D_FAULT, 1093, 12, aload(HEAP) + w(t + T_CHUNK) - h0); set(t + T_SKIPS_N, sn); if (w(alt) === K_UNREAD) { put(r, K_UNREAD); return r; } put(r + 28, alt); }
      return r;
    }
    put(t + T_SCRATCH, sc);
    put(r, K_UNREAD);
    if (DEBUG && (w(FAIL_FAST) & 64) && b(skip(s, e)) === 46) { debug(D_FAULT, 81, s, e); debug(D_FAULT, 80, vis, stop); }
    if (want & HOLES) return r;
    // (an operator read on a value, then what it takes, `== 2 * 2 + 2` on 6: up to the next operator of the same value's that
    // binds as loose or looser, the one declared before it or itself (of two, the one declared later binds tighter); none, all
    // of what follows (`==` takes `2 * 2 + 2`))
    if (on && self && self !== w(GLOBAL) && w(self + N_IS) !== IS_FRAME && !left && !(w(FAIL_FAST) & 2048)) { const pr = precedence(t, s, e, rule, closure, vis, self, stop, self, sc, 0, want); if (pr) { put(r, K_ON); put(r + 12, w(pr)); put(r + 16, w(pr + 4)); put(r + 20, e); return r; } }
    // (a value and an operator after it, after a space, `6 == 2 * 2 + 2`: the operator and what follows read on the value, so
    // what the operator takes is by its precedence among the value's (above), not each operator on what is before it)
    if (!left && b(w(CLASSES) + b(skip(s, e))) !== 2) for (let p = s + 1; p < e;) {
      if (b(p) > 32 && b(p - 1) <= 32 && b(w(CLASSES) + b(p)) === 2) {
        let q = p; while (q < e && b(w(CLASSES) + b(q)) === 2) q++;
        if (q < e && b(q) <= 32 && worded(skip(s, p), trim_end(s, p))) { const o = reading(t, s, p, rule, closure, vis, self, 0, stop, 0, 0); if (w(o) !== K_UNREAD && w(o) !== K_EMPTY) { put(r, K_ON); put(r + 12, o); put(r + 16, p); put(r + 20, e); return r; } }
        break;
      }
      p = bracket(p, e) & 1 ? past(p, e) : p + 1;
    }
    // (a value, then the rest read on it: the first place what follows is read whole on a value (led by text) and what is before
    // it reads: `x.f(1)` is `f(1)` read in x; what follows begins with an operator or a bracket, or after a space or an
    // operator (`..9` is `9` read on what `..` is))
    for (let p = s; p < e;) {
      if (p > s && b(p) > 32 && (b(w(CLASSES) + b(p)) !== 1 || b(p - 1) <= 32 || b(w(CLASSES) + b(p - 1)) === 2) && on_read(p, e, vis, stop, t, sc) >= 0) {
        // (a member right after a word is that word's, `x == other.pred`: what follows is read from that word, after a space,
        // on what is before it (`other.pred` given to `==`), when that reads)
        // (and brackets right after a word are that word's, a call, `1 + gcd(other)`: what is before the word, the value)
        // (or right after a text or what brackets close, `"a" < "b".first`: that text's, those brackets')
        if ((b(p) === 46 || (bracket(p, e) & 3) === 1) && p > s && (b(w(CLASSES) + b(p - 1)) === 1 || token_start(s, p) < p)) {
          let q = p; if (b(w(CLASSES) + b(p - 1)) === 1) { while (q > s && b(w(CLASSES) + b(q - 1)) === 1) q--; } else q = token_start(s, p);
          if (q > s && b(q - 1) <= 32) { const o2 = reading(t, s, q, rule, closure, vis, self, 0, stop, 0, 0); if (w(o2) !== K_UNREAD && w(o2) !== K_EMPTY) { put(r, K_ON); put(r + 12, o2); put(r + 16, q); put(r + 20, e); return r; } }
        }
        const o = reading(t, s, p, rule, closure, vis, self, 0, stop, 0, 0);
        if ((w(o) !== K_UNREAD || (left && (worded(s, p) || operated(s, p)))) && w(o) !== K_EMPTY) { put(r, K_ON); put(r + 12, o); put(r + 16, p); put(r + 20, e); return r; }
      }
      p = bracket(p, e) & 1 ? past(p, e) : p + 1;
    }
    // (none, read on a value: an operator after a space, or what follows an operator it begins with (`.m == v` on x, `+ part` on a
    // number: the operator's argument): what follows read on
    // that value when it runs (the member's value, the operator's closure), which is not what it is read on here)
    // (or a word after a member, `.x min 5` on v: a method of the member's value, read on it the same)
    for (let p = s + 1; p < e;) {
      if (on && b(p) > 32 && b(p - 1) <= 32 && !left && (b(w(CLASSES) + b(p)) === 2 || operated(s, p) || (b(w(CLASSES) + b(p)) === 1 && membered(s, p)))) {
        const o = reading(t, s, p, rule, closure, vis, self, 0, stop, 0, 0);
        if (w(o) !== K_UNREAD && w(o) !== K_EMPTY) { put(r, K_ON); put(r + 12, o); put(r + 16, p); put(r + 20, e); return r; }
      }
      p = bracket(p, e) & 1 ? past(p, e) : p + 1;
    }
    return r;
  }

  // ---- running

  // What a reading answers. `names` is the frame whose names it was written with, `f` the one it is run in, `self` what it is
  // read in, `on` what it is read on (`.`, `this`), `written` where its text is (where what its holes take is read); `value`:
  // wanted as a value (text nothing reads is a place).
  // (a reading's value, with what it is read in kept while it is: a type a hole in it checks reads what the hole takes there
  // too, `f(x: other)`'s `other` the caller's)
  function ev(t: number, r: number, names: number, f: number, self: number, value: number, written: number, on: number): number {
    const was = w(t + T_WRITTEN_IN); set(t + T_WRITTEN_IN, self);
    let v = ev_(t, r, names, f, self, value, written, on);
    // (a type's name that answered a place nothing defined yet, where it was named (`Vector` in `distance (other: Vector)`, in
    // Vector's block, before Vector is), read in that class or in one made of it: the class, when the classes it is written in
    // name it so now (a field a header names, a place till it is read, `CAPTURE` in Expression's, stays one))
    if (v && w(v + N_IS) === IS_PLACE && !w(t + T_DECL) && !w(t + T_HOLE) && !w(t + T_LE) && self && w(self + N_IS) === IS_NODE && w(v + N_A) < w(v + N_B) && b(w(v + N_A)) >= 65 && b(w(v + N_A)) <= 90) {
      const cls = classed(self) ? self : w(self + N_ALSO) && classed(w(self + N_ALSO)) ? w(self + N_ALSO) : 0;
      if (cls) { const pa = w(v + N_A), ov = outer_valued(t, cls, pa, w(v + N_B) - pa); if (ov === cls) v = ov; }
    }
    set(t + T_WRITTEN_IN, was); return v;
  }
  function ev_(t: number, r: number, names: number, f: number, self: number, value: number, written: number, on: number): number {
    const k = w(r);
    if (k === K_EMPTY) return 0;
    // (in a hole being declared, a word it begins with: its name, whatever else that word names (`{power: T}` with a `power`))
    const hl = w(t + T_HOLE);
    if (hl && !w(hl + N_A) && (k === K_RULE || k === K_NAME || k === K_REF) && w(r + 4) === skip(w(t + T_HOLE_A), w(t + T_HOLE_B)) && worded(w(r + 4), w(r + 8))) {
      let e = w(r + 8); while (e > w(r + 4) && b(e - 1) <= 32) e--;
      put(hl + N_A, w(r + 4)); put(hl + N_B, e); declare(t, hl, w(r + 4), e); return hl;
    }
    // (a type's name read as a place, what nothing defined yet where it was named (`S` in the body of `S := class …`, read
    // before S is): what the classes it is written in name it now (`outer_block`, and so on out); none, the place)
    if (k === K_RULE && !hl && !w(t + T_DECL) && !w(t + T_LE) && b(w(r + 4)) >= 65 && b(w(r + 4)) <= 90 && worded(w(r + 4), w(r + 8))) {
      const pru = w(r + 12), ppl = pru && w(pru + R_KIND) === VALUE ? w(pru + R_BS) : 0;
      if (ppl && w(ppl + N_IS) === IS_PLACE && !place_value(t, ppl)) { const pws = skip(w(r + 4), w(r + 8)), pwn = trim_end(w(r + 4), w(r + 8)) - pws, pov = outer_valued(t, w(w(ppl + N_BASE) + R_CLOSURE), pws, pwn) || (self !== w(w(ppl + N_BASE) + R_CLOSURE) ? outer_valued(t, self, pws, pwn) : 0) || written_valued(t, names, self, written, pws, pwn); if (pov) return pov; }
    }
    // (what nothing in it reads: read where its rule was written, that frame's node (a method a class block written in a call
    // defines, `wrapped (tag) => class: this { says => tag }`: the call's `tag`))
    if (k === K_LATER) { let rr = reading(t, w(r + 4), w(r + 8), w(names + F_RULE), w(names + F_CLOSURE), latest(self), self, 0, 0, 0, 0); const cf = w(names + F_CLOSURE), ct = cf && w(cf + N_IS) === IS_FRAME ? w(cf + F_THIS) : 0; if (w(rr) === K_UNREAD && ct && ct !== self && w(ct + N_IS) === IS_NODE) { const r2 = reading(t, w(r + 4), w(r + 8), w(names + F_RULE), w(names + F_CLOSURE), latest(ct), ct, 0, 0, 0, 0); if (w(r2) !== K_UNREAD) rr = r2; } return ev(t, rr, names, f, self, value, self, self); }
    if ((k === K_NAME || k === K_REF) && w(r + 20)) names = w(r + 20);
    if (DEBUG && k === K_NAME) { let fq = names; for (let d = 0; d <= w(r + 12); d++) { if (!fq || w(fq + N_IS) !== IS_FRAME) { debug(D_FAULT, 1103, w(r + 4), w(r + 8)); debug(D_FAULT, 1104, d, w(r + 20) ? 1 : 0); return 0; } if (d < w(r + 12)) fq = w(fq + F_CLOSURE); } if (w(fq + F_RULE) && w(r + 16) >= w(w(fq + F_RULE) + R_HOLES)) { debug(D_FAULT, 1103, w(r + 4), w(r + 8)); debug(D_FAULT, 1105, w(fq + F_RULE), w(r + 16)); return 0; } }
    if (k === K_NAME) return valued(t, take(w(r + 20) || names, w(r + 12), w(r + 16)));
    // (`{x}`: its code, read where it is used (its type said what it matched, not where it is read))
    if (k === K_REF) {
      const direct = take(names, w(r + 12), w(r + 16)), tk = follow(direct, 0);
      // (in a left side, a hole's code spliced where it is used, one word: declared, a place there (`.{member}`'s member); one
      // given through another's hole (`(on).{key}`, `x[name] := …`) whose word answers a text: that text the name)
      // (declared where `.` is: read on nothing, in a method's node, what that was read on (`.head := link` in `xs.append(v)`))
      // (only a member, a hole of a rule led by `.`: a name written bare is the call's own, `made := …` (each call its own))
      const into = w(names + F_RECEIVER) === w(names + F_THIS) && run_node(self) && dotted(w(names + F_RULE)) ? w(self + N_ALSO) : self;
      // (a text is a value: nothing is declared in it; a frame holds what its rule took, its caller and its this: those are read
      // (`"inner".unescaped`, `(external &).text`))
      const fixed = w(into + N_IS) === IS_TEXT || (w(into + N_IS) === IS_FRAME && held_in(into, w(tk), w(tk + 4)));
      // (read in a rule's body, of a left side's text: part of it)
      if (!w(t + T_DECL) && in_left(w(tk), w(tk + 4))) { put(t + T_DECL, 1); const v = ev(t, r, names, f, self, value, written, on); put(t + T_DECL, 0); return v; }
      if (w(t + T_DECL) && fixed) { put(t + T_DECL, 0); const v = block(t, w(tk), w(tk + 4), w(tk + T_ORIGIN), f, into, 0, value, 1, w(tk + T_THIS) || into, 0); put(t + T_DECL, 1); return v; }
      // (or code that is one word of the left side, wherever the rule mentions it (`,`'s `list === declared`): a name declared
      // here, not a visible one's value (`(type, depth) := …` with a `type` visible))
      const of_left = !lefts() || left_along(direct) || in_left(w(r + 4), w(r + 8)) || (worded(w(tk), w(tk + 4)) && in_left(w(tk), w(tk + 4)));
      // (not of the left side being read (a member a rule's body reads, `,`'s `.spreading`): read as a value)
      if (w(t + T_DECL) && !of_left) { put(t + T_DECL, 0); const v = ev(t, r, names, f, self, value, written, on); put(t + T_DECL, 1); return v; }
      if (w(t + T_DECL) && worded(w(tk), w(tk + 4)) && of_left) {
        if (tk !== direct) { put(t + T_DECL, 0); const v = valued(t, tk); put(t + T_DECL, 1); if (v && w(v + N_IS) === IS_TEXT && worded(w(v + N_A), w(v + N_B))) return placed(t, w(v + N_A), w(v + N_B), into); }
        return placed(t, w(tk), w(tk + 4), into);
      }
      // (not one word: what it answers, a text, the name declared (`(on).{key}` given `"inner"`))
      if (w(t + T_DECL) && !worded(w(tk), w(tk + 4))) {
        // (the left side, from here: this code's text)
        const pushed = push_left(w(tk), w(tk + 4));
        const v = block(t, w(tk), w(tk + 4), w(tk + T_ORIGIN), f, self, 0, value, 1, self, self === w(tk + T_THIS) ? w(tk + T_LEX) : 0);
        put(t + T_LE, pushed);
        return v && w(v + N_IS) === IS_TEXT && worded(w(v + N_A), w(v + N_B)) ? placed(t, w(v + N_A), w(v + N_B), into) : v;
      }
      // (all of it read here, the code a whole (`.({code})`, `{`{`}{block}{`}`}`, `{body}`); but a rule that is only its last
      // hole written against its text (`.{member} => {member}`): the rest of a line, what is read on a value in it keeps where
      // the line was written (`.for((x) => …)`: the closure where the line is), the rest read in what `.` is)
      const whole = !w(r + 12) && rest_of_line(w(names + F_RULE), w(r + 16)) ? 0 : 1;
      // (where the code was written: the node it was taken in; taken here, in code that a hole taken elsewhere holds (a class's
      // `static {statement}`, its block's), that one's)
      if (whole) { const wr = w(t + T_WRITER), ws = w(t + T_WRITER_SELF), wsa = w(t + T_WRITER_S), wse = w(t + T_WRITER_E), th = w(tk + T_THIS), own = th && th !== self && w(th + N_IS) === IS_NODE, within = !own && th === self && ws === self && wr && w(tk) >= wsa && w(tk + 4) <= wse; const ld = w(tk + T_LEAD), rd = ld || self; put(t + T_WRITER, ld ? th : (own ? th : (within ? wr : 0))); put(t + T_WRITER_SELF, rd); if (own || ld) { put(t + T_WRITER_S, w(tk)); put(t + T_WRITER_E, w(tk + 4)); } const v = block(t, w(tk), w(tk + 4), w(tk + T_ORIGIN), f, rd, 0, value, 1, rd, rd === w(tk + T_THIS) ? w(tk + T_LEX) : 0); put(t + T_WRITER, wr); put(t + T_WRITER_SELF, ws); put(t + T_WRITER_S, wsa); put(t + T_WRITER_E, wse); return v; }
      const member = w(t + T_MEMBER), ms = w(t + T_MEMBER_S), me = w(t + T_MEMBER_E); put(t + T_MEMBER, into); put(t + T_MEMBER_S, w(tk)); put(t + T_MEMBER_E, w(tk + 4));
      const v = block(t, w(tk), w(tk + 4), w(tk + T_ORIGIN), f, into, 0, value, 1, w(tk + T_THIS) || into, into === w(tk + T_THIS) ? w(tk + T_LEX) : 0);
      put(t + T_MEMBER, member); put(t + T_MEMBER_S, ms); put(t + T_MEMBER_E, me);
      return v; }
    if (k === K_HELD) {
      const h = w(r + 12);
      if (h === -1) return w(self + F_CALLER);
      // (`this`: what it was read on; else what it is read in, and in a method, a node made there is what that is read on)
      // (but a class called, `x.C(…)`: the class (what it makes is of it), not x)
      if (h === -2) { const th = w(self + F_THIS), rc = w(self + F_RECEIVER), it = run_node(th) ? w(th + N_ALSO) : th; return rc !== th && !classed(it) ? rc : it; }
      // (in a function's body, inlined in its call (`{{body}}`): what `this` is where the function was written, the frame the
      // function was read from, out through the functions it is written in (`.all.every(a => this.all.every(…))`); not out of
      // a method, read where its class's constructor read the class's block)
      if (h === -4) { let fr = names && w(names + N_IS) === IS_FRAME && w(names + F_RULE) ? names : 0; if (!fr) return self;
        fr = called_in(written_this(fr, w(r + 4), w(r + 8))); const th = w(fr + F_THIS), rc = w(fr + F_RECEIVER), it = run_node(th) ? w(th + N_ALSO) : th; return rc !== th && !classed(it) ? rc : it; }
      const tk = follow(self + F_TAKES + TAKE * h, 0);
      // (a text: in what the kernel's map says texts are (its rules read on it), else in what everything is)
      return node(IS_TEXT, w(tk), w(tk + 4), w(TEXTS) || w(GLOBAL), 0);
    }
    // (in a left side read as a value, a name a visible value has: that one, where it is (`({name}) => value`, `=`'s head))
    // (and an operator's name, `#` of `# => …`: the name, not what the rule it is answers)
    if (k === K_RULE && w(t + T_DECL) && w(t + T_ONE) === w(r + 4) && !w(w(r + 12) + R_HOLES) && (worded(w(r + 4), w(r + 8)) || operated(w(r + 4), w(r + 8)))) { put(t + T_ONE, 0); return placed(t, w(r + 4), w(r + 8), w(t + T_HERE) ? (w(t + T_DEFIN) || self) : w(w(r + 12) + R_OWNER)); }
    if (k === K_RULE && w(r + 28)) {
      // (a superposing rule, with what reads it without it: applied, asking; not superposed, that other, given the values read)
      set(t + T_LEXV, w(r + 20)); const via = w(r + 24), g0 = w(t + T_GIVEN_N), alt = w(t + T_ALT);
      put(t + T_ALT, w(r + 12));
      const v = apply(t, w(r + 12), w(r + 16), names, f, via || self, w(r + 4), w(r + 8), written, via || on);
      const other = w(t + T_ALT) === 1; put(t + T_ALT, alt);
      if (!other) { put(t + T_GIVEN_N, g0); return v; }
      const v2 = ev_(t, w(r + 28), names, f, self, value, written, on);
      put(t + T_GIVEN_N, g0); return v2;
    }
    // (`.name` written alone, in what gives `.` a value of its own (a closure called `.on(value)`): that value's member, not one
    // of what it is read in) TODO(explicit)
    if (k === K_RULE && !w(r + 24) && self && w(self + N_IS) === IS_NODE && b(w(r + 4)) === 46 && b(w(CLASSES) + b(w(r + 4) - 1)) !== 1 && b(w(r + 4) - 1) !== 41 && b(w(r + 4) - 1) !== 93 && dot_member(w(r + 12)) && own_named(self, w(r + 4), w(r + 4) + 1)) {
      const dv = member_seen(t, self, w(r + 4), 1, self, 0);
      if (dv && dv !== self && dv !== w(NOTHING)) return apply(t, w(r + 12), w(r + 16), names, f, dv, w(r + 4), w(r + 8), written, dv);
    }
    // (`.(x)`, `.` one called by brackets (a method `(…)` its own, a statement's key: `.statement#.for .(caller)`): `(x)` read on
    // it, that call; else the language's, x read in it (and a `.` after a name or what closes, `it.({constraint})`, or x led by a `.`,
    // a member a section reads, `it.(.length)`)) TODO(explicit)
    if (k === K_RULE && !w(r + 24) && dot_paren(w(r + 12)) && b(w(r + 4)) === 46 && b(skip(w(r + 4) + 2, w(r + 8))) !== 46 && b(w(CLASSES) + b(w(r + 4) - 1)) !== 1 && b(w(r + 4) - 1) !== 41 && b(w(r + 4) - 1) !== 93) {
      // (`.` what it is read in, what the language's would read x in)
      const ds = w(r + 4);
      if (callable_(t, self)) { const dr = reading(t, ds, ds + 1, w(names + F_RULE), w(names + F_CLOSURE), latest(self), self, 0, 0, 0, 0), r2 = alloc(READ); put(r2, K_ON); put(r2 + 4, ds); put(r2 + 8, w(r + 8)); put(r2 + 12, dr); put(r2 + 16, ds + 1); put(r2 + 20, w(r + 8)); return onto(t, r2, names, f, self, value, written); }
    }
    if (k === K_RULE) { set(t + T_LEXV, w(r + 20)); const via = w(r + 24); return apply(t, w(r + 12), w(r + 16), names, f, via || self, w(r + 4), w(r + 8), written, via || on); }
    if (k === K_ON) return onto(t, r, names, f, self, value, written);
    const s = w(r + 4), e = w(r + 8);
    // (nothing read it as written: when it runs, what follows an operator read on the value it follows, its own methods
    // reading it (`6 == 6`, `"0".."9"`: what no rule in scope could), the first place one begins after what reads)
    if (k === K_UNREAD && !w(t + T_DECL) && !w(t + T_HOLE) && !defines(s, e)) for (let p = s; p < e;) {
      if (p > s && b(w(CLASSES) + b(p)) === 2 && b(w(CLASSES) + b(p - 1)) !== 2) {
        const o = reading(t, s, p, w(names + F_RULE), w(names + F_CLOSURE), latest(self), self, 0, 0, 0, 0);
        if (w(o) !== K_UNREAD && w(o) !== K_EMPTY) { const r2 = alloc(READ); put(r2, K_ON); put(r2 + 4, s); put(r2 + 8, e); put(r2 + 12, o); put(r2 + 16, p); put(r2 + 20, e); return onto(t, r2, names, f, self, value, written); }
      }
      p = bracket(p, e) & 1 ? past(p, e) : p + 1;
    }
    // (or a value, then a word after a space and what follows it, `x min y`: the value's method called on what follows it, read on
    // the value, below)
    if (k === K_UNREAD && !w(t + T_DECL) && !w(t + T_HOLE) && !defines(s, e)) {
      let iv_p = skip(s, e);
      while (iv_p < e && b(iv_p) > 32) iv_p = bracket(iv_p, e) & 1 ? past(iv_p, e) : iv_p + 1;
      const iv_q = iv_p < e ? skip(iv_p, e) : e;
      let iv_z = iv_q;
      while (iv_z < e && b(w(CLASSES) + b(iv_z)) === 1) iv_z++;
      if (iv_q > iv_p && iv_z > iv_q && iv_z < e && b(iv_z) <= 32 && skip(iv_z, e) < trim_end(s, e)) {
        const iv_o = reading(t, s, iv_p, w(names + F_RULE), w(names + F_CLOSURE), latest(self), self, 0, 0, 0, 0);
        if (w(iv_o) !== K_UNREAD && w(iv_o) !== K_EMPTY) { const iv_r = alloc(READ); put(iv_r, K_ON); put(iv_r + 4, s); put(iv_r + 8, e); put(iv_r + 12, iv_o); put(iv_r + 16, iv_q); put(iv_r + 20, e); return onto(t, iv_r, names, f, self, value, written); }
      }
    }
    // (or a member of a type's name nothing reads where it is, `S.d` in a narrowing's constraint: the type as what the code was
    // written in names it, then its members on it, in turn; else unread as before)
    if (k === K_UNREAD && !w(t + T_DECL) && !w(t + T_HOLE) && !w(t + T_LE) && b(s) >= 65 && b(s) <= 90 && names && w(names + N_IS) === IS_FRAME) {
      let dp = s; while (dp < e && b(w(CLASSES) + b(dp)) === 1) dp++;
      const de = trim_end(s, e);
      if (dp > s && dp < de && b(dp) === 46 && b(dp + 1) >= 97 && b(dp + 1) <= 122 && w(reading(t, s, dp, w(names + F_RULE), w(names + F_CLOSURE), latest(self), self, 0, 0, 0, 0)) === K_UNREAD) {
        let dv = written_valued(t, names, self, written, s, dp - s);
        while (dv && dp < de && b(dp) === 46) { let dq = dp + 1; while (dq < de && b(w(CLASSES) + b(dq)) === 1) dq++; if (dq === dp + 1) { dv = 0; break; } dv = member_seen(t, dv, dp + 1, dq - dp - 1, dv, 0); dp = dq; }
        if (dv && dp === de && dv !== w(NOTHING)) return dv;
      }
    }
    // (or a type's name nothing reads called, `A(3)`: the name as it is asked for below (a member of what this runs on, or of
    // the classes it is written in), then the brackets on what it names)
    if (k === K_UNREAD && !w(t + T_DECL) && !w(t + T_HOLE) && !w(t + T_LE) && b(s) >= 65 && b(s) <= 90) { let p = s; while (p < e && b(w(CLASSES) + b(p)) === 1) p++; if (p > s && p < e && (bracket(p, e) & 3) === 1 && past(p, e) >= trim_end(s, e)) { const o = reading(t, s, p, w(names + F_RULE), w(names + F_CLOSURE), latest(self), self, 0, 0, 0, 0), r2 = alloc(READ); put(r2, K_ON); put(r2 + 4, s); put(r2 + 8, e); put(r2 + 12, o); put(r2 + 16, p); put(r2 + 20, e); return onto(t, r2, names, f, self, value, written); } }
    // (a member that is not there, a name written bare in a method's body that nothing reads, the method run on a value
    // (`next` of `is_zero => next === None`, made `Number()`): None (§5, a missing member reads as None))
    // (a word nothing reads where it was written, read as a value: what it names on what it is read on, if that names it (a
    // header's field, read by a type after it: `(a: T, b: a.count)`))
    // (code nothing reads, while a type made `dynamically` reads: what reads it with the names of the frame that type was
    // made in, on what it is read on)
    if (k === K_UNREAD && w(t + 952) && !w(t + 1016) && !w(t + T_DECL) && skip(s, e) < trim_end(s, e)) { put(t + 1016, 1); let dv = 0; for (let di = w(t + 952) - 1; di >= 0 && !dv; di--) for (let df = w(t + 956 + 4 * di), up = 0; df && w(df + N_IS) === IS_FRAME && up < 4 && !dv; df = w(df + F_CALLER), up++) { if (df !== names) { const dt = w(df + F_THIS), dm = dt && w(dt + N_IS) === IS_NODE ? node(IS_NODE, 0, 0, dt, dt) : 0; if (dm && self) { const wd = w(w(WORDS) + 8 * W_DOT); bound(wd, wd + w(w(WORDS) + 8 * W_DOT + 4), dm, self); } const v1 = block(t, skip(s, e), trim_end(s, e), df, df, dm || self, 0, 1, 0, dm || self, 0); if (v1 && v1 !== w(NOTHING)) dv = v1; } } put(t + 1016, 0); if (dv) return dv; }
    // (a word in code a body inlined, `{{fields}}`, nothing reads here: what reads it where that code was written (a closure's
    // parameter or local, `Glyphs` of a class made in `Number.Named.for`))
    if (k === K_UNREAD && worded(s, e) && names && w(names + N_IS) === IS_FRAME) {
      const nr = w(names + F_RULE), fo = nr && w(nr + R_IN2_F) && s >= w(nr + R_IN2_S) && e <= w(nr + R_IN2_E) ? w(nr + R_IN2_F) : 0;
      if (fo && fo !== names && w(fo + N_IS) === IS_FRAME) { const fv = block(t, s, e, fo, fo, w(fo + F_THIS), 0, 1, 0, w(fo + F_THIS), 0); if (fv && fv !== w(NOTHING)) return fv; }
    }
    if (k === K_UNREAD && value && !w(t + T_DECL) && !w(t + T_HOLE) && !w(t + T_LE) && worded(s, e) && on && on !== self && on !== w(GLOBAL) && w(on + N_IS) === IS_NODE && own_named(on, s, e)) { const mv = member_seen(t, on, s, e - s, on, 0); if (mv) return mv; }
    // (a word nothing reads where it is, in a method: a type a member of what it runs on, as its class has it (a class
    // declared in the class's block, `A` of `bare => A(3)`, is the class's, not the instance's own); else of the class that
    // class is written in, and so on out (`outer_block`, the entrypoint's); else nothing)
    if (k === K_UNREAD && !w(t + T_DECL) && !w(t + T_HOLE) && !w(t + T_LE) && worded(s, e)) { const th = (self && self !== w(GLOBAL) && !making(self) && (w(self + N_IS) === IS_NODE || w(self + N_IS) === IS_TEXT) && w(names + N_IS) === IS_FRAME && w(names + F_RULE) && w(w(names + F_RULE) + R_HOLES) ? self : 0) || held_this(names) || (names && w(names + N_IS) === IS_FRAME && w(names + F_RULE) ? w(names + F_THIS) : 0); if (th && th !== w(GLOBAL) && (w(th + N_IS) === IS_NODE || w(th + N_IS) === IS_TEXT)) { const ws = skip(s, e), wn = trim_end(s, e) - ws; const again = read_again(t, ws, wn, names, self); if (again) return ev(t, again, names, f, self, value, written, on); let sm = w(th + N_IS) === IS_NODE ? valued_member(t, th, ws, wn) : 0; for (let o = sm ? 0 : held(t, th, W_OUTER_BLOCK, 0), k1 = 0; !sm && o && o !== w(NOTHING) && w(o + N_IS) === IS_NODE && k1 < 16; o = held(t, o, W_OUTER_BLOCK, 0), k1++) sm = valued_member(t, o, ws, wn); return sm || (th === self ? missed(t, th, ws, trim_end(s, e)) : w(NOTHING)); } }
    // (and read in a value, not in a method (a static, read when first asked for): a type a member of it, or of the classes it
    // is written in; none, unread as before)
    if (k === K_UNREAD && !w(t + T_DECL) && !w(t + T_HOLE) && !w(t + T_LE) && worded(s, e) && self && self !== w(GLOBAL) && w(self + N_IS) === IS_NODE) { const ws = skip(s, e), wn = trim_end(s, e) - ws; const again = read_again(t, ws, wn, names, self); if (again) return ev(t, again, names, f, self, value, written, on); let sm = valued_member(t, self, ws, wn); for (let o = sm ? 0 : held(t, self, W_OUTER_BLOCK, 0), k2 = 0; !sm && o && o !== w(NOTHING) && w(o + N_IS) === IS_NODE && k2 < 16; o = held(t, o, W_OUTER_BLOCK, 0), k2++) sm = valued_member(t, o, ws, wn); if (sm) return sm; }
    // (a type's name nothing reads where it is, in code a rule was given (a narrowing's constraint, read on the value it checks:
    // `Y := Number[]{.length == S.d}` in a class): a member of what the code was written in, or of the classes that is in)
    if (k === K_UNREAD && !w(t + T_DECL) && !w(t + T_HOLE) && !w(t + T_LE) && b(skip(s, e)) >= 65 && b(skip(s, e)) <= 90 && worded(s, e) && names && w(names + N_IS) === IS_FRAME) {
      const cws = skip(s, e), cv = written_valued(t, names, self, written, cws, trim_end(s, e) - cws); if (cv) return cv;
    }
    // (an operator missing a side, as a value nothing reads (Node.ray: a section, `xs.map(+ 1)`, `.some(== 8)`, `reduce(+)`):
    // the function of what it misses, `(left) => left + 1`; the operator alone, of both, `(left, right) => left + right`
    // (`!` alone, of one); not `-` written against a digit, a number)
    if (k === K_UNREAD && value && !w(t + T_DECL) && !w(t + T_HOLE) && !w(t + T_LE) && w(t + T_FAULT) !== L_DEEP) { const sv = sectioned(t, s, e, names, self); if (sv) return sv; }
    // (unread because what read it went too deep (it read itself, again and again): that, not that nothing reads it)
    if (!value) { unread(t, s, e); return 0; }
    // (in a hole: the hole, where a name is declared in it (at its start, or after a `,`: `{a, b}`); in a test, an error: the
    // test failed; else a place, named by the text, here)
    const hole = w(t + T_HOLE);
    if (hole && naming(t, s)) {
      if (!w(hole + N_A)) { put(hole + N_A, s); put(hole + N_B, e); declare(t, hole, s, e); return hole; }
      if (trimmed(w(hole + N_A), w(hole + N_B) - w(hole + N_A), s, e)) return hole;
      // (another name in it: one of its own, `{a, b}` two holes)
      const other = node(IS_HOLE, s, e, w(hole + N_PARENT), 0);
      declare(t, other, s, e);
      return other;
    }
    // (in a test, an error; but in a node a rule is making (`external .`, while it runs), a place: a name it is given, it has)
    // (while a left side is read, a name nothing reads is what it declares: no error)
    if (w(t + T_TESTING) && !making(self) && !w(t + T_DECL) && !w(t + T_LE)) { unread(t, s, e); if ((w(FAIL_FAST) & 1)) { jump(t, W_ERRED, 0); if (!w(THREAD + T_QUIET)) set(t + T_ERRED, 1); return 0; } }
    // (a left side's: where what it declares is defined, the node a call runs in (not where its parameters were written))
    let here = w(t + T_DECL) && w(t + T_DEFIN) ? w(t + T_DEFIN) : self;
    // (a name nothing reads yet, read bare in what holds members (a class's block before the class has its name, `Ray()` in
    // Ray's): a place where that is written, not a member of it (§21.3))
    if (0 && !w(t + T_DECL) && !making(self)) for (let up = 0; here && w(here + N_IS) === IS_NODE && w(w(here + N_BASE) + R_KIND) === MEMBERS_MARK && w(here + N_PARENT) && up < 64; up++) here = w(here + N_PARENT);
    const place = place_of(s, e, here), named_ = alloc(R_PART + PART);
    if (DEBUG) debug(D_FAULT, 1107, s, e);
    // (what a definition's head declares, about to be defined (`! => …`): no rule of a place left beside the one it defines)
    if (w(t + T_DECL) && w(t + T_DEFIN)) return place;
    put(named_ + R_KIND, VALUE); put(named_ + R_MASK, bytes(s, e)); put(named_ + R_BS, place); put(named_ + R_PARTS, 1); put(named_ + R_FLAGS, LED);
    put(named_ + R_HEAD, node(IS_HEAD, s, e, here, 0)); put(named_ + R_OWNER, here); put(named_ + R_PART + 4, s); put(named_ + R_PART + 8, e - s);
    link(here, named_);
    return place;
  }
  // (the text at s, in the hole being declared, where it declares a name: its start, or after a `,` there)
  function naming(t: number, s: number): number {
    const a = skip(w(t + T_HOLE_A), w(t + T_HOLE_B));
    if (s === a) return 1;
    let p = s; while (p > a && b(p - 1) <= 32) p--;
    return p > a && b(p - 1) === 44 ? 1 : 0;
  }
  // (a rule of the node's own that could read the text from s to e: what the reader asks of each before it matches (the bytes
  // it needs, the text it begins with); none, and what reads the text is what read it before)
  function could(n: number, s: number, e: number): number {
    if (w(FAIL_FAST) & 32) return 1;
    s = skip(s, e); while (e > s && b(e - 1) <= 32) e--;
    const has = bytes(s, e);
    for (let x = latest(n), k = 0; x && x !== w(n + N_BASE) && k < 4096; x = w(x), k++) {
      const f = w(x + R_FLAGS);
      if (f & DEAD) return 1;
      if (!(w(x + R_MASK) & ~has) && (f & LED ? b(s) === b(w(x + R_PART + 4)) : written(x, s, e))) return 1;
    }
    return 0;
  }
  function making(n: number) { const by = w(n + N_B); return w(n + N_IS) === IS_NODE && by && w(by + N_IS) === IS_FRAME && !w(by + N_B) ? 1 : 0; }
  // (the text from s to e has a hole in it)
  function holed(s: number, e: number) { const hole = 5 + 8 * w(OPEN_LENGTH); for (let i = s; i < e; i++) if (bracket(i, e) === hole) return 1; return 0; }
  // (the text from s to e a pattern: a hole in it, not in brackets (`{x} + {y}`; `({x} => {y}).style` is code), that is none
  // of the holes of what it was written in, `names`)
  // (a group that is all of it, `({x})`, `[{x}]`, a pattern too; and what is quoted is not in brackets)
  function pattern(s: number, e: number, names: number) {
    const hole = 5 + 8 * w(OPEN_LENGTH);
    while (e > s && b(e - 1) <= 32) e--;
    for (let i = s; i < e;) {
      const k = bracket(i, e);
      if (k === hole) { if (!names || !w(names + F_RULE) || !ref(w(names + F_RULE), w(names + F_CLOSURE), i, past(i, e), 1)) return 1; i = past(i, e); continue; }
      if ((k & 3) === 1) { const p = past(i, e); if (p >= e && holed(i, p)) return 1; i = p; continue; }
      i++;
    }
    return 0;
  }
  // (the text from s to e one word, the space around it aside)
  // (a rule led by a word and more after it, `checked {type}`)
  function word_headed(r: number): number { return r && w(r + R_PARTS) > 1 && w(r + R_HOLES) && (w(r + R_PART) & 15) === LITERAL && b(w(CLASSES) + b(w(r + R_PART + 4))) === 1 ? 1 : 0; }
  // (a parameter written without brackets: a word, else a word given a default or a type, `acc = 0`, `x: T`)
  function parameter_led(s: number, e: number) {
    if (worded(s, e)) return 1;
    let i = s; while (i < e && b(w(CLASSES) + b(i)) === 1) i++;
    if (i === s || i >= e || b(i) !== 32) return 0;
    while (i < e && b(i) === 32) i++;
    return i + 1 < e && ((b(i) === 61 && b(i + 1) === 32) || (b(i) === 58 && b(i + 1) === 32)) ? 1 : 0;
  }
  // (a member read alone, `.x` or `.a.b`: a `.`, then words each after a `.`)
  function membered(s: number, e: number) { s = skip(s, e); while (e > s && b(e - 1) <= 32) e--; if (s >= e || b(s) !== 46) return 0; for (let mi = s; mi < e; mi++) { const mc = b(mi); if (mc === 46 ? mi + 1 >= e || b(w(CLASSES) + b(mi + 1)) !== 1 : b(w(CLASSES) + mc) !== 1) return 0; } return 1; }
  function worded(s: number, e: number) { s = skip(s, e); while (e > s && b(e - 1) <= 32) e--; if (s >= e) return 0; for (let i = s; i < e; i++) if (b(w(CLASSES) + b(i)) !== 1) return 0; return 1; }
  // (a name declared where it is read: a place there, by that name)
  // (a place: a name given nothing yet, in self; read on, it answers what any value does, not what self has (where it is named,
  // kept by it))
  function place_of(s: number, e: number, self: number) { const p = node(IS_PLACE, s, e, w(GLOBAL) || self, 0); put(w(p + N_BASE) + R_CLOSURE, self); put(THREAD + T_NAMED, w(THREAD + T_NAMED) + 1); return p; }
  function place_in(p: number) { return w(w(p + N_BASE) + R_CLOSURE) || w(p + N_PARENT); }
  function placed(t: number, s: number, e: number, self: number) { s = skip(s, e); while (e > s && b(e - 1) <= 32) e--; return place_of(s, e, self); }
  // (what a hole's content reads names: each, where it is written, and how far what made it reaches (`x: T`))
  function declare(t: number, n: number, s: number, e: number) {
    if (!w(t + T_DECLS)) put(t + T_DECLS, alloc(12 * DECLS));
    const k = w(t + T_DECLS_N);
    if (k < DECLS) { const d = w(t + T_DECLS) + 12 * k; put(d, n); put(d + 4, s); put(d + 8, e); set(t + T_DECLS_N, k + 1); }
  }
  function extend(t: number, n: number, s: number, e: number) {
    if (s < w(t + T_HOLE_A) || e > w(t + T_HOLE_B)) return;
    for (let k = 0; k < w(t + T_DECLS_N); k++) { const d = w(t + T_DECLS) + 12 * k; if (w(d) === n) { if (s < w(d + 4)) put(d + 4, s); if (e > w(d + 8)) put(d + 8, e); } }
  }
  // (to one of the words the host knows, as a label)
  function jump(t: number, k: number, v: number) { put(t + T_JUMP_S, w(w(WORDS) + 8 * k)); put(t + T_JUMP_N, w(w(WORDS) + 8 * k + 4)); put(t + T_JUMP_V, v); }
  // (a rule made the last of a node's own: what read the node before still does)
  function link(self: number, rule: number) {
    // (when it was declared, among all: what binds looser is declared after)
    put(rule + R_STAMP, xadd(w(MAPPED) + 8 * M_SPAN + 8, 1) + 1);
    // (an operator defined again in the same node (`+ {other}`, accelerated in the kernel's map): it binds as the one before it
    // led by it, where that was declared)
    const q0 = rule + R_PART;
    if ((w(q0) & 15) === LITERAL && b(w(CLASSES) + b(w(q0 + 4))) === 2) {
      const oa = w(q0 + 4), on_ = w(q0 + 8);
      for (let o = latest(self), k = 0; o && !(w(o + R_FLAGS) & DEAD) && k < 4096; o = w(o), k++) { const q = o + R_PART; if ((w(q) & 15) === LITERAL && w(q + 8) === on_ && same(w(q + 4), oa, on_) && (w(o + R_PARTS) < 3 || (w(o + R_PART + 2 * PART) & 15) !== LITERAL)) { put(rule + R_STAMP, w(o + R_STAMP)); break; } }
    }
    if (older(self)) { const sh = shadow(self); if (sh) { put(rule + R_PREV, w(sh + 4)); signed(self, rule); skips(rule); put(sh + 4, rule); set(THREAD + T_SHGEN, w(THREAD + T_SHGEN) + 1); return; } }
    if (DEBUG && w(THREAD + T_REG_AT) && in_region(rule) && !in_region(self) && self !== w(THREAD + T_ROOT)) { const hd = w(rule + R_HEAD); debug(D_FAULT, 96, hd ? w(hd + N_A) : w(rule + R_BS), hd ? w(hd + N_B) : w(rule + R_BE)); }
    for (;;) { const last = w(self + N_LAST); put(rule + R_PREV, last); signed(self, rule); skips(rule); if (acas(self + N_LAST, last, rule) === last) return; }
  }
  // (a node's rules as far as this one, as one number: what their heads are written as, each in turn (a reading of the same
  // text, with the same rules written the same way before it, is the same reading: what a test made, another call made too))
  function signed(self: number, rule: number) {
    const pv = w(rule + R_PREV), hd = w(rule + R_HEAD), a = hd ? w(hd + N_A) : w(rule + R_BS), z = hd ? w(hd + N_B) : w(rule + R_BE);
    let h = mix(w(rule + R_KIND) * 7 + (w(rule + R_FLAGS) & ~DEAD) * 13 + w(rule + R_HOLES) * 3 + (z - a));
    if (hd) for (let i = a; i < z && i < a + 64; i++) h = mix(h + b(i));
    // (one a test writes on what was made before it (a shadow): signed with where it is, what it follows itself, not what that is
    // written as (two numbers made alike, a shadow on each, are two))
    put(rule + R_SIG, mix((pv && w(pv + R_OWNER) === self ? (w(THREAD + T_REG_AT) && !in_region(pv) ? pv : w(pv + R_SIG)) : w(THREAD + T_REG_AT) && !in_region(self) ? self : 0x51ed270b) + h));
  }
  // (what a reading keeps of where it is: what was made before the test, itself; the test's own, what it is written as)
  function kept_as(x: number): number { return x && w(THREAD + T_REG_AT) && in_region(x) ? w(x + R_SIG) ^ 0x6a09e667 : x; }
  // (the names a reading reads (a rule's holes, and the frames it was made in): the test's own, as written, and where its
  // inlined text was)
  function names_as(rule: number, closure: number): number {
    let h = 0x3c6ef372;
    for (let n = 0; n < 16 && (rule || closure); n++) {
      if (rule && !in_region(rule) && (!closure || !in_region(closure))) return mix(h + rule * 31 + closure);
      h = mix(h + (rule ? w(rule + R_SIG) + w(rule + R_INL_S) * 31 + w(rule + R_IN2_S) * 17 : 7));
      rule = closure ? w(closure + F_RULE) : 0; closure = closure ? w(closure + F_CLOSURE) : 0;
    }
    return h;
  }
  // (a reading that holds nothing of the test's own: it can be kept for all; what it read in, rebound where it is read again)
  function lasting(r: number): number {
    const k = w(r);
    if (k === K_RULE) return !in_region(w(r + 12)) && !w(r + 24) && (!w(r + 28) || lasting(w(r + 28))) ? 1 : 0;
    if (k === K_ON) return lasting(w(r + 12));
    if (k === K_REF || k === K_NAME) return !w(r + 20) || !in_region(w(r + 20)) ? 1 : 0;
    return k === K_EMPTY || k === K_HELD ? 1 : 0;
  }
  // (two readings the same: what reads, what each hole took)
  function alike_reading(a: number, c: number): number {
    if (w(a) !== w(c) || w(a + 4) !== w(c + 4) || w(a + 8) !== w(c + 8)) return 0;
    const k = w(a);
    if (k === K_ON) return alike_reading(w(a + 12), w(c + 12)) && w(a + 16) === w(c + 16) && w(a + 20) === w(c + 20) ? 1 : 0;
    if (k === K_RULE) { if (w(a + 12) !== w(c + 12)) return 0; for (let i = 0; i < 2 * w(w(a + 12) + R_HOLES); i++) if (w(w(a + 16) + 4 * i) !== w(w(c + 16) + 4 * i)) return 0; return 1; }
    if (k === K_REF || k === K_NAME) return w(a + 12) === w(c + 12) && w(a + 16) === w(c + 16) ? 1 : 0;
    if (k === K_HELD) return w(a + 12) === w(c + 12) ? 1 : 0;
    return 1;
  }
  function relit(r: number, vis: number): number {
    const k = w(r);
    if (k === K_ON) { const p = relit(w(r + 12), vis); if (p === w(r + 12)) return r; const c = alloc(READ); for (let i = 0; i < READ; i += 4) put(c + i, w(r + i)); put(c + 12, p); return c; }
    if (k !== K_RULE || w(r + 20) === vis) return r;
    const c = alloc(READ); for (let i = 0; i < READ; i += 4) put(c + i, w(r + i)); put(c + 20, vis); return c;
  }
  // (a reading copied where nothing lets go of it: what it took, and what it holds, too)
  function lasted(r: number): number {
    const k = w(r), c = xadd(HEAP, READ);
    if (DEBUG && w(THREAD + T_TESTING)) debug(D_FAULT, 1093, 3, READ);
    if (c < 0 || c > w(LIMIT) - READ) return 0;
    for (let i = 0; i < READ; i += 4) put(c + i, w(r + i));
    if (k === K_ON) { const p = lasted(w(r + 12)); if (!p) return 0; put(c + 12, p); }
    if (k === K_RULE) {
      const holes = w(w(r + 12) + R_HOLES), caps = w(r + 16);
      if (caps && holes) { const q = xadd(HEAP, 8 * holes); if (q < 0 || q > w(LIMIT) - 8 * holes) return 0; for (let i = 0; i < 2 * holes; i++) put(q + 4 * i, w(caps + 4 * i)); put(c + 16, q); }
      put(c + 20, 0);
      if (w(r + 28)) { const a = lasted(w(r + 28)); if (!a) return 0; put(c + 28, a); }
    }
    return c;
  }
  // (a rule's kind, as a reading looks for it: led by a hole (0), or by text, by which of 32 kinds its first character is)
  // (one led by a hole, by the first text in its head: 65 on, by which of 64 kinds its first character is (KINDS); none, 129)
  function kind_of(r: number) {
    if (w(r + R_FLAGS) & LED) return 1 + (b(w(r + R_PART + 4)) & 63);
    for (let k = 1; k < w(r + R_PARTS); k++) { const q = r + R_PART + PART * k; if ((w(q) & 15) === LITERAL && w(q + 8) > 0) return 65 + (b(w(CLASSES) + b(w(q + 4))) === 1 ? worded_kind(w(q + 4), w(q + 4) + w(q + 8)) : b(w(KINDS) + b(w(q + 4)))); }
    return 129;
  }
  // (a word, from p: of 31 kinds, by its characters (the kind its first text is, of a head whose first text is a word))
  function worded_kind(p: number, end: number) { let h = 0; for (const cl = w(CLASSES); p < end && b(cl + b(p)) === 1; p++) h = (h * 31 + b(p)) % 1000003; return 32 + h % 31; }
  // (for each kind, the next rule of it after this one, the rules before it: so a reading passes over the ones it can't be)
  // (only past `MANY` of them, where a reading passes over by kind: a node of a few rules is read one after another, its
  // rules without a table)
  function skips(r: number) {
    const p = w(r + R_PREV);
    const pt = p && !(w(p + R_FLAGS) & DEAD) ? w(p + R_SKIP) : 0;
    // (and where it was declared among the node's own: one after the one before it)
    let seq = 1;
    if (pt) seq = w(pt + 4 * SEQ_AT) + 1;
    else for (let o = p; o && seq <= MANY && !(w(o + R_FLAGS) & DEAD); o = w(o + R_PREV)) seq++;
    if (seq <= MANY) { put(r + R_SKIP, 0); return; }
    let tb = w(r + R_SKIP);
    if (!tb) { tb = alloc(4 * (SKIPS + 2)); put(r + R_SKIP, tb); }
    put(tb + 4 * KIND_AT, kind_of(r));
    put(tb + 4 * SEQ_AT, seq);
    if (!pt) { for (let k = 0; k < SKIPS; k++) put(tb + 4 * k, p); return; }
    for (let k = 0; k < SKIPS; k++) put(tb + 4 * k, w(pt + 4 * k));
    put(tb + 4 * w(pt + 4 * KIND_AT), p);
  }
  // A test's own: what it writes in a node made before it is a shadow of that node's rules, seen in that test (and the ones it
  // holds) only, so that it changes nothing another test reads (the test's own frame is its own).
  function older(n: number) {
    if (!w(THREAD + T_ISO) || n === w(THREAD + T_ROOT) || n >= w(THREAD + T_MARK) || in_region(n)) return 0;
    return n >= w(THREAD + T_MARK_LO) && n < w(THREAD + T_MARK_HI) ? 0 : 1;
  }
  // (a node's rules, the last of them: a test's shadow of them, where it has one)
  function latest(n: number) {
    const k = w(THREAD + T_SH_N);
    if (k) { const sh = w(THREAD + T_SH); for (let i = 0; i < k; i++) if (w(sh + 12 * i) === n) return w(sh + 12 * i + 4); }
    return w(n + N_LAST);
  }
  function shadow(n: number) {
    const k = w(THREAD + T_SH_N);
    if (!w(THREAD + T_SH)) put(THREAD + T_SH, alloc(12 * SHADOWS));
    const sh = w(THREAD + T_SH);
    for (let i = 0; i < k; i++) if (w(sh + 12 * i) === n) return sh + 12 * i;
    if (k >= SHADOWS) return 0;
    put(sh + 12 * k, n); put(sh + 12 * k + 4, w(n + N_LAST)); put(sh + 12 * k + 8, w(n + N_LAST)); set(THREAD + T_SH_N, k + 1); set(THREAD + T_SHGEN, w(THREAD + T_SHGEN) + 1);
    return sh + 12 * k;
  }
  // (isolated from here on: what is made from now is its own, what was made before it shadows)
  function isolate(t: number, root: number) { set(t + T_SHGEN, w(t + T_SHGEN) + 1); set(t + T_MARK, aload(HEAP)); set(t + T_MARK_LO, w(t + T_CHUNK)); set(t + T_MARK_HI, w(t + T_CHUNK_END)); set(t + T_SH_N, 0); put(t + T_ROOT, root); set(t + T_ISO, 1); }
  // A value, then the rest read on it: what that answers (and, at T_ON, the value). (What is read on a member, `x.f(y)`, is read
  // on what `f` is with x as `this`.)
  // (a node with a method led by a hole of its own (a closure's `{this}{argument}`))
  function methods_of(n: number): number { for (let o = latest(n), k = 0; o && o !== w(n + N_BASE) && k < 64; o = w(o), k++) if ((w(o + R_FLAGS) & (METHOD | LED | DEAD)) === METHOD) return 1; return 0; }
  // (what `this` is in an application: what it is read on (its receiver), else what its own node is made of, else its node)
  function held_this(fr: number): number { if (!fr || w(fr + N_IS) !== IS_FRAME || !w(fr + F_RULE) || !(w(w(fr + F_RULE) + R_FLAGS) & METHOD)) return 0; const th = w(fr + F_THIS), rc = w(fr + F_RECEIVER); return rc !== th ? rc : run_node(th) ? w(th + N_ALSO) : th; }
  // (a value code is read in that is not what the application runs on (nor its own node, nor what that is made of))
  function another(fr: number, self: number): number {
    if (!self || w(self + N_IS) === IS_FRAME || !fr || w(fr + N_IS) !== IS_FRAME) return 0;
    const th = w(fr + F_THIS), rc = w(fr + F_RECEIVER);
    if (self === th || self === rc || self === w(GLOBAL)) return 0;
    if (th && w(th + N_IS) === IS_NODE && w(th + N_ALSO) === self) return 0;
    if (rc && w(rc + N_IS) === IS_NODE && w(rc + N_ALSO) === self) return 0;
    if (w(self + N_IS) === IS_NODE && (w(self + N_PARENT) === th || w(self + N_PARENT) === rc)) return 0;
    return 1;
  }
  // (the name from s to e read on th: the same rule)
  function on_this(t: number, th: number, s: number, e: number, rule: number): number { if (w(rule + R_OWNER) === w(GLOBAL)) return 0; const r = reading(t, s, e, 0, 0, latest(th), th, 0, 0, 0, 0); return w(r) === K_RULE && w(r + 12) === rule ? 1 : 0; }
  function trim_end(s: number, e: number): number { while (e > s && b(e - 1) <= 32) e--; return e; }
  function onto(t: number, r: number, names: number, f: number, self: number, value: number, written: number): number {
    const p = w(r + 12);
    let on = 0, receiver = self;
    // (what the rest is read on: a value, in a left side too, `x` of `x.m`)
    const decl_in = w(t + T_DECL), declaring = decl_in;
    // (in a left side, brackets after it, `f (x)`, `x.m (y)`: it declared, a place, and they its head)
    const rs = skip(w(r + 16), w(r + 20));
    if (declaring && (!lefts() || in_left(rs, w(r + 20))) && rs < w(r + 20) && (bracket(rs, w(r + 20)) & 3) === 1 && bracket(rs, w(r + 20)) !== 5 + 8 * w(OPEN_LENGTH) && past(rs, w(r + 20)) >= w(r + 20)) {
      const ps = w(p + 4), pe = w(p + 8);
      // (a name written as written, `` `goto` (label) ``: the place it names, inside the backticks)
      const qs = skip(ps, pe), qe = trim_end(qs, pe), quoted = qe - qs > 2 && b(qs) === 96 && b(qe - 1) === 96 && (worded(qs + 1, qe - 1) || operated(qs + 1, qe - 1));
      const place = quoted ? placed(t, qs + 1, qe - 1, self) : worded(ps, pe) || operated(ps, pe) ? placed(t, ps, pe, self) : ev(t, p, names, f, self, 1, written, self);
      if (place && w(place + N_IS) === IS_PLACE) return node(IS_CALLED, rs, w(r + 20), place, 0);
    }
    // (what the rest is read on, a value: no part of a left side, `(value).this`)
    put(t + T_DECL, 0); const lb = w(t + T_LB); put(t + T_LB, w(t + T_LE));
    if (w(p) === K_ON) { on = onto(t, p, names, f, self, 1, written); receiver = w(t + T_ON); }
    // (a value read where it is written, not as a member of another (`f(5)`, `body(x)`): what follows is read on it alone)
    // (the member a `.{member}` reads, `x.f(y)`'s `f`: what follows is read on it as x's)
    else {
      const member = w(t + T_MEMBER) === self; on = ev(t, p, names, f, self, 1, written, self); if (!member && written === self) receiver = on;
      // (a name written bare in a method's body that is a member of what the method runs on, `gcd(other)` in `lcm`: read on
      // that, as `this.gcd(other)` is)
      if (!member && on && w(on + N_IS) === IS_NODE && w(p) === K_RULE && worded(w(p + 4), w(p + 8))) { const th = held_this(names); if (th && th !== w(GLOBAL) && th !== on && w(th + N_IS) !== IS_FRAME && on_this(t, th, w(p + 4), w(p + 8), w(p + 12))) receiver = th; }
    }
    put(t + T_DECL, declaring); put(t + T_LB, lb);
    if (stopped(t)) { put(t + T_DECL, decl_in); return 0; }
    // (in a left side, a closure and a name after it, `xs.for x`: not called here; the `=>` behind it makes the rest of the line
    // its argument, `xs.for(x => body)`)
    if (declaring && on && w(on + N_IS) === IS_NODE && on !== w(GLOBAL) && in_left(rs, w(r + 20)) && worded(rs, w(r + 20)) && methods_of(on)) { put(t + T_DECL, decl_in); return node(IS_APPLIED, w(r + 4), rs, w(r + 20), 0); }
    // (nothing: what the kernel's nothing is (`None`, by the kernel's map), else the language)
    if (!on) on = w(NOTHING) || w(GLOBAL);
    // (one of Number's own operators the kernel's map names, read on what it counts, what it takes counted too: answered by the
    // kernel, as the language's rule answers)
    // (or read as the operator after the value, then what it takes on what that answers, `((12 + 12) ==)(24)`: the operator's
    // rule, read on the value again (kept))
    let nrule = w(p) === K_RULE ? w(p + 12) : 0, nself = self;
    if (w(NUMBER_OPS) && w(p) === K_ON && rs < w(r + 20) && receiver && receiver !== self) { const o = reading(t, w(p + 16), w(p + 20), w(names + F_RULE), w(names + F_CLOSURE), latest(receiver), receiver, LED, 0, 0, 1); if (w(o) === K_RULE) { nrule = w(o + 12); nself = receiver; } }
    if (w(NUMBER_OPS) && nrule && rs < w(r + 20) && number_op(nrule) === 61 && nself && w(nself + N_IS) === IS_TEXT) { const y = block(t, rs, w(r + 20), names, f, written, 0, 1, 0, written, 0); if (stopped(t)) { put(t + T_DECL, decl_in); return 0; } if (y && w(y + N_IS) === IS_TEXT && w(TRUE_)) { const n = w(nself + N_B) - w(nself + N_A); put(t + T_ON, on); put(t + T_DECL, decl_in); return n === w(y + N_B) - w(y + N_A) && same(w(nself + N_A), w(y + N_A), n) ? w(TRUE_) : w(FALSE_); } }
    // (of a character: and characters superposed, `\s`, whether it is one of them; and a text, equal when the text is only it)
    if (w(NUMBER_OPS) && nrule && rs < w(r + 20)) { const op = number_op(nrule); if (op && op !== 115) { const cx = count_of(t, nself, names, f); if (cx >= 0) { const y = block(t, rs, w(r + 20), names, f, written, 0, 1, 0, written, 0); if (stopped(t)) { put(t + T_DECL, decl_in); return 0; } if (op === 61 && y && w(y + N_IS) === IS_NODE && w(CHARS) && w(nself + N_PARENT) === w(CHARS) && w(TRUE_)) { const ca = chars_among(t, y, cx); if (ca >= 0) { put(t + T_ON, on); put(t + T_DECL, decl_in); return ca ? w(TRUE_) : w(FALSE_); } } let cy = count_of(t, y, names, f); if (cy < 0 && op === 61 && y && w(y + N_IS) === IS_TEXT && w(CHARS) && w(nself + N_PARENT) === w(CHARS) && w(TRUE_)) { put(t + T_ON, on); put(t + T_DECL, decl_in); return span_char(w(y + N_A), w(y + N_B)) === cx ? w(TRUE_) : w(FALSE_); } if (cy >= 0) { const v = number_answer(op, cx, cy); if (v >= 0) { put(t + T_ON, on); put(t + T_DECL, decl_in); return v; } } } } }
    // (an argument after it, not an operator, a member or brackets: its own methods led by a hole first (a closure's
    // `{this}{argument}`: `f x`, `..9`, `.."9"`); then what is led by text (`(…)`, its `{this}(…)`); the language's own,
    // `{this}{rest}`, only when none of those reads)
    // (but a word that leads a rule of more than itself, `checked {type}`, `is {type}`: that rule, not an argument (a closure
    // called on `checked (T)`))
    const kw = w(on + N_IS) === IS_NODE && on !== w(GLOBAL) && rs < w(r + 20) && b(w(CLASSES) + b(rs)) === 1 && methods_of(on) ? reading(t, w(r + 16), w(r + 20), w(names + F_RULE), w(names + F_CLOSURE), latest(on), on, LED, 0, 0, 1) : 0;
    let rest = kw && w(kw) === K_RULE && word_headed(w(kw + 12)) ? kw : 0;
    if (!rest) rest = w(on + N_IS) === IS_NODE && on !== w(GLOBAL) && rs < w(r + 20) && b(w(CLASSES) + b(rs)) !== 2 && (bracket(rs, w(r + 20)) & 3) !== 1 && methods_of(on) ? reading(t, w(r + 16), w(r + 20), w(names + F_RULE), w(names + F_CLOSURE), latest(on), on, METHOD, w(on + N_BASE), 0, 1) : 0;
    if (!rest || w(rest) !== K_RULE) rest = reading(t, w(r + 16), w(r + 20), w(names + F_RULE), w(names + F_CLOSURE), latest(on), on, LED, 0, 0, 1);
    // (a rule never reads itself: what its own body reads on a value that reads as that rule (`as * => ((this as *), …)`),
    // read with the rules before it)
    // (and when several rules share that body (made by one rule, `as (=== T)` written twice), the one running reads the ones
    // before it)
    // (and on the very value it runs on, `this as *` in a conversion of a class another's conversion reached: the ones before it
    // too, wherever they are written)
    const itself = on === w(names + F_THIS) || on === w(names + F_RECEIVER);
    // (not in what it inlined, `{{body}}` (a closure's own code, its calls of itself: recursion))
    const running = w(rest) === K_RULE && w(names + F_RULE) && in_body(w(names + F_RULE), w(r + 16)) && !inlined_at(w(names + F_RULE), w(r + 16)) && ((itself && w(names + F_RULE) === w(rest + 12)) || ((itself || (w(w(rest + 12) + R_OWNER) === w(w(names + F_RULE) + R_OWNER) && w(rest + 12) !== w(names + F_RULE))) && alike(w(rest + 12), w(names + F_RULE)))) ? w(names + F_RULE) : 0;
    // (on another value it is the rule itself, called again: recursion, `pred!` in `!`)
    if (w(rest) === K_RULE && (running || (itself && in_body(w(rest + 12), w(r + 16)) && !inlined_at(w(rest + 12), w(r + 16)))) && w((running || w(rest + 12)) + R_PREV)) { const skipped = w(t + T_SKIP); put(t + T_SKIP, running || w(rest + 12)); const again = reading(t, w(r + 16), w(r + 20), w(names + F_RULE), w(names + F_CLOSURE), w((running || w(rest + 12)) + R_PREV), on, LED, 0, 0, 1); put(t + T_SKIP, skipped); if (DEBUG && w(again) === K_UNREAD) debug(D_FAULT, 91, w(r + 16), w(r + 20)); if (w(again) !== K_UNREAD) rest = again; }
    let nm = names, wr = written, rs2 = w(r + 16), re2 = w(r + 20);
    // (what is read on it a hole's code, `{rest}`: that code, read on it where it was written)
    if (w(rest) === K_REF) {
      const tk = follow(take(w(rest + 20) || names, w(rest + 12), w(rest + 16)), 0);
      nm = w(tk + T_ORIGIN) || names; wr = w(tk + T_THIS) || written; rs2 = w(tk); re2 = w(tk + 4);
      rest = reading(t, rs2, re2, w(nm + F_RULE), w(nm + F_CLOSURE), latest(on), on, LED, 0, 0, 1);
    }
    // (what no rule led by text reads on it: a method led by a hole may, the language's own (`{this}{rest}`: through what it
    // converts to); not within one)
    let fell = 0;
    // (read only by what everything has (`1`, global), on a value with methods (a closure, `==` of `gcd(other) == 1`): its
    // argument; RB2) (but not what an operator leads, `.member`: a member is not an argument, CL19)
    if (w(rest) === K_RULE && w(w(rest + 12) + R_OWNER) === w(GLOBAL) && on !== w(GLOBAL) && b(w(CLASSES) + b(rs2)) !== 2 && !word_headed(w(rest + 12)) && methods_of(on)) { const m = reading(t, rs2, re2, w(nm + F_RULE), w(nm + F_CLOSURE), latest(on), on, METHOD, 0, 0, 1); if (w(m) === K_RULE) rest = m; }
    // (a word and what follows it, not read on a value, `min 5` on 2 of `2 min 5`: a method of the value called on what follows
    // it without brackets, operator-named or not (`double 4`), as `.min 5` reads it, the value's member, then what follows on that)
    if (w(rest) === K_UNREAD && value && !w(t + T_DECL) && on !== w(GLOBAL) && (w(on + N_IS) === IS_NODE || w(on + N_IS) === IS_TEXT)) {
      const iw_s = skip(rs2, re2);
      let iw_z = iw_s;
      while (iw_z < re2 && b(w(CLASSES) + b(iw_z)) === 1) iw_z++;
      if (iw_z > iw_s && iw_z < re2 && b(iw_z) <= 32 && skip(iw_z, re2) < trim_end(rs2, re2)) {
        const iw_m = w(t + T_MEMBER), iw_ms = w(t + T_MEMBER_S), iw_me = w(t + T_MEMBER_E);
        put(t + T_MEMBER, on); put(t + T_MEMBER_S, iw_s); put(t + T_MEMBER_E, re2);
        const iw_v = block(t, iw_s, re2, nm, f, on, 0, value, 1, on, 0);
        put(t + T_MEMBER, iw_m); put(t + T_MEMBER_S, iw_ms); put(t + T_MEMBER_E, iw_me);
        if (stopped(t)) { put(t + T_DECL, decl_in); return 0; }
        if (iw_v) { put(t + T_ON, on); put(t + T_DECL, decl_in); return iw_v; }
      }
    }
    if (w(rest) === K_UNREAD && !w(t + T_FALLBACK)) { rest = reading(t, rs2, re2, w(nm + F_RULE), w(nm + F_CLOSURE), latest(on), on, METHOD, 0, 0, 1); fell = w(rest) === K_RULE ? 1 : 0; }
    if (w(rest) !== K_UNREAD) {
      // (a method of a value it is made of, `+` of the 3 in a vertex `3 + Ray`: what it runs on, that value)
      const via = w(rest) === K_RULE ? w(rest + 24) : 0; if (via) { on = via; receiver = via; }
      // (a rule led by `.` read on a value, `xs.rest.f{p}(…)`: a member of that value, it its receiver, not what it was read in)
      else if (w(rest) === K_RULE && dotted(w(rest + 12))) receiver = on;
      const fb = w(t + T_FALLBACK); if (fell) put(t + T_FALLBACK, 1);
      const v: number = ev(t, rest, nm, f, on, value, wr, receiver);
      put(t + T_FALLBACK, fb); put(t + T_ON, on); put(t + T_DECL, decl_in);
      return v;
    }
    // (a member that is not there, of a value: None (§5, a missing member reads as None); what its own `missing` answers,
    // when it has one)
    if (on !== w(GLOBAL) && (w(on + N_IS) === IS_NODE || w(on + N_IS) === IS_TEXT) && worded(skip(rs2, re2), trim_end(rs2, re2)) && !w(t + T_DECL) && b(skip(rs2, re2) - 1) === 46) { put(t + T_ON, on); put(t + T_DECL, decl_in); return missed(t, on, skip(rs2, re2), trim_end(rs2, re2)); }
    // (an operator written against what follows it, `-other` in a method (`-` bare, a member of `this`): read right-to-left,
    // that value's own operator, `(other).-`)
    // (through a hole's code, `{this}{rest}`: the operator written before where it was taken)
    if (value && !w(t + T_DECL) && b(w(CLASSES) + b(rs2)) === 1) { let a = rs2; while (a > 0 && b(w(CLASSES) + b(a - 1)) === 2 && b(a - 1) !== 46) a--; if (a < rs2 && (a === 0 || b(a - 1) <= 32 || b(a - 1) === 40 || b(a - 1) === 44)) { const v = prefixed(t, a, rs2, trim_end(rs2, re2), nm, wr || self); if (v) { put(t + T_ON, on); put(t + T_DECL, decl_in); return v; } } }
    // (said where what is read was written: a hole's code (`{rest}` of the language's own), where it was taken)
    if (DEBUG) debug(D_FAULT, 1111, w(r + 4), re2);
    say(t, rs2, L_NOT_ON, rs2, re2);
    put(t + T_ON, on); put(t + T_DECL, decl_in);
    return 0;
  }
  // Code read (in `self`; in brackets, what is inside them): each statement, the last one's value.
  // (the comments on lines of their own from s to e, for what is painted: each a frame of the language's comment after a
  // statement (the latest `{statement} // {comment}`), what it took nothing, so the line is shown as that rule is; not read (a
  // comment that says `{x} => …` would define it)) TODO(explicit)
  function comments_read(t: number, s: number, e: number, scope: number) {
    // (the language's, the latest: of those defined since the one found before, else that one)
    let rule = w(t + T_CRULE);
    for (let r = latest(w(GLOBAL)), k = 0; r && r !== w(t + T_CRULE) && k < 1 << 16; r = w(r), k++) { const lit = r + R_PART + 2 * PART; if (!(w(r + R_FLAGS) & DEAD) && w(r + R_PARTS) === 5 && (w(r + R_PART) & 15) === HOLE && (w(lit) & 15) === LITERAL && w(lit + 8) === 2 && b(w(lit + 4)) === 47 && b(w(lit + 4) + 1) === 47 && (w(r + R_PART + 4 * PART) & 15) === HOLE) { rule = r; break; } }
    if (!rule) return;
    set(t + T_CRULE, rule);
    let at = s;
    while (at < e) {
      while (at < e && b(at) <= 32) at++;
      let q = at; while (q < e && b(q) !== 10) q++;
      if (q > at + 1 && b(at) === 47 && b(at + 1) === 47) { const caps = alloc(16); set(caps, at); set(caps + 4, at); set(caps + 8, q); set(caps + 12, q); frame(rule, 0, scope, at, q, caps, 0, scope, scope); }
      at = q;
    }
  }
  function block(t: number, s: number, e: number, names: number, f: number, self: number, vis: number, value: number, brackets: number, written: number, lex: number): number {
    if (brackets) { code(t, s, e); s = w(t + T_A); e = w(t + T_B); }
    // (read in what it reads, too deep: a hole whose code is read as itself)
    const depth = w(t + T_DEPTH);
    if (depth >= DEPTH) { if (!w(t + T_FAULT)) { if (DEBUG) debug(D_FAULT, L_DEEP, s, e); deep(t, depth); } put(t + T_FAULT, L_DEEP); return 0; }
    if (w(t + T_STACK)) { put(w(t + T_STACK) + 8 * depth, 0); put(w(t + T_STACK) + 8 * depth + 4, s); }
    set(t + T_DEPTH, depth + 1);
    // (code read in a value it was not written in, `x.( … )`: where it was written, for what x does not read; its own only)
    // (and its arguments, read in x too: where it was written, for what x does not read (`2.(1 + y)`, y the caller's))
    const writer = w(t + T_WRITER) && (w(t + T_WRITER_SELF) === self) ? w(t + T_WRITER) : 0;
    if (DEBUG) debug(D_BLOCK, s, e, self);
    let answer = 0;
    const hoisting = w(t + 1020) === depth + 1;
    let pv = s;
    for (let at = skip(s, e); at < e; at = skip(at, e)) {
      const ln = line(at, e), last = skip(ln, e) >= e ? 1 : 0;
      // (painted (`T_PAINTS`): each comment on a line of its own before it, read as what it is, `// …`) TODO(explicit)
      if (w(t + T_PAINTS) && pv < at) comments_read(t, pv, at, self);
      pv = ln;
      if (hoisting && (hoisted(at, ln) || given_here(self, at, ln))) { at = ln; continue; }
      // (the text a value is spliced in as while a level reads it, `external level_reads L v`, wherever it is read: v)
      if (w(t + T_SPLICE) && skip(at, ln) === w(t + T_SPLICE) && trim_end(at, ln) === w(t + T_SPLICE) + 2) { answer = w(t + T_SPLICE_V); at = ln; continue; }
      // (a typed hole's code: read by its type's own rules; what none of them reads (a value of it, by its name), where it was written)
      // (the member a `.{member}` reads, `x.name`: read as x's (VALUE_OWN))
      const as_member = w(t + T_MEMBER) === self && at >= w(t + T_MEMBER_S) && at < w(t + T_MEMBER_E) && self !== w(GLOBAL) ? VALUE_OWN : 0;
      let r = reading(t, at, ln, w(names + F_RULE), w(names + F_CLOSURE), vis ? latest(vis) : latest(self), self, 0, vis ? w(vis + N_BASE) : 0, as_member, 0);
      // (what reads it where it is written binding looser than the type's own (declared after it, `,`): that first, its parts
      // then read by the type; not a reader, a head of one hole (`{numeral: Digits}`: it would read itself))
      if (vis && w(r) === K_RULE) { const r2 = reading(t, at, ln, w(names + F_RULE), w(names + F_CLOSURE), latest(self), self, 0, 0, 0, 0); if (w(r2) === K_RULE && w(r2 + 12) !== w(r + 12) && !(w(w(r2 + 12) + R_FLAGS) & READER) && declared_at(w(r2 + 12)) > declared_at(w(r + 12))) r = r2; }
      if (vis && w(r) === K_UNREAD) r = reading(t, at, ln, w(names + F_RULE), w(names + F_CLOSURE), latest(self), self, 0, 0, 0, 0);
      // (TODO(explicit): a bare name in a method's body, the one what it runs on has of its own, when it has one (its block, the
      // constructor, gave it: `rules` of `Node`), before the class's)
      if (w(r) === K_RULE) { const x = w(r + 12), rv = run_node(self) ? w(self + N_ALSO) : (w(names + N_IS) === IS_FRAME && w(names + F_RULE) && (w(w(names + F_RULE) + R_FLAGS) & METHOD) ? w(names + F_THIS) : 0), hd = x ? w(x + R_HEAD) : 0; if (hd && !w(x + R_HOLES) && rv && w(rv + N_IS) === IS_NODE && w(x + R_OWNER) !== rv && w(x + R_OWNER) && made_of_deep(rv, w(x + R_OWNER), 0)) for (let fr = latest(rv), k = 0; fr && fr !== w(rv + N_BASE) && k < 256; fr = w(fr), k++) { const fh = w(fr + R_HEAD); if (fr !== x && !w(fr + R_HOLES) && fh && !(w(fr + R_FLAGS) & DEAD) && trimmed(w(fh + N_A), w(fh + N_B) - w(fh + N_A), w(hd + N_A), w(hd + N_B))) { if (w(fr + R_KIND) === w(x + R_KIND)) put(r + 12, fr); break; } } }
      // (code read in a value it was not written in, `x.( … )`: what x does not read, read where it was written)
      if (w(r) === K_UNREAD && writer && writer !== self) r = reading(t, at, ln, w(names + F_RULE), w(names + F_CLOSURE), latest(writer), writer, 0, 0, 0, 0);
      // (a member that is not there, read as one, `x.missing`: nothing (§5))
      if (w(r) === K_UNREAD && w(t + T_MEMBER) && at >= w(t + T_MEMBER_S) && at < w(t + T_MEMBER_E) && worded(at, ln) && !w(t + T_DECL) && self !== w(GLOBAL)) { answer = missed(t, self, skip(at, ln), trim_end(at, ln)); at = ln; continue; }
      // (a rule never reads itself: code written in a rule's own body that reads as that rule (`String => this as String`,
      // its `String`), read with the rules before it)
      // (only while that rule is what is read: a closure it made, called later, reads it again (recursion))
      // (and only on the value it runs on: read in another one, `inner.f` in `f`, it is that one's, called again (recursion))
      if (w(r) === K_RULE && in_body(w(r + 12), at) && w(w(r + 12) + R_PREV) && w(names + F_RULE) === w(r + 12) && !another(names, self)) { const again = reading(t, at, ln, w(names + F_RULE), w(names + F_CLOSURE), w(w(r + 12) + R_PREV), self, 0, 0, 0, 0); if (w(again) !== K_UNREAD) r = again; }
      const grew0 = DEBUG || MEMREP ? w(t + T_GREW) : 0;
      answer = ev(t, r, names, f, self, value & last, written, self);
      if ((DEBUG || MEMREP) && w(t + T_GREW) - grew0 > 8 << 20) debug(D_FAULT, 1096, at, (w(t + T_GREW) - grew0) >> 20);
      if (stopped(t)) { set(t + T_DEPTH, depth); if (DEBUG) debug(D_BLOCK_END, s, e, 0); return 0; }
      at = ln;
    }
    if (w(t + T_PAINTS) && pv < e) comments_read(t, pv, e, self);
    set(t + T_DEPTH, depth);
    if (DEBUG) debug(D_BLOCK_END, s, e, answer);
    return answer;
  }

  // (accelerated, `taking` in the kernel's map: one parameter, a name, given one value, not by name: that name defined where
  // the call runs, its body the call's `passed` (what `({written_parameters}) := passed` defines); anything else, the body)
  function spans(rule: number) {
    const at = w(MAPPED) + 8 * M_SPAN, bs = w(rule + R_BS), be = w(rule + R_BE), word = w(rule + R_PART + PART * (w(rule + R_PARTS) - 1) + 4);
    // (the last hole's name in its body, written last: what the parameters are given)
    let he = word; while (b(w(CLASSES) + b(he)) === 1) he++;
    const hs = word, n = he - hs;
    for (let i = be - n; i >= bs; i--) if (same(i, hs, n) && (i === bs || b(w(CLASSES) + b(i - 1)) !== 1) && (i + n >= be || b(w(CLASSES) + b(i + n)) !== 1)) { put(at, i); put(at + 4, i + n); return; }
  }
  function took(t: number, f: number, self: number): number {
    const at = w(MAPPED) + 8 * M_SPAN, ps = w(at), pe = w(at + 4);
    if (!ps || (w(FAIL_FAST) & 8192)) return 0;
    const pt = f + F_TAKES, s = skip(w(pt), w(pt + 4)); let e = w(pt + 4); while (e > s && b(e - 1) <= 32) e--;
    if (follow(pt, 1) !== pt) return 0;
    if (!worded(s, e)) return (w(FAIL_FAST) & 512) ? 0 : took_each(t, f, self, s, e);
    // (one value, not given by name: no `,` or `:` outside brackets in what was passed)
    const at_ = follow(f + F_TAKES + TAKE, 1), z = w(at_ + 4);
    let i = w(at_);
    while (i < z) { if (bracket(i, z) & 1) i = past(i, z); else { if (b(i) === 44 || b(i) === 58) return 0; i++; } }
    const v = valued(t, f + F_TAKES + TAKE);
    if (stopped(t)) return 0;
    if (!v || w(v + N_IS) === IS_PLACE) return 0;
    // (where the language's `({written_parameters}) := passed` defines it: the parameter read as a left side, as it does,
    // the place that answers; one that is no place, the language's body)
    const src = follow(pt, 1), declaring = w(t + T_DECL), pushed = push_left(w(src), w(src + 4));
    const defin = w(t + T_DEFIN); put(t + T_DECL, 1); put(t + T_DEFIN, self); const pv = valued(t, pt); put(t + T_DECL, declaring); put(t + T_LE, pushed); put(t + T_DEFIN, defin);
    if (stopped(t) || !pv || w(pv + N_IS) !== IS_PLACE || !place_in(pv)) return 0;
    const into = place_in(pv);
    const r = rule_(t, into, s, e, ps, pe, f, f);
    if (w(FAIL_FAST) & 2) log(s, L_DEFINED, s, e); put(t + T_NAMED, w(t + T_NAMED) + 1);
    if (DEBUG) debug(D_DEFINE, s, e, into);
    return w(r + R_HEAD);
  }
  // (and several, `(a, b)`, each a name, given a list a `,` made of as many values, none by name: each defined in the node the
  // call runs in, what the language's `({written_parameters}) := passed` does with them; anything else, the body)
  function took_each(t: number, f: number, self: number, s: number, e: number): number {
    let names = 0, from = s;
    for (let q = s; q <= e; q++) {
      if (q < e && (bracket(q, e) & 3)) return 0;
      if (q === e || b(q) === 44) { const a0 = skip(from, q); let a1 = q; while (a1 > a0 && b(a1 - 1) <= 32) a1--; if (!worded(a0, a1)) return 0; names++; from = q + 1; }
    }
    if (names < 2) return 0;
    const at_ = follow(f + F_TAKES + TAKE, 1), z = w(at_ + 4);
    let i = w(at_);
    while (i < z) { if (bracket(i, z) & 1) i = past(i, z); else { if (b(i) === 58) return 0; i++; } }
    // (what was passed, not yet read, read as a value where it was written: each of its parts on its own, the list a `,`
    // makes of them not made)
    const passed = f + F_TAKES + TAKE;
    if (!aload(passed + T_STATE) && !aload(at_ + T_STATE) && !w(at_ + T_VIS) && !older(at_) && !w(t + T_GIVEN_N) && !(w(FAIL_FAST) & 4096) && !in_left(w(at_), z)) {
      const d = took_parts(t, self, s, e, names, at_);
      if (d !== -1) return d;
    }
    const v = valued(t, f + F_TAKES + TAKE);
    if (stopped(t) || !v || w(v + N_IS) !== IS_NODE || held(t, v, W_LISTING, 0) !== w(TRUE_)) return 0;
    let count = 0;
    for (let l = held(t, v, W_HEAD, 0); l && l !== w(NOTHING) && count <= names; l = held(t, l, W_NEXT, 0)) count++;
    if (count !== names || stopped(t)) return 0;
    let named = 0, l = held(t, v, W_HEAD, 0);
    from = s;
    for (let q = s; q <= e; q++) {
      if (q === e || b(q) === 44) {
        const a0 = skip(from, q); let a1 = q; while (a1 > a0 && b(a1 - 1) <= 32) a1--;
        named = bound(a0, a1, self, held(t, l, W_VALUE, 0));
        if (w(FAIL_FAST) & 2) log(a0, L_DEFINED, a0, a1); put(t + T_NAMED, w(t + T_NAMED) + 1);
        l = held(t, l, W_NEXT, 0); from = q + 1;
      }
    }
    return stopped(t) ? 0 : named;
  }
  // (its parts, between the `,`s outside brackets, as many as the names, none empty (else -1, nothing read): each read in
  // turn, a list among them in its place as `,` puts it, its values (the last one's only when it is a list a `,` made, or
  // the one before it is a list); as many values as names, each name given its own)
  // (a part `,` reads on the one before it (`1, +2`, `1, (x) => x + 1`): led by an operator, or a closure written as one, its
  // arrow outside brackets)
  function composed_on(p0: number, p1: number): number {
    const c = b(p0);
    if (c !== 40 && c !== 91 && c !== 123 && c !== 34 && c !== 96 && c !== 39 && b(w(CLASSES) + c) !== 1 && !(c >= 48 && c <= 57)) return 1;
    for (let q = p0; q < p1 - 1;) { if (bracket(q, p1) & 1) { q = past(q, p1); continue; } if (b(q) === 61 && b(q + 1) === 62) return 1; q++; }
    return 0;
  }
  function listing_of(t: number, v: number): number { return v && w(v + N_IS) === IS_NODE && held(t, v, W_LISTING, 0) === w(TRUE_) ? 1 : 0; }
  function took_parts(t: number, self: number, s: number, e: number, names: number, o: number): number {
    const a = w(o), z = w(o + 4), origin = w(o + T_ORIGIN), th = w(o + T_THIS), lex = w(o + T_LEX);
    let parts = 0, from = a;
    for (let q = a; q <= z;) {
      if (q < z && (bracket(q, z) & 1)) { q = past(q, z); continue; }
      if (q === z || b(q) === 44) { const p0 = skip(from, q); let p1 = q; while (p1 > p0 && b(p1 - 1) <= 32) p1--; if (p0 >= p1 || (parts && composed_on(p0, p1))) return -1; parts++; from = q + 1; }
      q++;
    }
    if (parts !== names) return -1;
    const vals = alloc(4 * parts);
    let k = 0, listed = 0;
    from = a;
    for (let q = a; q <= z;) {
      if (q < z && (bracket(q, z) & 1)) { q = past(q, z); continue; }
      if (q === z || b(q) === 44) {
        const v = block(t, from, q, origin, origin, th, 0, 1, 0, th, lex);
        if (stopped(t)) return 0;
        put(vals + 4 * k, v); if (listing_of(t, v)) listed = 1; k++; from = q + 1;
      }
      q++;
    }
    let els = vals, n = parts;
    if (listed) {
      els = alloc(4 * (names + 1)); n = 0;
      for (let p = 0; p < parts; p++) {
        const v = w(vals + 4 * p), lists = listing_of(t, v);
        const spread = p < parts - 1 ? lists : lists && (listing_of(t, w(vals + 4 * (p - 1))) || held(t, v, W_SPREAD, 0) === w(TRUE_)) ? 1 : 0;
        if (spread) { for (let l = held(t, v, W_HEAD, 0); l && l !== w(NOTHING); l = held(t, l, W_NEXT, 0)) { if (n > names) return 0; put(els + 4 * n, held(t, l, W_VALUE, 0)); n++; } }
        else { if (n > names) return 0; put(els + 4 * n, v); n++; }
        if (stopped(t)) return 0;
      }
      if (n !== names) return 0;
    }
    let named = 0;
    k = 0; from = s;
    for (let q = s; q <= e; q++) {
      if (q === e || b(q) === 44) {
        const a0 = skip(from, q); let a1 = q; while (a1 > a0 && b(a1 - 1) <= 32) a1--;
        named = bound(a0, a1, self, w(els + 4 * k));
        if (w(FAIL_FAST) & 2) log(a0, L_DEFINED, a0, a1); put(t + T_NAMED, w(t + T_NAMED) + 1);
        k++; from = q + 1;
      }
    }
    return stopped(t) ? 0 : named;
  }
  // (a rule composing what its holes take: two or more, the text between them characters each on its own (`,`), no operator
  // and no bracket or quote)
  function composes(rule: number): number {
    if (w(rule + R_HOLES) < 2) return 0;
    let lit = 0;
    for (let k = 0; k < w(rule + R_PARTS); k++) {
      const q = rule + R_PART + PART * k;
      if ((w(q) & 15) !== LITERAL) continue;
      for (let i = 0; i < w(q + 8); i++) { const c = b(w(q + 4) + i); if (c <= 32) continue; if (b(w(CLASSES) + c) !== 3 || c === 40 || c === 41 || c === 91 || c === 93 || c === 123 || c === 125 || c === 34 || c === 39 || c === 96) return 0; lit = 1; }
    }
    return lit;
  }
  // (when a rule was declared, the order rules bind in: what was linked after binds looser)
  function declared_at(rule: number): number { return w(rule + R_STAMP); }
  // A rule applied: a frame for what its holes took (written with `names`, run from `f`, in `self`).
  // (what an application made is let go of when it returns, unless something made before it was given a place in it (a write
  // `put` saw), or it answers one: its memory zeroed, allocation back where it began; `RAY_NOFREE`, kept)
  function apply(t: number, rule: number, caps: number, names: number, f: number, self: number, s: number, e: number, written: number, on: number): number {
    const v = !w(t + T_TRACE_MAX) ? freeing(t, rule, caps, names, f, self, s, e, written, on) : traced(t, rule, caps, names, f, self, s, e, written, on);
    return v && (w(rule + R_FLAGS) & TYPED_READ) && w(v + N_IS) === IS_TEXT ? typed_read(t, rule, v) : v;
  }
  // (`RAY_TRACE=file:line`: from the rule read there, each rule applied told, how deep, its head and the text it reads)
  function traced(t: number, rule: number, caps: number, names: number, f: number, self: number, s: number, e: number, written: number, on: number): number {
    const armed = w(t + T_TRACE_ARM) === rule && !w(t + T_TRACE_ON);
    if (armed) { set(t + T_TRACE_ARM, 0); set(t + T_TRACE_ON, 1); set(t + T_TRACE_D, 0); }
    const tracing = w(t + T_TRACE_ON), d = w(t + T_TRACE_D), told_ = tracing && d < w(t + T_TRACE_DEPTH) && w(t + T_TRACE_N) < w(t + T_TRACE_MAX) ? 1 : 0;
    if (tracing) {
      if (told_) { set(t + T_TRACE_N, w(t + T_TRACE_N) + 1); set(t + T_TRACE_E, e); set(t + 932, on); set(t + 936, self); const hd = w(rule + R_HEAD); told(s, L_TRACE, hd ? w(hd + N_A) : 0, hd ? w(hd + N_B) : 0); }
      set(t + T_TRACE_D, d + 1);
    }
    const v = freeing(t, rule, caps, names, f, self, s, e, written, on);
    if (tracing) set(t + T_TRACE_D, d);
    if (told_) told(v, L_TRACE_DONE, s, e);
    if (armed) set(t + T_TRACE_ON, 0);
    return v;
  }
  // (applied, and what it made let go of when nothing kept it)
  // (which of what an application made holds a place, from start to now (a pointer to one's size, its end: the one before it);
  // none, -1)
  function ev_find(x: number, start: number, now: number, idx: number, n: number): number {
    if (x <= start || x > now) return -1;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (w(idx + 4 * mid) < x) lo = mid; else hi = mid - 1; }
    const o = w(idx + 4 * lo); if (o >= x) return -1;
    return x <= o + 4 + (w(o) & EV_SIZE) ? lo : -1;
  }
  // (one kept, and what it holds, in turn: marked; past what can be held, -1)
  function ev_mark(x: number, start: number, now: number, idx: number, n: number, wk: number, wn: number, wcap: number): number {
    if (wn < 0) return wn;
    const i = ev_find(x, start, now, idx, n); if (i < 0) return wn;
    const o = w(idx + 4 * i), h = w(o); if (h & EV_MARK) return wn;
    set(o, h | EV_MARK);
    if (wn >= wcap) return -1;
    set(wk + 4 * wn, i); return wn + 1;
  }
  // (one of what it made, not kept)
  function ev_dead(x: number, start: number, now: number, idx: number, n: number): number { const i = ev_find(x, start, now, idx, n); return i >= 0 && !(w(w(idx + 4 * i)) & EV_MARK) ? 1 : 0; }
  // (a place moved: where it is now; one not moved, as it was)
  function ev_rel(x: number, start: number, now: number, idx: number, n: number, dl: number): number {
    const i = ev_find(x, start, now, idx, n); if (i < 0) return x;
    return (w(w(idx + 4 * i)) & EV_MARK) ? x + w(dl + 4 * i) : x;
  }
  // (what an application made may be moved: only when one thread runs (one in what threads share may be read by another at
  // once, where it was; in a test too, now and then, not yet found why)) TODO(explicit)
  function ev_private(t: number): number { return w(w(t + EV) + 44) ? 0 : 1; }
  // (a thread's word that may hold a place it made: not where its memory is, how much it took, where a test's memory begins)
  function ev_word(k: number): number {
    return k === T_CHUNK || k === T_CHUNK_END || k === T_SLOT || k === T_SLOT_END || k === T_SCRATCH || k === T_SCRATCH_END || k === EV || k === T_REG_AT || k === T_MARK || k === T_MARK_LO || k === T_MARK_HI || k === T_ALLOCATED || k === T_ALLOC_QUIET || k === T_GREW || k === T_FREE_TAKEN || k === T_TOKEN || k === T_BUDGET || k === T_QBUDGET || k === T_SHGEN || k === T_LVL || k === T_LVL_N || k === T_WEAK || k === T_WEAK_N || k === T_DEPTH || k >= 900 ? 0 : 1;
  }
  // (one place of the places written, put below the larger of those after it: a heap, for their order)
  // (whether older memory's place a was given what is newer (in the log, in order, each once): moved with the log, not again)
  function ev_logged(lg: number, l0: number, ln: number, a: number): number { let lo = l0, hi = ln - 1; while (lo <= hi) { const mid = (lo + hi) >> 1, x = w(lg + 4 * mid); if (x === a) return 1; if (x < a) lo = mid + 1; else hi = mid - 1; } return 0; }
  function ev_sift(lg: number, l0: number, i: number, e: number) {
    for (;;) { const l = l0 + 2 * (i - l0) + 1; if (l >= e) return; let c = l; if (l + 1 < e && w(lg + 4 * (l + 1)) > w(lg + 4 * l)) c = l + 1; if (w(lg + 4 * c) <= w(lg + 4 * i)) return; const x = w(lg + 4 * i); set(lg + 4 * i, w(lg + 4 * c)); set(lg + 4 * c, x); i = c; }
  }
  // (what an application made that is still held when it is done (what is newer, written in older memory; what a thread word
  // or its answer holds): moved together where its memory began, the rest let go of; its answer, where it is now)
  // (the rules listed for the build since `from`, of what was made from start to now: of one let go of (n < 0: all of it),
  // none; of one moved, where it is; those left together)
  function rules_listed(from: number, start: number, now: number, idx: number, n: number, dl: number) {
    if (!(w(THREAD + EV) && w(w(THREAD + EV)))) return;
    let to = from;
    for (let k = from; k < w(RULES_N) && k < w(RULES_CAP); k++) {
      let r = w(w(RULES) + 4 * k);
      if (r >= start && r < now) { if (n < 0) r = 0; else { const ri = ev_find(r, start, now, idx, n); r = ri >= 0 && (w(w(idx + 4 * ri)) & EV_MARK) ? r + w(dl + 4 * ri) : 0; } }
      if (r) { set(w(RULES) + 4 * to, r); to++; }
    }
    if (from < w(RULES_N)) set(RULES_N, to);
  }
  function evacuate(t: number, start: number, now: number, at: number, lvl: number, v: number, slot0: number, rules0: number): number {
    const b0 = w(t + EV), idx = w(b0 + 20), cap = w(b0 + 24), wk = w(b0 + 28), wcap = w(b0 + 32), dl = w(b0 + 36), lg = w(b0 + 4);
    const l0 = w(w(b0 + 16) + 4 * lvl); let ln = w(b0 + 8);
    // (the places older memory was given at, each once (one given twice, moved twice), none of its own: in order, the same
    // ones together)
    for (let i = l0 + ((ln - l0) >> 1) - 1; i >= l0; i--) ev_sift(lg, l0, i, ln);
    for (let e2 = ln - 1; e2 > l0; e2--) { const x = w(lg + 4 * l0); set(lg + 4 * l0, w(lg + 4 * e2)); set(lg + 4 * e2, x); ev_sift(lg, l0, l0, e2); }
    let un = l0;
    for (let i = l0; i < ln; i++) { const a = w(lg + 4 * i); if (a >= start && a < now) continue; if (un > l0 && w(lg + 4 * (un - 1)) === a) continue; set(lg + 4 * un, a); un++; }
    ln = un; set(b0 + 8, ln);
    // (what it made, one after another, each its size before it)
    let n = 0;
    let p = start;
    while (p < now) { if (n >= cap) return v; const h = w(p), sz = h & EV_SIZE; if (p + 4 + sz > now || (h & EV_MARK)) return v; set(idx + 4 * n, p); n++; p += 4 + sz; }
    if (!n) return v;
    // (held: its answer, the thread's words, what older memory was given)
    let wn = 0;
    wn = ev_mark(v, start, now, idx, n, wk, wn, wcap);
    for (let k = 0; k < 1024; k += 4) { if (!ev_word(k)) continue; wn = ev_mark(w(t + k), start, now, idx, n, wk, wn, wcap); }
    // (and what a thread keeps beside its words: its scratch below where it is, its types, its stack)
    const sc_lo = w(t + T_SCRATCH_END) - 2048 * SCRATCH, sc_hi = w(t + T_SCRATCH), ty = w(t + T_TYP), ty_hi = ty + 12 * w(t + T_TYP_N), sk = w(t + T_STACK), sk_hi = sk ? sk + 8 * DEPTH : 0;
    for (let q = sc_lo; q < sc_hi; q += 4) wn = ev_mark(w(q), start, now, idx, n, wk, wn, wcap);
    if (ty) for (let q = ty; q < ty_hi; q += 4) wn = ev_mark(w(q), start, now, idx, n, wk, wn, wcap);
    for (let q = sk; q < sk_hi; q += 4) wn = ev_mark(w(q), start, now, idx, n, wk, wn, wcap);
    for (let i = l0; i < ln; i++) { const a = w(lg + 4 * i); if (a < start || a >= now) wn = ev_mark(w(a), start, now, idx, n, wk, wn, wcap); }
    // (and what those hold, in turn)
    while (wn > 0) { wn--; const i = w(wk + 4 * wn), o = w(idx + 4 * i), h = w(o); if (h & EV_BYTES) continue; const e = o + 4 + (h & EV_SIZE); for (let q = o + 4; q < e; q += 4) { wn = ev_mark(w(q), start, now, idx, n, wk, wn, wcap); if (wn < 0) break; } if (wn < 0) break; }
    if (wn < 0) { for (let i = 0; i < n; i++) { const o = w(idx + 4 * i); set(o, w(o) & ~EV_MARK); } return v; }
    // (where each kept one goes: one after another from where its memory began)
    let to = start;
    for (let i = 0; i < n; i++) { const o = w(idx + 4 * i), h = w(o); if (h & EV_MARK) { set(dl + 4 * i, to - o); to += 4 + (h & EV_SIZE); } else set(dl + 4 * i, 0); }
    if (to === now) { for (let i = 0; i < n; i++) { const o = w(idx + 4 * i); set(o, w(o) & ~EV_MARK); } return v; }
    // (what holds a kept one, given where it goes: what it holds, the thread's words, older memory, its answer)
    for (let i = 0; i < n; i++) { const o = w(idx + 4 * i), h = w(o); if (!(h & EV_MARK) || (h & EV_BYTES)) continue; const e = o + 4 + (h & EV_SIZE); for (let q = o + 4; q < e; q += 4) set(q, ev_rel(w(q), start, now, idx, n, dl)); }
    for (let k = 0; k < 1024; k += 4) { if (!ev_word(k)) continue; set(t + k, ev_rel(w(t + k), start, now, idx, n, dl)); }
    for (let q = sc_lo; q < sc_hi; q += 4) set(q, ev_rel(w(q), start, now, idx, n, dl));
    if (ty) for (let q = ty; q < ty_hi; q += 4) set(q, ev_rel(w(q), start, now, idx, n, dl));
    for (let q = sk; q < sk_hi; q += 4) set(q, ev_rel(w(q), start, now, idx, n, dl));
    for (let i = l0; i < ln; i++) { const a = w(lg + 4 * i); if (a < start || a >= now) set(a, ev_rel(w(a), start, now, idx, n, dl)); }
    // (what is kept for a while, of what it made: of one moved, where it is; of one let go of, unread again)
    const wkk = w(t + T_WEAK); let kept_n = w(at + 20);
    for (let i = w(at + 20); i < w(t + T_WEAK_N); i++) {
      const en = w(wkk + 4 * i);
      // (one it made itself: what it holds already moved with it; kept where it is now, or let go of)
      if ((en & -2) > start && (en & -2) < now) { const ei = ev_find(en & -2, start, now, idx, n); if (ei >= 0 && (w(w(idx + 4 * ei)) & EV_MARK)) { set(wkk + 4 * kept_n, en + w(dl + 4 * ei)); kept_n++; } continue; }
      if (en & 1) { const sl = en & -2; if (memo_holds(sl, start, now)) { const a1 = w(sl + 8), c1 = w(sl + 12), d1 = w(sl + 16), g1 = w(sl + 24), r1 = w(sl + 28); const gone = ev_dead(a1, start, now, idx, n) || ev_dead(c1, start, now, idx, n) || ev_dead(d1, start, now, idx, n) || ev_dead(g1, start, now, idx, n) || ev_dead(r1, start, now, idx, n); if (gone) { astore(sl, 0); continue; } if (!ev_logged(lg, l0, ln, sl + 8)) set(sl + 8, ev_rel(a1, start, now, idx, n, dl)); if (!ev_logged(lg, l0, ln, sl + 12)) set(sl + 12, ev_rel(c1, start, now, idx, n, dl)); if (!ev_logged(lg, l0, ln, sl + 16)) set(sl + 16, ev_rel(d1, start, now, idx, n, dl)); if (!ev_logged(lg, l0, ln, sl + 24)) set(sl + 24, ev_rel(g1, start, now, idx, n, dl)); if (!ev_logged(lg, l0, ln, sl + 28)) set(sl + 28, ev_rel(r1, start, now, idx, n, dl)); } set(wkk + 4 * kept_n, en); kept_n++; continue; }
      const tv = w(en + T_VALUE), ti = ev_find(tv, start, now, idx, n);
      if (ti >= 0 && aload(en + T_STATE) === 2) { if (w(w(idx + 4 * ti)) & EV_MARK) { if (!ev_logged(lg, l0, ln, en + T_VALUE)) set(en + T_VALUE, tv + w(dl + 4 * ti)); set(wkk + 4 * kept_n, en); kept_n++; } else { set(en + T_VALUE, 0); astore(en + T_STATE, 0); } } else { set(wkk + 4 * kept_n, en); kept_n++; }
    }
    set(t + T_WEAK_N, kept_n);
    // (the frames it listed: of one moved, where it is; of one let go of, none)
    for (let k = slot0; k < w(t + T_SLOT) && k < w(LIST_CAP); k++) { const pv = w(w(LIST) + 4 * k), pi = ev_find(pv, start, now, idx, n); if (pi >= 0) set(w(LIST) + 4 * k, (w(w(idx + 4 * pi)) & EV_MARK) ? pv + w(dl + 4 * pi) : 0); }
    rules_listed(rules0, start, now, idx, n, dl);
    const v2 = ev_rel(v, start, now, idx, n, dl);
    // (moved, in order (each down, or where it was), its mark taken off; the rest let go of)
    for (let i = 0; i < n; i++) { const o = w(idx + 4 * i), h = w(o); if (!(h & EV_MARK)) continue; const d = w(dl + 4 * i), sz = 4 + (h & EV_SIZE); if (d) for (let q = 0; q < sz; q += 4) set(o + d + q, w(o + q)); set(o + d, h & ~EV_MARK); }
    fill(to, 0, now - to); set(t + T_CHUNK, to);
    return v2;
  }
  function freeing(t: number, rule: number, caps: number, names: number, f: number, self: number, s: number, e: number, written: number, on: number): number {
    const lv = w(t + T_LVL), n = w(t + T_LVL_N);
    if (!w(t + T_FREEING) || !lv || n >= DEPTH) return profiled(t, rule, caps, names, f, self, s, e, written, on);
    const start = w(t + T_CHUNK), cend = w(t + T_CHUNK_END), slot0 = w(t + T_SLOT), slotend0 = w(t + T_SLOT_END), at = lv + 24 * n, below = n ? at - 24 : 0, rules0 = w(RULES_N);
    set(at, start); set(at + 4, 0x7FFFFFFF); set(at + 8, cend); set(at + 12, below && w(below + 8) === cend ? w(below + 12) : start); set(at + 16, rule); set(at + 20, w(t + T_WEAK_N));
    // (where this one's writes of what is newer into older memory begin; none before the outermost)
    const ev0 = w(t + EV); if (ev0 && w(ev0)) { if (!n) { set(ev0 + 8, 0); set(ev0 + 40, 0); } if (n < 6000) set(w(ev0 + 16) + 4 * n, w(ev0 + 8)); }
    set(t + T_LVL_N, n + 1);
    let v = profiled(t, rule, caps, names, f, self, s, e, written, on);
    set(t + T_LVL_N, n);
    const now = w(t + T_CHUNK), lowest = w(at + 4);
    const hd_ = w(rule + R_HEAD), hn_ = hd_ ? w(hd_ + N_B) - w(hd_ + N_A) : 0, pass_ = hd_ && ((hn_ === 11 && b(w(hd_ + N_A)) === 40 && b(w(hd_ + N_A) + 1) === 123) || (hn_ === 9 && b(w(hd_ + N_A)) === 46 && b(w(hd_ + N_A) + 1) === 123));
    // (a thread's own words written while it ran keep nothing: what they hold when it is done does (one still pointing into
    // what it made, the value a jump carries out: kept), but for those let go of below) TODO(explicit)
    let thread_holds = 0;
    if (lowest >= start && now > start && !(v >= start && v < now)) for (let k = 0; k < 1024 && !thread_holds; k += 4) { if (k === T_LEXV || k === T_REFF || k === T_WRITTEN_IN || k === T_CHUNK || k === T_CHUNK_END || k === T_SLOT || k === T_SLOT_END || k === T_SCRATCH) continue; const tw = w(t + k); if (tw >= start && tw < now) thread_holds = 1; }
    // (one that listed a rule for the build is not let go of at once: what holds that rule is asked (`evacuate`), as what
    // holds anything else it made, the thread's scratch and stacks too)
    if ((w(t + T_FREEING) > 1 || pass_) && lowest >= start && !thread_holds && now > start && w(t + T_CHUNK_END) === cend && !(v >= start && v < now) && w(RULES_N) === rules0) {
      // (the frames it listed, for what is painted: all its own, let go of; past a new run of slots, each one asked)
      for (let k = slot0; k < w(t + T_SLOT) && k < w(LIST_CAP); k++) { const pv = w(w(LIST) + 4 * k); if (pv >= start && pv < now) set(w(LIST) + 4 * k, 0); }
      rules_listed(rules0, start, now, 0, -1, 0);
      // (the takes that kept a value it made: unread again)
      const wk = w(t + T_WEAK); let kept_n = w(at + 20);
      for (let i = w(at + 20); i < w(t + T_WEAK_N); i++) {
        const en = w(wk + 4 * i);
        if (en & 1) { const sl = en & -2; if (memo_holds(sl, start, now)) astore(sl, 0); else { set(wk + 4 * kept_n, en); kept_n++; } continue; }
        const tv = w(en + T_VALUE); if (tv >= start && tv < now && aload(en + T_STATE) === 2) { set(en + T_VALUE, 0); astore(en + T_STATE, 0); } else { set(wk + 4 * kept_n, en); kept_n++; }
      }
      set(t + T_WEAK_N, kept_n);
      fill(start, 0, now - start); set(t + T_CHUNK, start);
      // (and what passes a frame on to the next step, where it still names one let go of: nothing)
      if (w(t + T_LEXV) >= start && w(t + T_LEXV) < now) set(t + T_LEXV, 0);
      if (w(t + T_REFF) >= start && w(t + T_REFF) < now) set(t + T_REFF, 0);
      if (w(t + T_WRITTEN_IN) >= start && w(t + T_WRITTEN_IN) < now) set(t + T_WRITTEN_IN, 0);
    } else {
      // (kept: what still holds what it made moved together where its memory began, the rest let go of) TODO(explicit)
      if (ev0 && w(ev0) && !w(ev0 + 40) && lowest >= 0 && now - start > 1 << 18 && w(t + T_CHUNK_END) === cend && n < 6000) { if (ev_private(t)) v = evacuate(t, start, now, at, n, v, slot0, rules0); }
      if (below && lowest < w(below + 4)) set(below + 4, lowest);
    }
    return v;
  }
  // (`RAY_ALLOCS`: what each rule's applications allocate themselves, not the rules they apply, kept by rule)
  function profiled(t: number, rule: number, caps: number, names: number, f: number, self: number, s: number, e: number, written: number, on: number): number {
    const prof = w(t + T_PROF);
    if (!prof) return apply_(t, rule, caps, names, f, self, s, e, written, on);
    const a0 = w(t + T_ALLOCATED), c0 = w(t + T_PROF_CHILD); set(t + T_PROF_CHILD, 0);
    const v = apply_(t, rule, caps, names, f, self, s, e, written, on);
    const total = w(t + T_ALLOCATED) - a0, own = total - w(t + T_PROF_CHILD);
    for (let h = (rule >> 3) & 4095, k = 0; k < 4096; k++, h = (h + 1) & 4095) { const m = prof + 16 * h; if (w(m) === rule || !w(m)) { set(m, rule); set(m + 4, w(m + 4) + own); set(m + 8, w(m + 8) + 1); break; } }
    set(t + T_PROF_CHILD, c0 + total);
    return v;
  }
  // (`static X := v`, the statement a hole took, as it is written: X given v lazily, a static; not a class (made where it is
  // declared, named by what it is given to), nor one written `lazily`; else 0)
  function lazy_static(t: number, names: number, rest: number, z: number, self: number): number {
    let hs = skip(rest, z), he = trim_end(rest, z); if (he - hs > 2 && b(hs) === 123 && b(he - 1) === 125) { hs++; he--; }
    const hx = names && w(names + N_IS) === IS_FRAME && w(names + F_RULE) ? named(w(names + F_RULE), hs, he) : -1;
    if (hx < 0 || !self || w(self + N_IS) !== IS_NODE || self === w(GLOBAL)) return 0;
    const st = follow(names + F_TAKES + TAKE * hx, 1), cl = w(CLASSES);
    if (!st) return 0;
    const ss = skip(w(st), w(st + 4)), se = trim_end(w(st), w(st + 4));
    let ne = ss; while (ne < se && b(cl + b(ne)) === 1) ne++;
    let q = ne; while (q < se && b(q) === 32) q++;
    if (ne === ss || b(q) !== 58) return 0;
    // (`name := value`, or typed, `name: T = value` (the value read lazily, its type not asked of it), when the value is what
    // a class makes, `static current: Space = Space.plane` (a type given, `Letter: Char = "a".."z"`, or a value of the language,
    // `ray: .Lossless = (…)`, read as before))
    let vq = 0, typed = 0;
    if (b(q + 1) === 61 && b(q + 2) === 32) vq = q + 3;
    else if (b(q + 1) === 32) { typed = 1; for (let x = q + 2, d = 0; x + 2 < se; x++) { const c = b(x); if (c === 40 || c === 91 || c === 123) d++; else if (c === 41 || c === 93 || c === 125) d--; else if (!d && c === 32 && b(x + 1) === 61 && b(x + 2) === 32) { vq = x + 3; break; } } }
    if (!vq) return 0;
    const vs = skip(vq, se);
    let we = vs; while (we < se && b(cl + b(we)) === 1) we++;
    const n = we - vs;
    // (nor a type, written as one, led by a capital, `static Unit := Binary₈`, `TF{} {…}` (named by what it is given to as a
    // class is), but what one makes is, `Space([…])`; nor another static, `.DepthFirst`)
    let ce = vs; while (ce < se && (b(cl + b(ce)) === 1 || b(ce) === 46)) ce++;
    // (or a static of one, `Space.plane`: a capital, then its members, lowercase, and nothing after them)
    let me_ = vs; while (me_ < se && b(cl + b(me_)) === 1) me_++;
    let member_ = me_ > vs && me_ < se && b(me_) === 46 && b(me_ + 1) >= 97 && b(me_ + 1) <= 122;
    if (member_) { let x = me_; while (x < se && b(x) === 46 && b(x + 1) >= 97 && b(x + 1) <= 122) { x++; while (x < se && b(cl + b(x)) === 1) x++; } member_ = x === se; }
    const made = (ce < se && b(ce) === 40) || member_;
    if (typed && !(made && b(vs) >= 65 && b(vs) <= 90)) return 0;
    if (vs >= se || b(vs) === 46 || (b(vs) >= 65 && b(vs) <= 90 && !made) || (n === 5 && b(vs) === 99 && b(vs + 1) === 108 && b(vs + 2) === 97 && b(vs + 3) === 115 && b(vs + 4) === 115) || (n === 6 && b(vs) === 108 && b(vs + 1) === 97 && b(vs + 2) === 122 && b(vs + 3) === 105 && b(vs + 4) === 108 && b(vs + 5) === 121)) return 0;
    const tk = alloc(TAKE);
    for (let i = 0; i < TAKE; i += 4) put(tk + i, w(st + i));
    put(tk + T_START, vs); put(tk + T_END, se); put(tk + T_STATE, 0); put(tk + T_VALUE, 0);
    const lazy = node(IS_LAZY, tk, 0, self, 0), hd = bound(ss, ne, self, lazy), br = latest(self);
    if (br && w(br + R_HEAD) === hd) put(br + R_FLAGS, w(br + R_FLAGS) | STATIC);
    return hd;
  }
  // (what a value rule gives: a value read lazily (`x: T`'s T), read now and kept)
  function lazy_read(t: number, rule: number): number {
    const bv = w(rule + R_BS);
    if (!bv || w(bv + N_IS) !== IS_LAZY) return bv;
    // (read on its own: what is being read where it is asked for (a jump, a left side, a hole) left as it is)
    const js = w(t + T_JUMP_S), jn = w(t + T_JUMP_N), jv = w(t + T_JUMP_V), hole = w(t + T_HOLE), decl = w(t + T_DECL), le = w(t + T_LE), fault = w(t + T_FAULT);
    put(t + T_JUMP_N, 0); put(t + T_HOLE, 0); put(t + T_DECL, 0); put(t + T_LE, 0); put(t + T_FAULT, 0);
    // (while it is being read: nothing, a type read again inside itself goes no deeper)
    put(rule + R_BS, w(NOTHING));
    const fv = valued(t, w(bv + N_A));
    if (!fv) put(rule + R_BS, bv);
    put(t + T_JUMP_S, js); put(t + T_JUMP_N, jn); put(t + T_JUMP_V, jv); put(t + T_HOLE, hole); put(t + T_DECL, decl); put(t + T_LE, le); if (!w(t + T_FAULT)) put(t + T_FAULT, fault);
    if (fv) put(rule + R_BS, fv);
    return fv;
  }
  function apply_(t: number, rule: number, caps: number, names: number, f: number, self: number, s: number, e: number, written: number, on: number): number {
    const kind = w(rule + R_KIND), lex = w(t + T_LEXV);
    set(t + T_LEXV, 0);
    // (read as a left side, a value given lazily is what is there, unread)
    if (kind === VALUE) return w(t + 948) && w(rule + R_BS) && w(w(rule + R_BS) + N_IS) === IS_LAZY ? w(rule + R_BS) : lazy_read(t, rule);
    if (kind === EXTERNAL) {
      const a = skip(w(caps), w(caps + 4));
      let z = w(caps + 4); while (z > a && b(z - 1) <= 32) z--;
      let m = a; while (m < z && b(m) > 32) m++;
      const rest = skip(m, z);
      // (`external . v`: v one of the components of what it is read in (made of it too, the last added seen first, then what
      // it was made of before))
      if (word(a, m, W_DOT) && rest < z) {
        const th = self, v = block(t, rest, z, names, f, self, 0, 1, 0, self, 0);
        if (DEBUG && v && th && w(THREAD + T_REG_AT) && in_region(v) && !in_region(th)) debug(D_FAULT, 96, rest, z);
        // (never made of what is made of it: a cycle what it sees would go round without end; said with --debug)
        if (v && th && v !== th && made_of_deep(v, th, 0)) { if (DEBUG) debug(D_FAULT, 87, th, v); return th; }
        // (nor is what everything is in, the language itself, made of anything: what it sees would come back to it)
        if (v && th === w(GLOBAL)) { if (DEBUG) debug(D_FAULT, 87 + 1001, rest, z); say(t, rest, L_VALUED, rest, z); return th; }
        if (v && th && v !== th) { put(th + N_ALSO, w(th + N_ALSO) ? node(IS_NODE, 0, 0, w(th + N_ALSO), v) : v); set(THREAD + T_SHGEN, w(THREAD + T_SHGEN) + 1); }
        // (what it answers: the component (the language keeps what a node was made of with it))
        return v || th;
      }
      // (a node of its own, in what it is read in, made of what it is read on: called bare in a method's own node (`gcd(other)`
      // in `lcm`), what that method is read on)
      // (run on a text, a value nothing is declared in: its node made of it, and what it runs on still the text)
      if (word(a, m, W_DOT)) { const th = w(names + F_THIS), rc = w(names + F_RECEIVER), texted = rc === th && th && w(th + N_IS) === IS_TEXT, n = node(IS_NODE, 0, names, th, rc !== th ? (run_node(rc) ? w(rc + N_ALSO) : rc) : texted ? th : 0); if (DEBUG && w(THREAD + T_REG_AT) && !in_region(names)) debug(D_FAULT, 96, a, z); put(names + F_THIS, n); if (rc === th && !texted) put(names + F_RECEIVER, n); return n; }
      if (word(a, m, W_AMP)) return names;
      // (`external members`: what the node it is read in holds are its members, a class's or a value's: a bare name never
      // reads them, `.name` does (§21.3))
      // (`external static code`: what the code defines where it is read is static, the class's own: a bare name reads it)
      // (`external hoisted code`: a class's block read again in an instance (its body is the constructor), what does not depend on
      // the instance not read again: it is the class's already (once per class, the compiler's optimization, done here))
      if (word(a, m, W_HOISTED) && rest < z) { const was = w(t + 1020); put(t + 1020, w(t + T_DEPTH) + 1); const v = block(t, rest, z, names, f, self, 0, 1, 1, self, 0); put(t + 1020, was); return v; }
      // (a static given a value as it is written, `static X := v`: v read when X is first asked for, then kept (a class, or one
      // written `lazily`, declared as it is))
      if (word(a, m, W_STATIC) && rest < z) { const lz = lazy_static(t, names, rest, z, self); if (lz) return lz; const before = latest(self), v = block(t, rest, z, names, f, self, 0, 1, 0, self, 0); for (let r = latest(self), k = 0; r && r !== before && !(w(r + R_FLAGS) & DEAD) && k < 4096; r = w(r), k++) put(r + R_FLAGS, w(r + R_FLAGS) | STATIC); return v; }
      // (`external undefined v`: whether v is a name nothing defines (a place, its name still read as it); said where it is
      // written, `nothing reads`)
      if (word(a, m, W_UNDEFINED) && rest < z) { const v = block(t, rest, z, names, f, self, 0, 1, 0, self, 0); if (!v || w(v + N_IS) !== IS_PLACE || !place_in(v) || w(v + N_A) >= w(v + N_B)) return w(FALSE_); const scope = place_in(v), r = reading(t, w(v + N_A), w(v + N_B), 0, 0, latest(scope), scope, 0, 0, 0, 0); if (w(r) === K_RULE && !(w(w(r + 12) + R_KIND) === VALUE && w(w(r + 12) + R_BS) === v)) return w(FALSE_); say(t, w(v + N_A), L_UNREAD, w(v + N_A), w(v + N_B)); return w(TRUE_); }
      // (`external unset v`: whether v is a name given no value yet, a place)
      // (`external unset v t`: v a name given no value yet, a place: given t, where it is named)
      // (`external unset x T`, `x: T`: a name given nothing yet given T where it was named; a name that answers something visible
      // elsewhere (`rest`, `name`) and is no member of what it is read in, given T there all the same, its own (GN1))
      // (`external dynamic_in f`, `external dynamic_out`: while a type made `dynamically` reads, the frame it was made in, what
      // a word nothing else reads is read in (`context` of `Statements (context: Node) => dynamically Statement[] …`))
      if (word(a, m, W_DYNAMIC_IN) && rest < z) { const df = block(t, rest, z, names, f, self, 0, 1, 0, self, 0), dn = w(t + 952); if (df && w(df + N_IS) === IS_FRAME && dn < 16) { put(t + 956 + 4 * dn, df); put(t + 952, dn + 1); } return w(TRUE_); }
      // (`external shown v d`: the style v was just given (`external style`, among the last few given: the class a rule
      // made, `made ^class`, given to a name next), as written; else what d reads)
      if (word(a, m, W_SHOWN) && rest < z) {
        let shown_q = rest; while (shown_q < z && b(shown_q) > 32) shown_q++;
        const shown_v = block(t, rest, shown_q, names, f, self, 0, 1, 0, self, 0), shown_n = w(STYLES) ? (aload(w(STYLES)) < STYLES_CAP ? aload(w(STYLES)) : STYLES_CAP) : 0;
        // (unpainted (no `T_PAINTS`): what it is shown as is asked of nothing, the table not searched) TODO(explicit)
        for (let shown_k = shown_n - 1; w(t + T_PAINTS) && shown_v && shown_k >= 0 && shown_k >= shown_n - 65536; shown_k--) { const shown_at = w(STYLES) + 4 + 12 * shown_k; if (w(shown_at) === shown_v) return node(IS_TEXT, w(shown_at + 4), w(shown_at + 8), w(GLOBAL), 0); }
        return shown_q < z ? block(t, skip(shown_q, z), z, names, f, self, 0, 1, 0, self, 0) : w(NOTHING);
      }
      // (`external style s x`: x shown in the style s, kept where what is painted is looked up (its count, then x and where s is
      // written, one after another), not among x's members: a member of a hole's node would be read (it is `this` when the
      // hole's code is). s as it is written (a hole of the rule it is in: the text it took, `^class` not the class))
      if (word(a, m, W_STYLE) && rest < z) {
        // (written in brackets, `external style (external shown v d) x`: the brackets whole)
        let style_q = rest; if (b(rest) === 40) style_q = past(rest, z); else while (style_q < z && b(style_q) > 32) style_q++;
        const style_hole = names && w(names + N_IS) === IS_FRAME && w(names + F_RULE) ? named(w(names + F_RULE), rest, style_q) : -1;
        let style_a = 0, style_b = 0;
        // (a word as it is written; anything else read, what it answers (`^((ensure c) ? `passed` : `failed`)`, a test's))
        if (style_hole >= 0) { const style_take = follow(names + F_TAKES + TAKE * style_hole, 1); style_a = skip(w(style_take + T_START), w(style_take + T_END)); style_b = trim_end(style_a, w(style_take + T_END)); let style_i = style_a; while (style_i < style_b && (b(w(CLASSES) + b(style_i)) === 1 || b(style_i) === 46 || b(style_i) === 45)) style_i++; if (style_i < style_b || style_a >= style_b) style_a = style_b = 0; }
        if (style_a >= style_b) { const style_v = block(t, rest, style_q, names, f, self, 0, 1, 0, self, 0); if (style_v) { style_a = w(style_v + N_A); style_b = w(style_v + N_B); } }
        // (x read; a rule it defined where it is read (`external style s (… => …).style = s`) is what is styled, x's value what is answered)
        const style_before = latest(self), style_x = style_q < z ? block(t, skip(style_q, z), z, names, f, self, 0, 1, 0, self, 0) : 0, style_after = latest(self);
        const styled_x = style_after && style_after !== style_before ? w(style_after + R_HEAD) : style_x;
        // (unpainted (no `T_PAINTS`): kept nowhere (the table is what painting asks; kept, every value styled stays))
        if (w(t + T_PAINTS) && styled_x && style_a < style_b && w(STYLES)) { const style_k = xadd(w(STYLES), 1); if (style_k < STYLES_CAP) { const style_at = w(STYLES) + 4 + 12 * style_k; aput(style_at, styled_x); put(style_at + 4, style_a); put(style_at + 8, style_b); } }
        return style_x || w(NOTHING);
      }
      // (`external rule h`: the latest rule of the language whose head is written as the text h, its head (what it is shown as,
      // `.style`, given to a rule declared before a head could carry a style); none, nothing)
      if (word(a, m, W_RULE) && rest < z) { const hx = block(t, rest, z, names, f, self, 0, 1, 0, self, 0); if (!hx || w(hx + N_IS) !== IS_TEXT) return w(NOTHING); const ha = w(hx + N_A), hn = w(hx + N_B) - ha; for (let r = latest(w(GLOBAL)), k = 0; r && k < 1 << 16; r = w(r), k++) { const hd = w(r + R_HEAD); if (!hd || (w(r + R_FLAGS) & DEAD) || w(hd + N_B) - w(hd + N_A) !== hn) continue; let i = 0; while (i < hn && b(w(hd + N_A) + i) === b(ha + i)) i++; if (i === hn) return hd; } return w(NOTHING); }
      // (`external origin_of x`: the frame where the code a hole x took was written)
      if (word(a, m, W_ORIGIN_OF) && rest < z) { const ox = names && w(names + N_IS) === IS_FRAME && w(names + F_RULE) ? named(w(names + F_RULE), rest, trim_end(rest, z)) : -1; if (ox < 0) return w(NOTHING); const otk = follow(names + F_TAKES + TAKE * ox, 1), of_ = w(otk + T_ORIGIN); return of_ || w(NOTHING); }
      if (word(a, m, W_DYNAMIC_OUT)) { const dn = w(t + 952); if (dn > 0) put(t + 952, dn - 1); return w(TRUE_); }
      // (`external mapped p v`: what the place p (written `{x: f}`) makes of v: f read where it was written, `.` v; else v)
      if (word(a, m, W_MAPPED) && rest < z) {
        let mq = rest; while (mq < z && b(mq) > 32) mq++;
        const mp = block(t, rest, mq, names, f, self, 0, 1, 0, self, 0), mv = mq < z ? block(t, skip(mq, z), z, names, f, self, 0, 1, 0, self, 0) : 0;
        if (!mp || (w(mp + N_IS) !== IS_PLACE && w(mp + N_IS) !== IS_LAZY && w(mp + N_IS) !== IS_NODE)) return mv;
        // (a link of positions read: its own, else its value's (a place, a value given lazily))
        let mn = member(t, mp, w(w(WORDS) + 8 * W_MAPPED_BY), w(w(WORDS) + 8 * W_MAPPED_BY + 4));
        if ((!mn || w(mn + N_IS) !== IS_TEXT) && w(mp + N_IS) === IS_NODE) { const lv = held(t, mp, W_VALUE, 0); mn = lv && lv !== w(NOTHING) && (w(lv + N_IS) === IS_PLACE || w(lv + N_IS) === IS_LAZY) ? member(t, lv, w(w(WORDS) + 8 * W_MAPPED_BY), w(w(WORDS) + 8 * W_MAPPED_BY + 4)) : 0; }
        if (!mn || w(mn + N_IS) !== IS_TEXT || !w(mn + N_PARENT) || w(w(mn + N_PARENT) + N_IS) !== IS_FRAME) return mv;
        const mo = w(mn + N_PARENT), mr = block(t, w(mn + N_A), w(mn + N_B), mo, mo, mv, 0, 1, 0, mv, 0);
        return mr || mv;
      }
      // (`external callable v`: whether v has a rule of its own led by itself and brackets, `{this}({argument})`, among its latest
      // (a function: given to a place typed as one, it is called)) TODO(explicit)
      // (`external function_given v t`: t written as one parameter typed as a function, `mapping: (x: T): *`, and v given to it
      // none (no function, nor a list of arguments or one given by name): it is given the function answering v) TODO(explicit)
      // (`external defines_text x`: whether the text x has a definition in it, `:=` (a class's header that defines what its
      // positions are read by, `(GRAMMAR_RULE_DEF := BOOTSTRAPPER.CAPTURES…, GRAMMAR_RULE: GRAMMAR_RULE_DEF, …)`)) TODO(explicit)
      if (word(a, m, W_DEFINES_TEXT) && rest < z) { const dx = block(t, rest, z, names, f, self, 0, 1, 0, self, 0); if (!dx || w(dx + N_IS) !== IS_TEXT) return w(FALSE_); for (let i = w(dx + N_A); i + 1 < w(dx + N_B); i++) if (b(i) === 58 && b(i + 1) === 61) return w(TRUE_); return w(FALSE_); }
      if (word(a, m, W_FUNCTION_GIVEN) && rest < z) {
        let q = rest; while (q < z && b(q) > 32) q++;
        // (the text first: what was given is read only for a parameter written so (reading it reads what a class is given,
        // `Filtered(from: …, keeps: { … })`, before it takes it))
        const ft = q < z ? block(t, skip(q, z), z, names, f, self, 0, 1, 0, self, 0) : 0;
        if (!ft || w(ft + N_IS) !== IS_TEXT) return w(FALSE_);
        const ts = w(ft + N_A), te = w(ft + N_B); let colon_paren = 0, closes = 0, comma = 0;
        for (let i = ts, d = 0; i < te; i++) { const c = b(i); if (c === 40 || c === 91 || c === 123) { if (c === 40 && d === 0 && i > ts) { let k = i - 1; while (k > ts && b(k) <= 32) k--; if (b(k) === 58) colon_paren = 1; } d++; } else if (c === 41 || c === 93 || c === 125) { d--; if (c === 41 && i + 1 < te && b(i + 1) === 58) closes = 1; } else if (c === 44 && d === 0) comma = 1; }
        if (!colon_paren || !closes || comma) return w(FALSE_);
        // (v a hole of the rule it is read in, `(arguments_given)`: what that hole took, as the rule has it)
        let va = rest, vz = q; if (b(va) === 40 && b(vz - 1) === 41) { va++; vz--; }
        const vx = names && w(names + N_IS) === IS_FRAME && w(names + F_RULE) ? named(w(names + F_RULE), va, vz) : -1;
        const fv = vx >= 0 ? valued(t, names + F_TAKES + TAKE * vx) : block(t, rest, q, names, f, self, 0, 1, 0, self, 0);
        if (!fv) return w(FALSE_);
        if (w(fv + N_IS) === IS_NODE && (listed(t, fv) && held(t, fv, W_SPREAD, 0) === w(TRUE_) || held(t, fv, W_NAMED_ARGUMENT, 0) === w(TRUE_))) return w(FALSE_);
        if (calls_any(t, fv)) return w(FALSE_);
        // (and that hole kept answering it: the function made of it reads it later, in another call, where its code read again
        // would answer anew)
        if (vx >= 0) { const vk = follow(names + F_TAKES + TAKE * vx, 1); if (vk) { put(vk + T_VALUE, fv); aput(vk + T_STATE, 3); } }
        return w(TRUE_);
      }
      if (word(a, m, W_CALLABLE) && rest < z) { const cv = block(t, rest, z, names, f, self, 0, 1, 0, self, 0); return calls_any(t, cv) ? w(TRUE_) : w(FALSE_); }
      if (word(a, m, W_UNSET) && rest < z) {
        let q = rest; while (q < z && b(q) > 32) q++;
        if (q >= z) { const v1 = block(t, rest, q, names, f, self, 0, 1, 0, self, 0); return v1 && w(v1 + N_IS) === IS_PLACE ? w(TRUE_) : w(FALSE_); }
        // (`x: T` written in what a node is made of, T one hole's code: read when it is first asked for (what x is, or its type),
        // then kept; else T read first (what reads it may go elsewhere, `break: return`), then x, as a left side)
        const ta = skip(q, z), thx_ = names && w(names + N_IS) === IS_FRAME && w(names + F_RULE) ? named(w(names + F_RULE), ta, z) : -1;
        // (`{x: f}: T`, x's code in braces: x a place, f kept on it (what x is made of what T reads, `.` that))
        const hxb = names && w(names + N_IS) === IS_FRAME && w(names + F_RULE) ? named(w(names + F_RULE), rest, q) : -1, tkb = hxb >= 0 ? follow(names + F_TAKES + TAKE * hxb, 1) : 0;
        let mb_s = 0, mb_e = 0, mb_ns = 0, mb_ne = 0;
        if (tkb) { const cs = skip(w(tkb), w(tkb + 4)), ce = trim_end(w(tkb), w(tkb + 4)); if (ce - cs > 2 && b(cs) === 123 && b(ce - 1) === 125) { const p0 = skip(cs + 1, ce - 1); let we = p0; while (we < ce - 1 && b(w(CLASSES) + b(we)) === 1) we++; let c = we; while (c < ce - 1 && b(c) <= 32) c++; if (we > p0 && b(c) === 58 && b(c + 1) !== 58 && b(c + 1) !== 61) { mb_ns = p0; mb_ne = we; mb_s = skip(c + 1, ce - 1); mb_e = trim_end(c + 1, ce - 1); } } }
        const decl_was = w(t + T_DECL); put(t + T_DECL, 1); set(t + 948, 1);
        const v0 = mb_ns ? placed(t, mb_ns, mb_ne, self) : block(t, rest, q, names, f, self, 0, 1, 0, self, 0);
        put(t + T_DECL, decl_was); set(t + 948, 0);
        // (a name that goes elsewhere when read, `break` of `break: return`: its type read instead, first, as it is written)
        if (w(t + T_JUMP_N)) { put(t + T_JUMP_N, 0); return thx_ >= 0 ? valued(t, names + F_TAKES + TAKE * thx_) : block(t, ta, z, names, f, self, 0, 1, 0, self, 0); }
        // (one given lazily already (the same declaration read again): declared again here, its place)
        // (declared again where the code the hole x took is, its name (not the word `x` written here))
        const hxr = v0 && w(v0 + N_IS) === IS_LAZY && names && w(names + N_IS) === IS_FRAME && w(names + F_RULE) ? named(w(names + F_RULE), rest, q) : -1, tkr = hxr >= 0 ? follow(names + F_TAKES + TAKE * hxr, 1) : 0;
        const v = v0 && w(v0 + N_IS) === IS_LAZY ? (mb_ns ? placed(t, mb_ns, mb_ne, self) : tkr ? placed(t, skip(w(tkr), w(tkr + 4)), trim_end(w(tkr), w(tkr + 4)), self) : placed(t, rest, q, self)) : v0;
        const lazyable = thx_ >= 0 && v && w(v + N_IS) === IS_PLACE && place_in(v) && w(place_in(v) + N_IS) === IS_NODE && place_in(v) !== w(GLOBAL) && !w(t + T_HOLE);
        let pre = 0;
        if (!lazyable) { pre = thx_ >= 0 ? valued(t, names + F_TAKES + TAKE * thx_) : block(t, ta, z, names, f, self, 0, 1, 0, self, 0); if (w(t + T_JUMP_N) || stopped(t)) return pre; }
        if (v && w(v + N_IS) === IS_PLACE) {
          const lo_ = lazyable ? follow(names + F_TAKES + TAKE * thx_, 1) : 0, lthis = lo_ ? w(lo_ + T_THIS) || place_in(v) : 0;
          // (the take of T kept as it is now, read when first asked for: where it was written, what it was read on)
          const tkc = lo_ && lthis ? alloc(TAKE) : 0;
          if (tkc) { for (let i = 0; i < TAKE; i += 4) put(tkc + i, w(names + F_TAKES + TAKE * thx_ + i)); put(tkc + T_STATE, 0); put(tkc + T_VALUE, 0); }
          const given = tkc && w(lthis + N_IS) === IS_NODE ? node(IS_LAZY, tkc, 0, lthis, 0) : lazyable ? valued(t, names + F_TAKES + TAKE * thx_) : pre;
          // (and on its place, its type)
          if (given) { const wt = w(w(WORDS) + 8 * W_TYPE); bound(wt, wt + w(w(WORDS) + 8 * W_TYPE + 4), v, given); }
          if (mb_ns && mb_e > mb_s) { const wm = w(w(WORDS) + 8 * W_MAPPED_BY), mf = node(IS_TEXT, mb_s, mb_e, w(tkb + T_ORIGIN) || names, 0); bound(wm, wm + w(w(WORDS) + 8 * W_MAPPED_BY + 4), v, mf); if (given && w(given + N_IS) === IS_LAZY) bound(wm, wm + w(w(WORDS) + 8 * W_MAPPED_BY + 4), given, mf); }
          // (one given a value there before, `x: T` read again where x was given (a header read again in what it was read
          // into): that value kept, the type on its place)
          const kept_ = w(v + N_A) < w(v + N_B) ? given_already(place_in(v) || self, w(v + N_A), w(v + N_B), v) : 0;
          if (kept_) { bound(w(v + N_A), w(v + N_B), place_in(v) || self, kept_); if (given) type_written_on(t, v, names, skip(q, z), z); return kept_; }
          if (given && w(v + N_A) < w(v + N_B)) { bound(w(v + N_A), w(v + N_B), place_in(v) || self, given); const br = latest(place_in(v) || self); if (br && w(br + R_KIND) === VALUE && w(br + R_BS) === given) put(br + R_FLAGS, w(br + R_FLAGS) | STATIC); }
          // (made in a rule's frame, `x: T`'s own: named where that rule is read too, what reads after it there sees it (a
          // header's field, the fields after it: `(a: T, b: a.count)`))
          const pin = place_in(v);
          const pon = pin && w(pin + N_IS) === IS_FRAME ? w(pin + F_THIS) : names && w(names + N_IS) === IS_FRAME ? w(names + F_THIS) : 0;
          if (given && pon && pon !== pin && pon !== w(GLOBAL) && w(pon + N_IS) === IS_NODE && w(v + N_A) < w(v + N_B)) bound(w(v + N_A), w(v + N_B), pon, given);
          if (given && self && self !== pin && self !== pon && self !== w(GLOBAL) && w(self + N_IS) === IS_NODE && w(v + N_A) < w(v + N_B)) bound(w(v + N_A), w(v + N_B), self, given);
          if (given) type_written_on(t, v, names, skip(q, z), z);
          // (given lazily: the place, its type unread)
          return lazyable ? v : given;
        }
        // (not a name given nothing yet, a hole of a head (`{x: T}`) or a node: its type, now)
        if (v && (w(v + N_IS) === IS_HOLE || w(v + N_IS) === IS_NODE) && v !== w(GLOBAL)) { const g0 = lazyable ? (thx_ >= 0 ? valued(t, names + F_TAKES + TAKE * thx_) : block(t, ta, z, names, f, self, 0, 1, 0, self, 0)) : pre; if (g0) { const wt = w(w(WORDS) + 8 * W_TYPE); bound(wt, wt + w(w(WORDS) + 8 * W_TYPE + 4), v, g0); } }
        const hn = v ? hole_name(names, rest, q) : 0, hx = hn ? named(w(names + F_RULE), rest, q) : -1;
        // (where the name was written: the scope its code was read in; else what this is read in)
        const tk0 = hx >= 0 ? names + F_TAKES + TAKE * hx : 0, src = tk0 ? follow(tk0, 1) : 0, written_in = src && w(src + T_THIS) ? w(src + T_THIS) : 0;
        const into = written_in || (names && w(names + N_IS) === IS_FRAME ? w(names + F_THIS) : self);
        if (hn && into && (w(into + N_IS) === IS_NODE || w(into + N_IS) === IS_FRAME) && into !== w(GLOBAL) && !own_named(into, w(hn + N_A), w(hn + N_B))) {
          const given2 = block(t, skip(q, z), z, names, f, self, 0, 1, 0, self, 0);
          if (given2) {
            // (a place of it there, as a name nothing reads has (its type kept on it), then given the type)
            const pl = place_of(w(hn + N_A), w(hn + N_B), into), wt = w(w(WORDS) + 8 * W_TYPE);
            bound(wt, wt + w(w(WORDS) + 8 * W_TYPE + 4), pl, given2);
            type_written_on(t, pl, names, skip(q, z), z);
            // (a type that is a place itself, another field's (`close: open`): not what this name is, which stays its own)
            if (w(given2 + N_IS) !== IS_PLACE) bound(w(hn + N_A), w(hn + N_B), into, given2);
            // (and what the rule took for the name, read again, that place: not what it named elsewhere)
            put(tk0 + T_VALUE, pl); aput(tk0 + T_STATE, 3);
          }
          return given2 || w(FALSE_);
        }
        return w(FALSE_);
      }
      // (`external operated v`: whether the text v is only an operator's characters, `+`, `..<`)
      // (`external named x`: the name a hole's code is written as (`a`, `a: T`, `a = v`), its place's; else nothing)
      if (word(a, m, W_NAMED) && rest < z) { let q = rest; while (q < z && b(q) > 32) q++; return hole_name(names, rest, q) || w(NOTHING); }
      // (`external names L a b`: the list L, its first link given the name hole a is written as, its last the one of b (`_`,
      // neither); `external named_like L at`: L's last link given the name the link at has)
      if ((word(a, m, W_NAMES) || word(a, m, W_NAMED_LIKE)) && rest < z) return names_given(t, a, m, rest, z, names, f, self);
      // (`external admits v t`: whether v is a t, where the kernel can tell (as `is` answers it); not known, nothing)
      if (word(a, m, W_ADMITS) && rest < z) { let q = rest; while (q < z && b(q) > 32) q++; const v = block(t, rest, q, names, f, self, 0, 1, 0, self, 0), ty = q < z ? block(t, skip(q, z), z, names, f, self, 0, 1, 0, self, 0) : 0; const k = ty ? admits(t, v, ty, 0) : -1; return k === 1 ? w(TRUE_) : k === 0 ? w(FALSE_) : w(NOTHING); }
      if (word(a, m, W_OPERATED) && rest < z) { const v = block(t, rest, z, names, f, self, 0, 1, 0, self, 0); return v && w(v + N_IS) === IS_TEXT && operated(w(v + N_A), w(v + N_B)) ? w(TRUE_) : w(FALSE_); }
      // (`external member x name`: what x answers under the name a text holds (x's own, else what it is made of); none,
      // nothing. `external member x name value`: x given that value under that name, the value)
      if (word(a, m, W_MEMBER) && rest < z) {
        let mq = rest; while (mq < z && b(mq) > 32) mq++;
        let mr = skip(mq, z); while (mr < z && b(mr) > 32) mr++;
        let mx = block(t, rest, mq, names, f, self, 0, 1, 0, self, 0); const mk = mq < z ? block(t, skip(mq, z), mr, names, f, self, 0, 1, 0, self, 0) : 0;
        // (a name's head, what `y := x` answers: what the name gives, read where this is)
        if (mx && w(mx + N_IS) === IS_HEAD && w(mx + N_A) < w(mx + N_B) && self) { const hr = rule_seen(t, self, w(mx + N_A), w(mx + N_B) - w(mx + N_A), 0); if (hr && !w(hr + R_HOLES)) { const hv = apply(t, hr, 0, frame(0, 0, self, 0, 0, 0, 0, self, self), 0, self, w(mx + N_A), w(mx + N_B), self, self); if (hv && w(hv + N_IS) === IS_NODE) mx = hv; } }
        if (!mx || !mk || w(mk + N_IS) !== IS_TEXT || w(mk + N_A) >= w(mk + N_B)) return w(NOTHING);
        if (skip(mr, z) < z) {
          const mv = block(t, skip(mr, z), z, names, f, self, 0, 1, 0, self, 0);
          if (w(mx + N_IS) !== IS_NODE) return w(NOTHING);
          bound(w(mk + N_A), w(mk + N_B), mx, mv);
          // (a name x declares itself (`x: T` read in it, STATIC): given so, that name's value too, what a bare name reads)
          const mb = latest(mx);
          if (mb && w(mb + R_KIND) === VALUE && w(mb + R_BS) === mv) for (let r = w(mb), k = 0; r && r !== w(mx + N_BASE) && k < 4096; r = w(r), k++) { const rh = w(r + R_HEAD); if (w(r + R_KIND) === VALUE && !w(r + R_HOLES) && (w(r + R_FLAGS) & STATIC) && rh && trimmed(w(rh + N_A), w(rh + N_B) - w(rh + N_A), w(mk + N_A), w(mk + N_B))) { put(mb + R_FLAGS, w(mb + R_FLAGS) | STATIC); break; } }
          return mv;
        }
        // (the rule x sees by that name (its own, then what it is made of): not one of the language's own, applied on x)
        return member_seen(t, mx, w(mk + N_A), w(mk + N_B) - w(mk + N_A), mx, 0) || w(NOTHING);
      }
      // (`external output x`: the text x, written out as it is (where the host writes: its standard output); a list of texts,
      // each in turn)
      if (word(a, m, W_OUTPUT) && rest < z) {
        const ov = block(t, rest, z, names, f, self, 0, 1, 0, self, 0);
        if (ov && w(ov + N_IS) === IS_TEXT) told(w(ov + N_A), L_OUTPUT, w(ov + N_A), w(ov + N_B));
        else if (ov && w(ov + N_IS) === IS_NODE) for (let ol = held(t, ov, W_HEAD, 0), ok = 0; ol && ol !== w(NOTHING) && ok < 1 << 16; ol = held(t, ol, W_NEXT, 0), ok++) { const oe = held(t, ol, W_VALUE, 0); if (oe && w(oe + N_IS) === IS_TEXT) told(w(oe + N_A), L_OUTPUT, w(oe + N_A), w(oe + N_B)); }
        return ov || w(NOTHING);
      }
      // (`external quoted x`: whether the text x holds a text written in it (a `"` or a backtick), or an escape (`\s`))
      if (word(a, m, W_QUOTED) && rest < z) { const qv = block(t, rest, z, names, f, self, 0, 1, 0, self, 0); if (!qv || w(qv + N_IS) !== IS_TEXT) return w(FALSE_); for (let qp = w(qv + N_A); qp < w(qv + N_B); qp++) if (b(qp) === 34 || b(qp) === 96 || b(qp) === 92) return w(TRUE_); return w(FALSE_); }
      // (`external typed_name x`: the name a hole's code is written as when it is written with a type, `a: T` (a field); else
      // nothing)
      if (word(a, m, W_TYPED_NAME) && rest < z) { let q = rest; while (q < z && b(q) > 32) q++; const tn = hole_name(names, rest, q); if (!tn) return w(NOTHING); let ta = w(tn + N_B); const hx2 = named(w(names + F_RULE), rest, q), o2 = follow(names + F_TAKES + TAKE * hx2, 1), te = w(o2 + 4); while (ta < te && b(ta) <= 32) ta++; return ta < te && b(ta) === 58 ? tn : w(NOTHING); }
      // (`external readable x`: whether the kernel can read a text by the type x throughout (what `text_admits` answers))
      if (word(a, m, W_READABLE) && rest < z) { const rv = block(t, rest, z, names, f, self, 0, 1, 0, self, 0); return rv && readable(t, rv, 0) ? w(TRUE_) : w(FALSE_); }
      // (`external arguments`: what the program was called with, one text, each argument ended by `\0` (as the OS holds them))
      if (word(a, m, W_ARGUMENTS)) { const av = w(MAPPED) + 8 * ARGV_SLOT; return node(IS_TEXT, w(av), w(av) + w(av + 4), w(TEXTS) || w(GLOBAL), 0); }
      if (word(a, m, W_MEMBERS)) { const n = names && w(names + N_IS) === IS_FRAME ? w(names + F_THIS) : self; if (n && n !== w(GLOBAL)) put(w(n + N_BASE) + R_KIND, MEMBERS_MARK); return n; }
      if (word(a, m, W_GOTO)) { go(t, rest, z - rest, f, 0); return 0; }
      if (word(a, m, W_INCLUDE) || word(a, m, W_READ)) { files(word(a, m, W_INCLUDE) ? 1 : 2, rest, z, names); return 0; }
      // (the kernel's own map: `text`, what it is read in is what every text the kernel holds is made of)
      if (mapped(a, m, M_TEXT)) { put(TEXTS, w(f + F_THIS)); return 0; }
      // (`given `{given} given {value}``: that rule, what it was given a head (one name defined): that head, what its own body
      // answers (an acceleration: the same with it and without))
      if (mapped(a, m, M_GIVEN) || mapped(a, m, M_TAKING) || mapped(a, m, M_GLYPHS) || mapped(a, m, M_SUPERPOSING) || mapped(a, m, M_CUTS)) { const flag = mapped(a, m, M_GIVEN) ? GIVES : mapped(a, m, M_GLYPHS) ? GLYPHS : mapped(a, m, M_SUPERPOSING) ? SUPERPOSING : mapped(a, m, M_CUTS) ? CUTS : TAKES; let q = rest, y = z; if (b(q) === 96 && b(y - 1) === 96 && y - q > 1) { q++; y--; } if (flag === SUPERPOSING) { const at_ = w(SUPERPOSING_AT) ? SUPERPOSING_AT + 8 : SUPERPOSING_AT; put(at_, q); put(at_ + 4, y - q); } for (let o = latest(w(GLOBAL)), k = 0; o && k < 1 << 20; o = w(o), k++) { const hd = w(o + R_HEAD); if (w(o + R_KIND) === RULE && hd && w(hd + N_B) - w(hd + N_A) === y - q && same(q, w(hd + N_A), y - q)) { put(o + R_FLAGS, w(o + R_FLAGS) | flag); if (flag === TAKES) spans(o); break; } } return 0; }
      // (`count`: what it is read in, Number, is what every count the kernel holds is made of; `truth t f`: what it answers as true
      // and as false)
      if (mapped(a, m, M_COUNT)) { put(COUNTED, w(f + F_THIS)); return 0; }
      // (`joined a b`: the text of a's characters, then b's (two texts); of anything else, nothing (the language's rule then))
      if (mapped(a, m, M_JOINED)) { let jq = rest; while (jq < z && b(jq) > 32) jq++; const jx = block(t, rest, jq, names, f, self, 0, 1, 0, self, 0); if (stopped(t)) return 0; const jy = block(t, skip(jq, z), z, names, f, self, 0, 1, 0, self, 0); if (stopped(t)) return 0; const jv = joined_text(jx, jy); return jv === w(NOTHING) ? 0 : jv; }
      // (`arrayed op …`: a list made, or given to, as the language's Array does it (`new`, `append`, `prepend`, `listed`,
      // `joined`), the same members on the same nodes, made at once: the list's `head`/`tail`, each link's `value`/`next`/
      // `previous`/`written_name`)
      if (mapped(a, m, M_ARRAYED) && rest < z) return arrayed_read(t, rest, z, names, f, self);
      if (word(a, m, W_LEVEL_IN) || word(a, m, W_LEVEL_OUT)) return levels(t, a, m, rest, z, names, f, self);
      if (word(a, m, W_LEVEL_READS) && rest < z) return level_reads(t, rest, z, names, f, self);
      // (`linked x`: how many vertices the list x links (Array's `count`); of anything else, nothing)
      if (mapped(a, m, M_LINKED)) { const lnk_x = block(t, rest, z, names, f, self, 0, 1, 0, self, 0); return stopped(t) ? 0 : linked_count(t, lnk_x); }
      // (`external kept` in a type: what its checks answer kept, though they apply its rules (rules that only answer what was
      // read, the same each time it is read))
      if (mapped(a, m, M_KEPT)) { const kn = w(KEPT_N); if (kn < KEPT_CAP) { put(KEPT + 4 * kn, w(f + F_THIS)); put(KEPT_N, kn + 1); } return 0; }
      // (`character`: what it is read in, Char, is what a text's characters are: a count, its code point)
      if (mapped(a, m, M_CHARACTER)) { put(CHARS, w(f + F_THIS)); return 0; }
      // (`superposed`, read in Node: its rule `superposed`, answered by the kernel: made by `|` or `&` (a node of its own with
      // `superposes`, `conjoins` or `conjoined`, short of Node's), as that rule answers, without a call)
      if (mapped(a, m, M_SUPERPOSED)) { put(SUPER_NODE, w(f + F_THIS)); return 0; }
      if (mapped(a, m, M_TRUTH)) { let q = rest; while (q < z && b(q) > 32) q++; put(TRUE_, block(t, rest, q, names, f, self, 0, 1, 0, self, 0)); put(FALSE_, block(t, skip(q, z), z, names, f, self, 0, 1, 0, self, 0)); return 0; }
      // (`numeral `{head}``: that rule, a numeral: the count its hole's digits (in ten) write, the same as its body answers)
      if (mapped(a, m, M_NUMERAL)) { let q = rest, y = z; if (b(q) === 96 && b(y - 1) === 96 && y - q > 1) { q++; y--; } for (let o = latest(w(GLOBAL)), k = 0; o && k < 1 << 20; o = w(o), k++) { const hd = w(o + R_HEAD); if (hd && w(hd + N_B) - w(hd + N_A) === y - q && same(q, w(hd + N_A), y - q)) put(o + R_FLAGS, w(o + R_FLAGS) | NUMERAL); } if (w(NUMERAL_AT) && !(y - q === w(NUMERAL_AT + 4) && same(q, w(NUMERAL_AT), y - q))) { const second = alloc(8); put(second, q); put(second + 4, y - q); put(NUMERAL_AT2, second); } else { put(NUMERAL_AT, q); put(NUMERAL_AT + 4, y - q); } return 0; }
      // (`number op a b`: of two counts (or Numbers written one after another down to zero), what op answers, as the language's
      // rules do; of anything else, nothing (the language's rule then))
      if (mapped(a, m, M_NUMBER)) { let o = rest; while (o < z && b(o) > 32) o++; if (o - rest === 4 && same(rest, w(w(WORDS) + 8 * W_NEXT), 4)) { const x = block(t, skip(o, z), z, names, f, self, 0, 1, 0, self, 0), c = stopped(t) ? -1 : count_of(t, x, names, f); return c > 0 ? counted(c - 1) : w(NOTHING); } put(NUMBERS, w(f + F_THIS)); put(NUMBER_OPS, rest); put(NUMBER_OPS + 4, z - rest); return 0; }
      // (`int32 op a b`: what WebAssembly's i32 instruction op answers of a and b, each an Int32's bits (a text of 4 bytes) or a
      // count, as bits; `int32 of x`, `int32 count x`, `int32 text x`: x as bits, as a count (none below zero), as its digits)
      if (mapped(a, m, M_INT32)) {
        let q = rest; while (q < z && b(q) > 32) q++;
        const o1 = skip(q, z); let q1 = o1; while (q1 < z && b(q1) > 32) q1++;
        let x = block(t, o1, q1, names, f, self, 0, 1, 0, self, 0);
        // (`int32 numeral x`: the text x read as a numeral; one not beginning with a digit, nothing)
        if (q - rest === 7 && b(rest) === 110) return !stopped(t) && x && w(x + N_IS) === IS_TEXT && w(x + N_B) > w(x + N_A) && b(w(x + N_A)) >= 48 && b(w(x + N_A)) <= 57 ? int32(int32_numeral(w(x + N_A), w(x + N_B))) : w(NOTHING);
        // (`int32 bytes x`: how many bytes the text x is (a text of bytes, `byte`s joined); of anything else, nothing)
        if (q - rest === 5 && b(rest) === 98) return !stopped(t) && x && w(x + N_IS) === IS_TEXT ? int32(w(x + N_B) - w(x + N_A)) : w(NOTHING);
        // (a Number the language makes, `Number(next: …)` down to zero (`0`): its count)
        if (!stopped(t) && !int32_is(x)) { const cx = count_of(t, x, names, f); if (cx >= 0) x = counted(cx); }
        if (stopped(t) || !int32_is(x)) return w(NOTHING);
        const vx = int32_value(x), n = q - rest;
        if (n === 2 && b(rest) === 111 && b(rest + 1) === 102) return int32(vx);
        if (n === 5 && b(rest) === 99) return vx < 0 ? w(NOTHING) : counted(vx);
        if (n === 4 && b(rest) === 116) return int32_text(vx);
        // (`int32 byte x`: x's last eight bits, a text of that one byte (a Byte held as the backend holds it; texts of bytes
        // joined by `joined`))
        if (n === 4 && b(rest) === 98) { const at = alloc(1); setb(at, vx & 255); return node(IS_TEXT, at, at + 1, w(TEXTS) || w(GLOBAL), 0); }
        const o2 = skip(q1, z); let y = block(t, o2, z, names, f, self, 0, 1, 0, self, 0);
        if (!stopped(t) && !int32_is(y)) { const cy = count_of(t, y, names, f); if (cy >= 0) y = counted(cy); }
        if (stopped(t) || !int32_is(y)) return w(NOTHING);
        return int32_answer(rest, n, vx, int32_value(y));
      }
      // (`nothing v`: v is what the kernel's nothing is, read on)
      if (mapped(a, m, M_NOTHING)) { put(NOTHING, rest < z ? block(t, rest, z, names, f, self, 0, 1, 0, self, 0) : w(f + F_THIS)); return 0; }
      // (`same a b`: two texts of the same characters (bytes): the first; else nothing (a text's characters are what the
      // kernel holds; the language compares them structurally from here))
      // (`until a b`: of a text, what is before where b (a rest of it) begins; else nothing)
      if (mapped(a, m, M_UNTIL)) {
        let q = rest; while (q < z && b(q) > 32) q++;
        const x = block(t, rest, q, names, f, self, 0, 1, 0, self, 0), y = block(t, skip(q, z), z, names, f, self, 0, 1, 0, self, 0);
        if (!x || !y || w(x + N_IS) !== IS_TEXT || w(y + N_IS) !== IS_TEXT || w(y + N_A) < w(x + N_A) || w(y + N_A) > w(x + N_B)) return w(NOTHING);
        return node(IS_TEXT, w(x + N_A), w(y + N_A), w(TEXTS) || w(GLOBAL), 0);
      }
      // (`unescaped x`: of a text, each escape in it what it stands for, as String.ray's `Escape` answers (`\0`, `\n`, …, and
      // `\x41`, `\u263A`, `\u{263A}` by code point, written as UTF-8); none in it, the text itself)
      if (mapped(a, m, M_UNESCAPED)) {
        const u_x = block(t, rest, z, names, f, self, 0, 1, 0, self, 0);
        if (!u_x || w(u_x + N_IS) !== IS_TEXT) return u_x || w(NOTHING);
        const u_xs = w(u_x + N_A), u_xe = w(u_x + N_B);
        let u_p = u_xs; while (u_p < u_xe && b(u_p) !== 92) u_p++;
        if (u_p === u_xe) return u_x;
        const u_out = allocb(4 * (u_xe - u_xs) + 4); let u_o = u_out;
        for (u_p = u_xs; u_p < u_xe; u_p++) {
          const u_c = b(u_p);
          if (u_c !== 92 || u_p + 1 >= u_xe) { setb(u_o++, u_c); continue; }
          const u_e = b(u_p + 1), u_simple = escape_of(u_e);
          if (u_simple >= 0) { setb(u_o++, u_simple); u_p++; continue; }
          if (u_e === 120 || u_e === 117 || u_e === 85) {
            let u_q = u_p + 2, u_cp = 0, u_k = 0; const u_braced = u_e !== 120 && b(u_q) === 123, u_width = u_braced ? 6 : u_e === 120 ? 2 : u_e === 117 ? 4 : 6;
            if (u_braced) u_q++;
            while (u_q < u_xe && u_k < u_width && hex_digit(b(u_q)) >= 0) { u_cp = u_cp * 16 + hex_digit(b(u_q)); u_q++; u_k++; }
            if (u_braced ? (u_k > 0 && b(u_q) === 125) : u_k === u_width) {
              if (u_braced) u_q++;
              if (u_cp < 128) setb(u_o++, u_cp);
              else if (u_cp < 2048) { setb(u_o++, 192 | u_cp >> 6); setb(u_o++, 128 | u_cp & 63); }
              else if (u_cp < 65536) { setb(u_o++, 224 | u_cp >> 12); setb(u_o++, 128 | u_cp >> 6 & 63); setb(u_o++, 128 | u_cp & 63); }
              else { setb(u_o++, 240 | u_cp >> 18); setb(u_o++, 128 | u_cp >> 12 & 63); setb(u_o++, 128 | u_cp >> 6 & 63); setb(u_o++, 128 | u_cp & 63); }
              u_p = u_q - 1; continue;
            }
          }
          setb(u_o++, u_c);
        }
        return node(IS_TEXT, u_out, u_o, w(TEXTS) || w(GLOBAL), 0);
      }
      // (`past a b`: of a text beginning with another, what follows that beginning; else nothing)
      if (mapped(a, m, M_PAST)) {
        let q = rest; while (q < z && b(q) > 32) q++;
        const x = block(t, rest, q, names, f, self, 0, 1, 0, self, 0), y = block(t, skip(q, z), z, names, f, self, 0, 1, 0, self, 0);
        if (!x || !y || w(x + N_IS) !== IS_TEXT || w(y + N_IS) !== IS_TEXT) return w(NOTHING);
        const n = w(y + N_B) - w(y + N_A);
        if (w(x + N_B) - w(x + N_A) < n || !same(w(x + N_A), w(y + N_A), n)) return w(NOTHING);
        return node(IS_TEXT, w(x + N_A) + n, w(x + N_B), w(TEXTS) || w(GLOBAL), 0);
      }
      // (`dotted x`: of a text, whether a `.` is in it on its own (not after a name or what closes, nor before a name, `.`
      // or `{`; not in quotes): the language's `bare_dot`, answered by the kernel)
      if (mapped(a, m, M_DOTTED)) {
        const x = block(t, rest, z, names, f, self, 0, 1, 0, self, 0);
        if (!x || w(x + N_IS) !== IS_TEXT) return w(FALSE_);
        const xs = w(x + N_A), xe = w(x + N_B), cl = w(CLASSES);
        let quote = 0;
        for (let p = xs; p < xe; p++) {
          const c = b(p);
          if (quote) { if (c === quote) quote = 0; continue; }
          if (c === 34 || c === 96) { quote = c; continue; }
          if (c !== 46) continue;
          const pc = p > xs ? b(p - 1) : 32, nc = p + 1 < xe ? b(p + 1) : 32;
          const after = p > xs && (b(cl + pc) === 1 || pc === 41 || pc === 93 || pc === 34 || pc === 96 || pc === 46);
          const before = p + 1 < xe && (b(cl + nc) === 1 || nc === 46 || nc === 123);
          if (!after && !before) return w(TRUE_);
        }
        return w(FALSE_);
      }
      if (mapped(a, m, M_SAME)) {
        // (the two written after it, each read where it is written: `external same this other`)
        let q = rest; while (q < z && b(q) > 32) q++;
        const x = block(t, rest, q, names, f, self, 0, 1, 0, self, 0), y = block(t, skip(q, z), z, names, f, self, 0, 1, 0, self, 0);
        // (a place, a name being declared, is the name it is: `(part).name.same_characters(place)` in destructuring)
        const xi = x ? w(x + N_IS) : -1, yi = y ? w(y + N_IS) : -1;
        if ((xi !== IS_TEXT && xi !== IS_PLACE && xi !== IS_HEAD) || (yi !== IS_TEXT && yi !== IS_PLACE && yi !== IS_HEAD)) return w(NOTHING);
        const n = w(x + N_B) - w(x + N_A);
        return n === w(y + N_B) - w(y + N_A) && same(w(x + N_A), w(y + N_A), n) ? x : w(NOTHING);
      }
      // (`first`, `rest` of a text: its first character (as UTF-8 writes it), the text after it; of no text, nothing)
      if (mapped(a, m, M_FIRST) || mapped(a, m, M_REST)) {
        const th = w(names + F_THIS), rc = w(names + F_RECEIVER), x = rc && w(rc + N_IS) === IS_TEXT ? rc : th;
        if (!x || w(x + N_IS) !== IS_TEXT) return 0;
        // (of a text of no characters: none)
        if (w(x + N_A) >= w(x + N_B)) return w(NOTHING);
        const xa = w(x + N_A), xb = w(x + N_B), c = b(xa), n = c < 0x80 ? 1 : c < 0xE0 ? 2 : c < 0xF0 ? 3 : 4, cut = xa + n < xb ? xa + n : xb;
        if (mapped(a, m, M_FIRST) && w(CHARS)) { let cp = c < 0x80 ? c : c < 0xE0 ? c & 31 : c < 0xF0 ? c & 15 : c & 7; for (let i = 1; i < n && xa + i < xb; i++) cp = cp << 6 | (b(xa + i) & 63); return node(IS_NODE, cp + 1, 0, w(CHARS), 0); }
        return mapped(a, m, M_FIRST) ? node(IS_TEXT, xa, cut, w(TEXTS) || w(GLOBAL), 0) : node(IS_TEXT, cut, xb, w(TEXTS) || w(GLOBAL), 0);
      }
      if (!word(a, m, W_LABEL)) say(t, s, L_EXTERNAL, a, m);
      return 0;
    }
    if (DEBUG) count(K_APPLY);
    // (applied in a check, read quietly: of an allowance of its own, ten times as much (what a check costs depends on what was
    // checked once already, kept: what a test may apply does not))
    const quietly = w(THREAD + T_QUIET) >= TYPINGS, budget = quietly ? w(t + T_QBUDGET) - 1 : w(t + T_BUDGET) - 1;
    put(t + (quietly ? T_QBUDGET : T_BUDGET), budget); set(THREAD + T_RAN, 1);
    if (budget < 0) { if (DEBUG && !w(t + T_FAULT)) debug(D_FAULT, L_BUDGET, s, e); put(t + T_FAULT, L_BUDGET); return 0; }
    // (out of memory: nothing more is made)
    if (w(OOM)) return 0;
    set(t + T_LEXV, lex);
    const applied = frame(rule, f, self, s, e, caps, names, written, on);
    set(t + T_LEXV, 0);
    // (a left side being read, a rule composing parts of it (its head holes apart by a character on its own, `{a}, {b}`): each
    // part read as a left side first, a word a name declared here, whatever its body then reads them as (`,`'s `list ===
    // declared`, a visible `type` not its value: GN3); a rule of an operator (`{x}: {type}`, `{x} ^{style}`) reads its own)
    if (w(t + T_DECL) && lefts() && in_left(s, e) && kind !== DEFINE && !(w(rule + R_FLAGS) & METHOD) && composes(rule)) for (let i = 0; i < w(rule + R_HOLES); i++) {
      const tk = applied + F_TAKES + TAKE * i, a = skip(w(tk), w(tk + 4)); let z = w(tk + 4); while (z > a && b(z - 1) <= 32) z--;
      if (a >= z || !in_left(a, z)) continue;
      if (worded(a, z)) { const into = w(names + F_RECEIVER) === w(names + F_THIS) && run_node(self) && dotted(rule) ? w(self + N_ALSO) : self; put(tk + T_VALUE, placed(t, a, z, into)); aput(tk + T_STATE, 3); }
      else { valued(t, tk); if (stopped(t)) return 0; }
    }
    // (a name with a type, `{x}: {type}` read in a left side (`(count: Number)`, `named: "p"`): the name declared here, as
    // a word of a composed left side is, not a visible one's place (a list's `count`); its type a value)
    if (w(t + T_DECL) && lefts() && in_left(s, e) && kind !== DEFINE && !(w(rule + R_FLAGS) & METHOD) && w(rule + R_PARTS) >= 2 && (w(rule + R_PART) & 15) === HOLE && w(rule + R_PART + PART) === LITERAL && b(w(rule + R_PART + PART + 4)) === 58) {
      const tk = applied + F_TAKES, a = skip(w(tk), w(tk + 4)); let z = w(tk + 4); while (z > a && b(z - 1) <= 32) z--;
      if (a < z && in_left(a, z) && worded(a, z) && !aload(tk + T_STATE)) { put(tk + T_VALUE, placed(t, a, z, self)); aput(tk + T_STATE, 3); }
    }
    if ((w(rule + R_FLAGS) & TAKES) && !w(t + T_DECL)) { const d = took(t, applied, self); if (d) return d; }
    if ((w(rule + R_FLAGS) & REFUSES) && w(t + T_ALT) === rule) { put(t + T_ALT, 0); if (DEBUG) debug(D_FAULT, 1093, 10, 1); if (refused(t, rule, applied, written)) { if (DEBUG) debug(D_FAULT, 1093, 11, 1); put(t + T_ALT, 1); return 0; } }
    if ((w(rule + R_FLAGS) & SUPERPOSING) && w(t + T_ALT) === rule) { put(t + T_ALT, 0); const d = superposing(t, rule, applied); if (d !== -1) return d; }
    if (w(rule + R_FLAGS) & GIVES) { const g = valued(t, applied + F_TAKES); if (stopped(t)) return 0; if (g && w(g + N_IS) === IS_HEAD) return g; }
    // (the map's `cuts`: of a list of types and a text, the kernel's cut where it can tell; else the language's loop)
    if ((w(rule + R_FLAGS) & CUTS) && !w(t + T_DECL) && w(rule + R_HOLES) === 2) { const l = valued(t, applied + F_TAKES), x = valued(t, applied + F_TAKES + TAKE); if (stopped(t)) return 0; const c = cut_of(t, l, x); if (c) return c; }
    // (a numeral the map names whose head was made again, its type read later: named by its head as written)
    if (w(NUMERAL_AT) && !(w(rule + R_FLAGS) & NUMERAL)) { const hd = w(rule + R_HEAD); if (hd && numeral_head(w(hd + N_A), w(hd + N_B) - w(hd + N_A))) put(rule + R_FLAGS, w(rule + R_FLAGS) | NUMERAL); }
    if (w(SUPER_NODE) && w(rule + R_OWNER) === w(SUPER_NODE) && !w(rule + R_HOLES)) { const hd = w(rule + R_HEAD); if (hd && w(hd + N_B) - w(hd + N_A) === 10 && same(w(hd + N_A), w(w(MAPPED) + 8 * M_SUPERPOSED), 10)) return superposed_node(self, 0) ? w(TRUE_) : w(FALSE_); }
    if ((w(rule + R_FLAGS) & NUMERAL) && w(COUNTED)) { const c = numeral_of(w(caps), w(caps + 4)); if (c >= 0) return counted(c); }
    // (Number's `succ`, on a count: the one after it)
    if (w(NUMBER_OPS) && w(rule + R_OWNER) === w(NUMBERS) && number_op(rule) === 115) { const c = count_of(t, self, names, f); if (c >= 0 && c < 0x7FFFFFFE) return counted(c + 1); }
    if (kind === DEFINE) { if (DEBUG) debug(D_APPLY, s, e, rule); const d = define(t, applied); if (DEBUG) debug(D_APPLY_END, s, e, rule); return d; }
    // (applied in what it applies, too deep: what it reads reads itself; which rules, again and again, kept to be said)
    const depth = w(t + T_DEPTH);
    if (depth >= DEPTH) { if (!w(t + T_FAULT)) { if (DEBUG) debug(D_FAULT, L_DEEP, s, e); deep(t, depth); } put(t + T_FAULT, L_DEEP); return 0; }
    if (w(t + T_STACK)) { put(w(t + T_STACK) + 8 * depth, rule); put(w(t + T_STACK) + 8 * depth + 4, s); }
    set(t + T_DEPTH, depth + 1);
    // (a rule whose body is one statement, `({grouped}) => grouped`, a name given a value, `.{member} => {member}`: that
    // statement read in its frame as the body would, its body not run as one)
    if (!w(t + T_DECL) && kind === RULE && !w(rule + R_FN) && !(w(rule + R_FLAGS) & (GIVES | TAKES | OWNS | GLYPHS | NUMERAL | SUPERPOSING | REFUSES))) {
      const bd = body(t, rule), me = w(applied + F_THIS);
      const rd = w(bd) === 1 && w(bd + 4) === S_READ ? w(bd + 4 + 12) : 0;
      // (one of its holes, or one of what it was written in: what it took, whatever node is being made)
      if (rd && (w(rd) === K_NAME || !(latest(me) !== w(me + N_BASE) && making(me)))) {
        let answer = w(rd) === K_NAME ? valued(t, take(w(rd + 20) || applied, w(rd + 12), w(rd + 16))) : ev(t, rd, applied, applied, me, 1, me, me);
        if (w(t + T_FAULT) || w(OOM)) answer = 0;
        else if (w(t + T_JUMP_N)) { if (word(w(t + T_JUMP_S), w(t + T_JUMP_S) + w(t + T_JUMP_N), W_AFTERWARDS)) { put(t + T_JUMP_N, 0); defer(applied, 1); } answer = 0; }
        put(applied + N_B, 1);
        if (w(t + T_HOLE) && answer && w(answer + N_IS) === IS_HOLE) extend(t, answer, s, e);
        set(t + T_DEPTH, depth);
        return answer;
      }
    }
    if (DEBUG) debug(D_APPLY, s, e, rule);
    // (a method's body, a call's (`x.f(…)`), is no part of a left side it is read in: names in it are read, not declared)
    // (a rule's body is no part of a left side it is read in (what it composes, `,`, `( )`, is: its holes, by their text))
    // (a method's body, a call's, is no part of a left side it is read in)
    const bd_ = body(t, rule), decl = w(t + T_DECL);
    // (one composing what is written in the left side, its holes' code there (`a, b`, `x[k]`): its body a value, its holes the
    // left side's by their text)
    let composing = 0;
    if (decl && lefts() && !(w(bd_) === 1 && w(bd_ + 4 + 12) && w(w(bd_ + 4 + 12)) === K_REF) && w(rule + R_HOLES)) {
      composing = 1;
      for (let i = 0; i < w(rule + R_HOLES) && composing; i++) { const tk = follow(applied + F_TAKES + TAKE * i, 1); if (!in_left(w(tk), w(tk + 4))) composing = 0; }
    }
    // (nor is the body of a keyword's, `as {target}`, which computes what it answers: only one passing what follows it
    // through, a modifier (`static {statement}`), keeps it a left side)
    if (decl && ((w(rule + R_FLAGS) & METHOD) || composing || ((w(rule + R_PART) & 15) === LITERAL && b(w(CLASSES) + b(w(rule + R_PART + 4))) === 1 && !passes(rule)))) put(t + T_DECL, 0);
    // (a body giving names values of its own, not a closure's (it makes its own node): a node of its own, in where the rule is
    // written, made of what it is read in (what it gives is this run's; `.x := …` is still a member of `.`))
    if ((w(rule + R_FLAGS) & OWNS) && !(w(rule + R_FLAGS) & METHOD) && self && self !== w(GLOBAL) && (w(self + N_IS) === IS_NODE || w(self + N_IS) === IS_TEXT)) { const rc = w(applied + F_RECEIVER), n = node(IS_NODE, 0, applied, w(rule + R_OWNER) || self, self); put(applied + F_THIS, n); put(applied + F_RECEIVER, rc && rc !== self ? rc : n); }
    const answer = ran(t, applied, rule, bd_, 0);
    if ((w(rule + R_FLAGS) & GLYPHS) && answer && !stopped(t)) glyphed(t, answer, applied);
    put(t + T_DECL, decl);
    if (DEBUG) debug(D_APPLY_END, s, e, rule);
    put(applied + N_B, 1);
    if (w(t + T_HOLE) && answer && w(answer + N_IS) === IS_HOLE) extend(t, answer, s, e);
    set(t + T_DEPTH, depth);
    return answer;
  }
  // `goto name`, read where it is not in a body that has the label: to the frame running that body (`afterwards`: the rest of
  // this one put off until everything is read; `report`: what it says, said).
  function go(t: number, s: number, n: number, f: number, v: number) {
    if (word(s, s + n, W_REPORT)) { report(t, f); return; }
    put(t + T_JUMP_S, s); put(t + T_JUMP_N, n); put(t + T_JUMP_V, v);
  }
  // Files, where the text from s to e says (a hole written there: what it took): to be read by the host when what is being
  // read now is (`include`: here, in what this is read in; `read`: each in a scope of its own), in the order asked.
  function files(kind: number, s: number, e: number, names: number) {
    const x = names ? ref(w(names + F_RULE), w(names + F_CLOSURE), s, e, 1) : 0;
    if (x) { const tk = follow(take(names, (x - 1) >> 16, (x - 1) & 0xFFFF), 0); s = w(tk); e = w(tk + 4); }
    const k = xadd(READS_N, 1), q = w(READS) + 16 * k;
    if (k < w(READS_CAP)) { put(q, kind); put(q + 4, s); put(q + 8, e); put(q + 12, names ? w(names + F_THIS) : w(GLOBAL)); }
  }
  function report(t: number, f: number) {
    // (in a test, said where the test is: what applied it may lead elsewhere, a closure's callers to where it was written)
    let root = f; if (w(t + T_TESTING) && w(t + T_ROOT)) root = w(t + T_ROOT); else while (root && !(w(root + N_A) & ROOT)) root = w(root + F_CALLER);
    const rule = w(f + F_RULE), tk = rule && w(rule + R_HOLES) ? follow(f + F_TAKES, 0) : 0;
    // (the rule that says it, whose style says how much it matters: told first, then what it says)
    if (rule) log(w((root || f) + F_START), L_STYLED, w(rule + R_HEAD), 0);
    say(t, w((root || f) + F_START), L_REPORT, tk ? w(tk) : 0, tk ? w(tk + 4) : 0);
  }
  // (the last of a body's labels written as the text from s, n long: where it is, or -1)
  function labelled(bd: number, s: number, n: number) {
    for (let k = w(bd) - 1; k >= 0; k--) { const st = bd + 4 + STEP * k; if (w(st) === S_LABEL && w(st + 16) === n && same(w(st + 12), s, n)) return k; }
    return -1;
  }
  // A body run: its statements one after another, a label jumped to where it is (one written as a value, where what is gone to
  // is that value). Going to `afterwards`: the rest put off (a test).
  // (a body run: built, its rule's own function, when it is that body; else read step by step)
  function ran(t: number, f: number, rule: number, bd: number, from: number): number {
    const fn = rule ? w(rule + R_FN) : 0;
    return fn && w(rule + R_BODY) === bd ? compiled(fn, t, f, from) : exec(t, f, bd, from);
  }
  function exec(t: number, f: number, bd: number, from: number): number {
    // (a loop's turns, a level of their own: what they made and nothing holds let go of as it goes round, not when it ends)
    let answer = 0, it = 0, it_slot = 0, it_rules = 0;
    const n = w(bd);
    for (let pc = from; pc < n;) {
      const st = bd + 4 + STEP * pc, kind = w(st), self = w(f + F_THIS);
      if (kind === S_LABEL || kind === S_LABELLED) { pc++; continue; }
      if (kind === S_GOTO) {
        const to = labelled(bd, w(st + 12), w(st + 16));
        if (to >= 0) { if (to <= pc) { again(f); if (it && w(t + T_CHUNK) - w(w(t + T_LVL) + 24 * (it - 1)) > 1 << 18) { answer = turned(t, it, answer, it_slot, it_rules); it = 0; } if (!it) { it = turning(t, w(f + F_RULE)); it_slot = w(t + T_SLOT); it_rules = w(RULES_N); } } pc = to; continue; }
        if (word(w(st + 12), w(st + 12) + w(st + 16), W_AFTERWARDS)) { defer(f, pc + 1); answer = 0; break; }
        go(t, w(st + 12), w(st + 16), f, answer);
      } else if (kind === S_TO) {
        const target = of(t, w(st + 12), f, self);
        if (stopped(t)) return 0;
        let to = pc + 1;
        for (let j = 0; j < n; j++) { const o = bd + 4 + STEP * j; if (w(o) === S_LABELLED && of(t, w(o + 12), f, self) === target) { to = j; break; } }
        pc = to; continue;
      } else {
        // (in a node this body is making (`external .`), what its earlier statements defined there: read again with them first)
        let r = w(st + 12);
        if (latest(self) !== w(self + N_BASE) && making(self) && could(self, w(st + 4), w(st + 8))) { const again = reading(t, w(st + 4), w(st + 8), w(f + F_RULE), w(f + F_CLOSURE), latest(self), self, 0, 0, 0, 0); if (owned(again, self)) r = again; }
        answer = ev(t, r, f, f, self, pc === n - 1 ? 1 : 0, self, self);
      }
      if (w(t + T_FAULT) || w(OOM)) { answer = 0; break; }
      const jn = w(t + T_JUMP_N);
      if (jn) {
        const js = w(t + T_JUMP_S), to = labelled(bd, js, jn);
        if (to >= 0) { const back = to <= pc; if (back) again(f); pc = to; if (w(t + T_JUMP_V)) answer = w(t + T_JUMP_V); put(t + T_JUMP_N, 0); if (back) { if (it && w(t + T_CHUNK) - w(w(t + T_LVL) + 24 * (it - 1)) > 1 << 18) { answer = turned(t, it, answer, it_slot, it_rules); it = 0; } if (!it) { it = turning(t, w(f + F_RULE)); it_slot = w(t + T_SLOT); it_rules = w(RULES_N); } } continue; }
        if (word(js, js + jn, W_AFTERWARDS)) { put(t + T_JUMP_N, 0); defer(f, pc + 1); answer = 0; break; }
        answer = 0; break;
      }
      pc++;
    }
    if (it) answer = turned(t, it, answer, it_slot, it_rules);
    return answer;
  }
  // (a level begun for a loop's turns, as one is for an application; none past the deepest: 0)
  function turning(t: number, rule: number): number {
    const lv = w(t + T_LVL), n = w(t + T_LVL_N);
    if (!w(t + T_FREEING) || !lv || n >= DEPTH) return 0;
    const start = w(t + T_CHUNK), cend = w(t + T_CHUNK_END), at = lv + 24 * n, below = n ? at - 24 : 0;
    set(at, start); set(at + 4, 0x7FFFFFFF); set(at + 8, cend); set(at + 12, below && w(below + 8) === cend ? w(below + 12) : start); set(at + 16, rule); set(at + 20, w(t + T_WEAK_N));
    const ev0 = w(t + EV); if (ev0 && w(ev0)) { if (!n) { set(ev0 + 8, 0); set(ev0 + 40, 0); } if (n < 6000) set(w(ev0 + 16) + 4 * n, w(ev0 + 8)); }
    set(t + T_LVL_N, n + 1);
    return n + 1;
  }
  // (and ended: what still holds what the turns made (the loop's frame too, older) moved together, the rest let go of)
  function turned(t: number, it: number, v: number, slot0: number, rules0: number): number {
    const n = it - 1, at = w(t + T_LVL) + 24 * n, below = n ? at - 24 : 0, start = w(at), cend = w(at + 8);
    set(t + T_LVL_N, n);
    const now = w(t + T_CHUNK), lowest = w(at + 4), ev0 = w(t + EV);
    if (ev0 && w(ev0) && !w(ev0 + 40) && lowest >= 0 && now - start > 1 << 18 && w(t + T_CHUNK_END) === cend && n < 6000) { if (ev_private(t)) v = evacuate(t, start, now, at, n, v, slot0, rules0); }
    if (below && lowest < w(below + 4)) set(below + 4, lowest);
    return v;
  }
  // (a jump back in a body, a loop: what its holes took is read again, as it is now (`while c { … }` asks c each time))
  function again(f: number) {
    const rule = w(f + F_RULE), n = rule ? w(rule + R_HOLES) : 0;
    for (let i = 0; i < n; i++) { const tk = f + F_TAKES + TAKE * i; if (aload(tk + T_STATE) === 2) aput(tk + T_STATE, 0); }
  }
  // (a reading by a rule of that node, or a value read by one and the rest on it, `made &+= { … }`)
  function owned(r: number, self: number): number {
    for (let n = 0; n < 64 && w(r) === K_ON; n++) r = w(r + 12);
    return w(r) === K_RULE && w(w(r + 12) + R_OWNER) === self ? 1 : 0;
  }
  // (a label written as a value, or where to go: what the hole took, as a value)
  function of(t: number, r: number, f: number, self: number): number { return w(r) === K_REF || w(r) === K_NAME ? valued(t, take(w(r + 20) || f, w(r + 12), w(r + 16))) : ev(t, r, f, f, self, 1, self, self); }
  // (put off: the rest of a frame's body, from a step; in a test, held until that test is done, so it is run after it)
  function defer(f: number, from: number) {
    // (in a check, read quietly for its answer: nothing is put off, what it would run is not part of the answer)
    if (w(THREAD + T_QUIET)) { set(THREAD + T_RAN, 1); return; }
    if (w(THREAD + T_TESTING)) {
      if (!w(THREAD + T_HELD)) put(THREAD + T_HELD, alloc(8 * HELD));
      const n = w(THREAD + T_HELD_N);
      // (one written where this test or one it holds is, the same again (a body read again in the test, its tests in it): run
      // already)
      const at = w(f + F_START), root = w(THREAD + T_ROOT);
      if (root && w(root + F_START) === at && w(root + F_RULE) === w(f + F_RULE)) return;
      // (a test written in a test: run where it is written, in order with what is around it (what follows does not change what
      // it saw); its own, what it says not the outer one's)
      if (1) {
        if (!w(THREAD + T_HELD)) put(THREAD + T_HELD, alloc(8 * HELD));
        const hn = w(THREAD + T_HELD_N);
        for (let i = 0; i < hn && i < HELD; i++) { const h = w(w(THREAD + T_HELD) + 8 * i), hf = w(w(THREAD + T_HELD) + 8 * i + 4); if (w(h + F_START) === at && w(h + F_RULE) === w(f + F_RULE) && (hf === from || hf === -1 - from)) return; }
        // (kept as run, not to be run again after: one written where it is, the same again, run once)
        if (hn < HELD) { put(w(THREAD + T_HELD) + 8 * hn, f); put(w(THREAD + T_HELD) + 8 * hn + 4, -1 - from); set(THREAD + T_HELD_N, hn + 1); }
        const erred = w(THREAD + T_ERRED), said = w(THREAD + T_SAID), budget = w(THREAD + T_BUDGET), qbudget = w(THREAD + T_QBUDGET), grew = w(THREAD + T_GREW); test(THREAD, f, from); set(THREAD + T_TESTING, 1); put(THREAD + T_ROOT, root); set(THREAD + T_ERRED, erred); set(THREAD + T_SAID, said); set(THREAD + T_BUDGET, budget); set(THREAD + T_QBUDGET, qbudget); set(THREAD + T_GREW, grew); return; }
      for (let i = 0; i < n && i < HELD; i++) { const h = w(w(THREAD + T_HELD) + 8 * i); if (w(h + F_START) === at && w(h + F_RULE) === w(f + F_RULE) && w(w(THREAD + T_HELD) + 8 * i + 4) === from) return; }
      if (n < HELD) { put(w(THREAD + T_HELD) + 8 * n, f); put(w(THREAD + T_HELD) + 8 * n + 4, from); set(THREAD + T_HELD_N, n + 1); }
      // (a test that puts off tests that put off tests, without end: said once, where the first of them is, and no more held)
      else if (n === HELD) { say(THREAD, w(f + F_START), L_HELD, 0, 0); set(THREAD + T_HELD_N, n + 1); }
      return;
    }
    // (put off one after another in one block (not a file's own scope): one after another, by whichever thread runs the first)
    // (with the frame a hole's text is read in, where it was put off (names a class's block sees where it is written))
    const k = xadd(AFTER_TAIL, 1), e = w(AFTER) + AFTER_ENTRY * k, prev = e - AFTER_ENTRY, self = w(f + F_THIS);
    if (k < w(AFTER_CAP)) { put(e, f); put(e + 4, from); put(e + 8, k > 0 && w(prev) && w(w(prev) + F_THIS) === self && !w(self + N_A) ? 1 : 0); put(e + 12, w(THREAD + T_WRITER)); put(e + 16, w(THREAD + T_WRITER_SELF)); put(e + 20, w(THREAD + T_WRITER_S)); put(e + 24, w(THREAD + T_WRITER_E)); }
  }
  // A rule's body, read once: with the rules before it (a rule never reads itself) and its holes' names; what none reads, read
  // when it runs (`dynamically`: with what is there then). (Any thread may read it; the first to finish gives it.)
  function body(t: number, rule: number): number {
    const leveled_ = thread_level();
    let bd = leveled_ ? 0 : w(rule + R_BODY);
    if (bd) return bd;
    // (read in a test, of a rule made before it: kept by this thread alone, until the test is done (the memory it is in is let go
    // of then, and another thread could be reading it); read under a level of this thread's, so too, until the level is done)
    const mine = (w(t + T_REG_AT) && !in_region(rule)) || (leveled_ && w(t + T_BODIES)) ? w(t + T_BODIES) + 8 * ((rule >> 3) & (BODIES - 1)) : 0;
    if (mine) for (let i = 0; i < BODIES; i++) { const q = w(t + T_BODIES) + 8 * (((rule >> 3) + i) & (BODIES - 1)); if (w(q) === rule) return w(q + 4); if (!w(q)) break; }
    const s = w(rule + R_BS), e = w(rule + R_BE), closure = w(rule + R_CLOSURE), vis = w(rule + R_PREV), self = w(GLOBAL);
    // (read for every test alike: none's shadows)
    const shadows = w(THREAD + T_SH_N);
    set(THREAD + T_SH_N, 0);
    let lines = 1; for (let i = s; i < e; i++) if (b(i) === 10) lines++;
    if (DEBUG) debug(D_FAULT, 1090, s, e);
    bd = alloc(4 + STEP * lines);
    let n = 0, given = 0, placing = 0;
    // (the names a line before it begins by giving a value, `made := …`: a line mentioning one is read when it runs (it may be
    // the body's own then, not the one visible where it is written))
    const givens = alloc(8 * 32), cl = w(CLASSES);
    for (let at = skip(s, e); at < e; at = skip(at, e)) {
      const ln = line(at, e), r = reading(t, at, ln, rule, closure, vis, self, 0, 0, 0, 0), st = bd + 4 + STEP * n;
      let mentions = 0;
      for (let p = at; p < ln && given && !mentions;) {
        if (b(cl + b(p)) !== 1) { p++; continue; }
        let q = p; while (q < ln && b(cl + b(q)) === 1) q++;
        if (p === at || b(p - 1) !== 46) for (let i = 0; i < given; i++) if (w(givens + 8 * i + 4) - w(givens + 8 * i) === q - p && same(p, w(givens + 8 * i), q - p)) { mentions = 1; break; }
        p = q;
      }
      {
        let q = at; while (q < ln && b(cl + b(q)) === 1) q++; let o = q; while (o < ln && b(o) === 32) o++;
        if (q > at && o > q && o < ln && b(cl + b(o)) === 2 && b(o) !== 46 && given < 32) { put(givens + 8 * given, at); put(givens + 8 * given + 4, q); given++; } }
      at = ln; n++;
      put(st + 4, w(r + 4)); put(st + 8, w(r + 8));
      if (w(r) === K_RULE && w(w(r + 12) + R_KIND) === EXTERNAL) {
        const caps = w(r + 16), ns = skip(w(caps), w(caps + 4));
        let ts = ns; while (ts < w(caps + 4) && b(ts) > 32) ts++;
        const target = reading(t, ts, w(caps + 4), rule, closure, vis, self, 0, 0, 0, 0), dynamic = w(target) === K_REF;
        if (word(ns, ts, W_LABEL) || word(ns, ts, W_GOTO)) {
          const label = word(ns, ts, W_LABEL);
          if (dynamic) { put(st, label ? S_LABELLED : S_TO); put(st + 12, target); }
          else { put(st, label ? S_LABEL : S_GOTO); put(st + 12, w(target + 4)); put(st + 16, w(target + 8) - w(target + 4)); }
          continue;
        }
      }
      if (w(r) === K_UNREAD) put(r, K_LATER);
      else if (mentions && !(w(FAIL_FAST) & 128) && w(r) !== K_EMPTY) { const later = alloc(READ); put(later, K_LATER); put(later + 4, w(st + 4)); put(later + 8, w(st + 8)); put(st, S_READ); put(st + 12, later); continue; }
      put(st, S_READ); put(st + 12, r);
    }
    put(bd, n);
    // (a body that gives names values of its own: run in a node of its own, each time (what it gives is that run's))
    if ((given || placing) && !(w(FAIL_FAST) & 128) && !(w(rule + R_FLAGS) & OWNS)) put(rule + R_FLAGS, w(rule + R_FLAGS) | OWNS);
    set(THREAD + T_SH_N, shadows);
    if (mine) { if (w(t + T_BODIES_N) < BODIES / 2) { let q = mine; for (let i = 1; w(q) && i < BODIES; i++) q = w(t + T_BODIES) + 8 * (((rule >> 3) + i) & (BODIES - 1)); put(q, rule); put(q + 4, bd); set(t + T_BODIES_N, w(t + T_BODIES_N) + 1); } }
    else { acas(rule + R_BODY, 0, bd); bd = w(rule + R_BODY); }
    return bd;
  }

  // ---- defining

  // The primitive: `rules[lhs] := rhs`, in what it is read in; the head read with the rules there, the body what the right hole
  // took (code, with the names of where it was written). A head defined again there is that rule, given this body.
  function define(t: number, f: number): number {
    let self = w(f + F_THIS);
    const hd = follow(f + F_TAKES, 0), bd = follow(f + F_TAKES + TAKE, 0);
    // (a head that is neither a pattern (holes of its own) nor a name: an expression, read as a left side, as it is written (what
    // it has of the holes of where it was written read there, `({lhs} => {rhs}).style`): the name it declares, where it declares
    // it (`x.m`: m, in x); one that declares nothing (`[]`, `.`) is the text it is. A pattern: what those holes took in it.)
    // (whether it is one, by what its holes took in it: `{operator} {rest}` taking `==` and `{other}` is a pattern, `({lhs} =>
    // {rhs}).style` is not)
    const o = w(hd + T_ORIGIN);
    put(THREAD + T_PLACE_IN, 0);
    // (a head of holes only: read as the text they took)
    const raw = raw_head(hd), rs = raw ? w(THREAD + T_A) : w(hd), re = raw ? w(THREAD + T_B) : w(hd + 4);
    if (!raw) spliced(hd);
    // (a head that declared a name somewhere, `x.m`: defined there)
    if (w(THREAD + T_PLACE_IN)) self = w(THREAD + T_PLACE_IN);
    let hs = w(THREAD + T_A), he = w(THREAD + T_B);
    // (a word and `=>` written as an argument, after `(` or `,`, `xs.map(x => x * 2)`: a closure of that one parameter, as
    // `(x) => x * 2` (§9 `[1, 2, 3] for x => …`); not a rule defined in the scope the call is in) (the word written there, not
    // one a hole took: `{name} => value` naming `in` of `(in?: Linked)`; nor in `x.( … )`, code read in x: a definition there)
    if (!raw && parameter_led(skip(hs, he), trim_end(hs, he)) && hops(f + F_TAKES) <= 1) { let q = skip(hs, he) - 1; while (q > 0 && b(q) <= 32 && b(q) !== 10) q--; if ((b(q) === 40 && !(q > 0 && b(q - 1) === 46)) || b(q) === 44) return lambda(t, skip(hs, he), trim_end(hs, he), bd, o, self); }
    // (--debug: a head that is a hole of the rule it was written in, read where it can not see that rule's holes: `(name)` of
    // `(name) := value` in `=`'s body, defined as the text `(name)`)
    // (a head that is a hole of the rule it is written in, `(place)` of `(place) := value`, read where that rule's holes are not
    // seen: never defined as the text it is (every later `(place)` would read it), said instead)
    if (raw && o && w(o + F_RULE) && b(hs) === 40 && b(he - 1) === 41 && named(w(o + F_RULE), hs + 1, he - 1) >= 0) { if (DEBUG) debug(D_FAULT, 77, hs, he); say(t, hs, L_VALUED, hs, he); return 0; }
    // (a head that is a list written, `[x: Symbolic]`, `[at: Integer]`, no hole of its own: the text it is, declaring nothing
    // (open: `[x]` an operator hole, §A))
    const listed_head = b(hs) === 91 && past(hs, he) >= he;
    // (one of words only, `as Decimal` (`as (=== Decimal)`'s), `static Inner`: read quietly, what it names may not be yet
    // (`Decimal`, read in the map before Number.ray made it))
    let words = 0; { const a = skip(hs, he), z = trim_end(hs, he); words = a < z && b(w(CLASSES) + b(a)) === 1 ? 1 : 0; for (let i = a; i < z && words; i++) if (b(w(CLASSES) + b(i)) !== 1 && !(b(i) === 32 && i > a && b(i - 1) !== 32)) words = 0; if (words && worded(a, z)) words = 0; }
    // (one whose first word is no definition of that word alone (`as` of `as static => …`, Signed's: read, it declared
    // `static` the class itself; `static` of `static Signed := …` is one, what declares in the class): those words, as written)
    if (words) { const a = skip(hs, he); let m = a; while (m < he && b(w(CLASSES) + b(m)) === 1) m++; const sc = w(t + T_SCRATCH); put(t + T_SCRATCH, sc + SCRATCH); const end = read(a, m, latest(self), 0, 0, 0, sc), found = w(sc + 512); put(t + T_SCRATCH, sc); if (!(end === m && found && w(found + R_PARTS) === 1 && (w(found + R_PART) & 15) === LITERAL && !(w(found + R_FLAGS) & CALLS))) words = 2; }
    // (a member written with what it answers, a word, `: `, then a type led by a word, `paths: Path{.bounded: bounded} =>
    // [this]`: that word (the type's braces no hole of the head, the type not read where the member is defined); led by a
    // hole, `class: {parent} …`, a pattern)
    if (!raw && words !== 2) { const a = skip(hs, he); let m = a; while (m < he && b(w(CLASSES) + b(m)) === 1) m++; if (m > a && m + 2 < he && b(m) === 58 && b(m + 1) === 32 && b(w(CLASSES) + b(skip(m + 1, he))) === 1) { hs = a; he = m; words = 2; } }
    const expression = !pattern(hs, he, 0) && !worded(hs, he) && !listed_head && words !== 2;
    if (DEBUG && words === 1 && expression) debug(D_FAULT, 1112, hs, he);
    let typed_type = 0;
    if (expression) {
      // (read as written; what declares nothing defined as what its holes took in it, `== (other)`)
      const declaring = w(t + T_DECL), named = w(t + T_NAMED), pushed = push_left(rs, re), defin = w(t + T_DEFIN);
      put(t + T_DECL, 1); put(t + T_DEFIN, self);
      const quiet = w(THREAD + T_QUIET), said = w(t + T_SAID); if (words) set(THREAD + T_QUIET, quiet + 1);
      const v = ev(t, reading(t, rs, re, raw ? 0 : o ? w(o + F_RULE) : 0, raw ? 0 : o ? w(o + F_CLOSURE) : 0, latest(self), self, LEFT, 0, 0, 0), raw ? frame(0, 0, self, rs, re, 0, 0, self, self) : o || frame(0, 0, self, w(hd), w(hd + 4), 0, 0, self, self), f, self, 1, self, self);
      put(t + T_DECL, declaring); put(t + T_LE, pushed); put(t + T_DEFIN, defin);
      if (words) { set(THREAD + T_QUIET, quiet); set(t + T_SAID, said); }
      // (a place, or the head of what was just declared (`b = 0`, a default): its name, where it is named)
      // (a place declared with a type (`rhs: Statements(node) = rule.RHS`): what it is given read by that type when it is read)
      if (v && w(v + N_IS) === IS_PLACE && w(v + N_A) && w(v + N_B) > w(v + N_A)) typed_type = 1;
      if (v && w(v + N_IS) === IS_PLACE && w(v + N_A) && w(v + N_B) > w(v + N_A)) { hs = w(v + N_A); he = w(v + N_B); if (place_in(v)) self = place_in(v); }
      else if (v && w(v + N_IS) === IS_HEAD && place_in(v) && worded(w(v + N_A), w(v + N_B))) { hs = w(v + N_A); he = w(v + N_B); self = place_in(v); }
      // (a left side made of names (`a, b = 0`, the places and heads it made reading it), not one name: it, for what each takes)
      else if (v && w(t + T_NAMED) - named > 0 && w(v + N_IS) === IS_NODE) { put(t + T_FAULT, 0); put(t + T_JUMP_N, 0); return v; }
      // (a left side in brackets that answered a value, not a place (`(name)` naming a hole that is a value there): reported, it
      // declares nothing)
      else if (v && w(v + N_IS) === IS_NODE && b(skip(rs, re)) === 40 && bracket(skip(rs, re), re) & 1) { const at = o && w(o + N_IS) === IS_FRAME ? o : 0; say(t, at ? w(at + F_START) : rs, L_VALUED, at ? w(at + F_START) : rs, at ? w(at + F_END) : re); if (DEBUG) debug(D_FAULT, 82, v, (in_region(v) ? 1 : 0) + (older(v) ? 2 : 0)); }
      // (a name in brackets, `(place)`, that read as nothing (a hole whose text is no left side, `initial | (internal …) : T`):
      // never defined as the text it is, which every later `(place)` would read; said instead)
      else if (!v && b(skip(rs, re)) === 40 && bracket(skip(rs, re), re) & 1 && worded(skip(rs, re) + 1, trim_end(rs, re) - 1)) { if (DEBUG) debug(D_FAULT, 77, hs, he); say(t, rs, L_VALUED, rs, re); put(t + T_FAULT, 0); put(t + T_JUMP_N, 0); return 0; }
      put(t + T_FAULT, 0); put(t + T_JUMP_N, 0);
      // (a place and its head, `f (x)`: the place given what `(x) => body` is, a closure)
      if (v && w(v + N_IS) === IS_CALLED) return called(t, v, bd, w(hd + T_ORIGIN), self);
      if (v && w(v + N_IS) === IS_APPLIED) return applied(t, v, bd, w(hd + T_ORIGIN), self);
    }
    inlined(bd);
    if (DEBUG) debug(D_DEFINE, hs, he, self);
    const inl_s = w(THREAD + T_INL_S), inl_e = w(THREAD + T_INL_E), inl_f = w(THREAD + T_INL_F), in2_s = w(THREAD + T_IN2_S), in2_e = w(THREAD + T_IN2_E), in2_f = w(THREAD + T_IN2_F), all_s = w(THREAD + T_ALL_S), all_e = w(THREAD + T_ALL_E);
    const r = rule_(t, self, hs, he, w(THREAD + T_A), w(THREAD + T_B), w(bd + T_ORIGIN), w(hd + T_ORIGIN));
    // (defined in code a body inlined, a header's block (`GRAMMAR_RULE_DEF := …` read in an instance): read bare there, as `x: T`)
    { const ho = w(hd + T_ORIGIN), hr = ho && w(ho + N_IS) === IS_FRAME ? w(ho + F_RULE) : 0; if (hr && ((w(hr + R_INL_F) && w(hd) >= w(hr + R_INL_S) && w(hd + 4) <= w(hr + R_INL_E)) || (w(hr + R_IN2_F) && w(hd) >= w(hr + R_IN2_S) && w(hd + 4) <= w(hr + R_IN2_E)))) put(r + R_FLAGS, w(r + R_FLAGS) | STATIC); }
    put(r + R_INL_S, inl_s); put(r + R_INL_E, inl_e); put(r + R_INL_F, inl_f); put(r + R_IN2_S, in2_s); put(r + R_IN2_E, in2_e); put(r + R_IN2_F, in2_f); put(r + R_ALL_S, all_s); put(r + R_ALL_E, all_e);
    if (w(FAIL_FAST) & 2) log(w(hd), L_DEFINED, w(hd), w(hd + 4));
    put(t + T_NAMED, w(t + T_NAMED) + 1);
    if (typed_type) put(r + R_FLAGS, w(r + R_FLAGS) | TYPED_READ);
    return w(r + R_HEAD);
  }
  // (the type a place was declared with, when it destructures: its own `destructures`, or what a type it is one of says, `T[]`'s
  // (a repeat, what the value of an unset `x: T[]` is made in); else 0)
  // (a text a name declared with a type answers, `x: T = text`: read by T as a field's is when T destructures, `(T) lone_read
  // (text)` (T its own `destructures`, or what a type it is one of says, `T[]`'s), read in a node of its own holding both, and
  // given to the name instead; the type the declaration gave it (the rule named so before this one), read now, not before)
  function typed_read(t: number, rule: number, val: number): number {
    const hd = w(rule + R_HEAD), own = w(rule + R_OWNER); if (!hd || !own) return val;
    let pr = 0; for (let o = w(rule), k = 0; o && k < 4096; o = w(o), k++) { const oh = w(o + R_HEAD); if (w(o + R_KIND) === VALUE && !w(o + R_HOLES) && oh && trimmed(w(oh + N_A), w(oh + N_B) - w(oh + N_A), w(hd + N_A), w(hd + N_B))) { pr = o; break; } }
    const ty = pr ? lazy_read(t, pr) : 0; if (!ty || stopped(t) || w(ty + N_IS) !== IS_NODE) return val;
    const dw = w(w(WORDS) + 8 * W_DESTRUCTURES), dn = w(w(WORDS) + 8 * W_DESTRUCTURES + 4), made_in = w(ty + N_PARENT);
    if (member(t, ty, dw, dn) !== w(TRUE_) && !(made_in && held(t, made_in, W_REPEATS, 0) === w(TRUE_) && held(t, made_in, W_DESTRUCTURES, 0) === w(TRUE_))) return val;
    // (one it already is, a text given `Char[]` (its characters): kept as it is)
    if (admits(t, val, ty, 0) === 1) return val;
    const lw = w(w(WORDS) + 8 * W_LONE_READ), ln = w(w(WORDS) + 8 * W_LONE_READ + 4);
    const text = allocb(ln + 16); let at = text;
    setb(at++, 40); const as_ = at; setb(at++, 113); setb(at++, 116); const ae = at; setb(at++, 41); setb(at++, 32);
    for (let i = 0; i < ln; i++) setb(at++, b(lw + i));
    setb(at++, 32); setb(at++, 40); const vs = at; setb(at++, 113); setb(at++, 118); const ve = at; setb(at++, 41);
    const hold = node(IS_NODE, 0, 0, w(GLOBAL), 0); bound(as_, ae, hold, ty); bound(vs, ve, hold, val);
    const fr = frame(0, 0, hold, text, at, 0, 0, hold, hold);
    const r = reading(t, text, at, 0, 0, latest(hold), hold, 0, 0, 0, 0);
    if (w(r) === K_UNREAD || w(r) === K_EMPTY) return val;
    const decl_was = w(t + T_DECL); put(t + T_DECL, 0);
    const read_ = ev(t, r, fr, fr, hold, 1, hold, hold);
    put(t + T_DECL, decl_was);
    if (!read_ || read_ === w(NOTHING) || read_ === val || stopped(t)) return val;
    // (kept: read again, the name answers it)
    bound(w(hd + N_A), w(hd + N_B), own, read_);
    return read_;
  }
  // (a place called with its head, `f (x) => body`: `(x) => body` read where it was written, its body with the names of where
  // that was (the text made of both: the head's part read with the head's names, the body's with the body's), and the place
  // given what it answers)
  // (a closure and a name, `xs.for x => body`: what the head read up to the name, called with `x => body`, a closure, the text
  // made of both as `called` makes it)
  function applied(t: number, v: number, bd: number, names: number, self: number): number {
    const hs = w(v + N_A), ps = w(v + N_B), pe = w(v + N_PARENT), sep = w(SEPARATOR), sn = w(SEPARATOR_LENGTH);
    code(t, w(bd), w(bd + 4)); const bs = w(t + T_A), be = w(t + T_B);
    const open = w(OPEN), ol = w(OPEN_LENGTH), close = w(CLOSE), cl = w(CLOSE_LENGTH);
    const text = allocb((pe - hs) + 2 + sn + 3 + ol + (be - bs) + cl + 1);
    let at = text;
    for (let i = hs; i < ps; i++) setb(at++, b(i));
    setb(at++, 40); for (let i = ps; i < pe; i++) setb(at++, b(i));
    setb(at++, 32); for (let i = 0; i < sn; i++) setb(at++, b(sep + i)); setb(at++, 32);
    for (let i = 0; i < ol; i++) setb(at++, b(open + i));
    const body = at; for (let i = bs; i < be; i++) setb(at++, b(i)); const body_end = at;
    for (let i = 0; i < cl; i++) setb(at++, b(close + i));
    setb(at++, 41);
    const rule = alloc(R_PART); put(rule + R_CLOSURE, names); put(rule + R_INL_S, body); put(rule + R_INL_E, body_end); put(rule + R_INL_F, w(bd + T_ORIGIN));
    const fr = frame(rule, 0, self, text, at, 0, 0, self, self);
    const r = reading(t, text, at, rule, names, latest(self), self, 0, 0, 0, 0);
    if (w(r) === K_UNREAD) { say(t, hs, L_NOT_ON, hs, pe); return 0; }
    return ev(t, r, fr, fr, self, 1, self, self);
  }
  // (an operator missing a side, from s to e, read as the closure of what it misses: none when it is not one)
  // (its sides named `section_left`, `section_right`)
  function section_side(at: number, right: number): number { setb(at++, 115); setb(at++, 101); setb(at++, 99); setb(at++, 116); setb(at++, 105); setb(at++, 111); setb(at++, 110); setb(at++, 95); if (right) { setb(at++, 114); setb(at++, 105); setb(at++, 103); setb(at++, 104); setb(at++, 116); } else { setb(at++, 108); setb(at++, 101); setb(at++, 102); setb(at++, 116); } return at; }
  function sectioned(t: number, s: number, e: number, names: number, self: number): number {
    const a = skip(s, e), z = trim_end(s, e), cl = w(CLASSES);
    if (a >= z || b(cl + b(a)) !== 2 || b(a) === 46) return 0;
    let o = a; while (o < z && b(cl + b(o)) === 2) o++;
    if (o < z && b(a) === 45 && o === a + 1 && b(o) >= 48 && b(o) <= 57) return 0;
    // (nor an operator written against a name, `-other`, `!done`: that operator on it)
    if (o < z && b(o) > 32 && b(cl + b(o)) === 1 && !(b(o) >= 48 && b(o) <= 57)) return prefixed(t, a, o, z, names, self);
    const alone = o >= z ? 1 : 0, unary = alone && o === a + 1 && b(a) === 33 ? 1 : 0;
    const sep = w(SEPARATOR), sn = w(SEPARATOR_LENGTH);
    const text = allocb(64 + 2 * (z - a) + sn);
    let at = text;
    // (an operator alone, `|`: `.|`, the operator of what it is given, on `.` (`reduce(|)`, `(left) => left | .`))
    setb(at++, 40); at = section_side(at, 0);
    setb(at++, 41); setb(at++, 32); for (let i = 0; i < sn; i++) setb(at++, b(sep + i)); setb(at++, 32);
    if (unary) { setb(at++, 33); at = section_side(at, 0); }
    else {
      at = section_side(at, 0); setb(at++, 32);
      for (let i = a; i < z; i++) setb(at++, b(i));
      if (alone) { setb(at++, 32); setb(at++, 46); }
    }
    const r = reading(t, text, at, w(names + F_RULE), w(names + F_CLOSURE), latest(self), self, 0, 0, 0, 0);
    if (w(r) === K_UNREAD || w(r) === K_EMPTY) return 0;
    return ev(t, r, names, names, self, 1, self, self);
  }
  // (an operator written against what follows it, nothing reading it, `-other`: read right-to-left, that operator, a member
  // of what follows (`right-to-left - => …`), `(other).-`)
  function prefixed(t: number, a: number, o: number, z: number, names: number, self: number): number {
    const text = allocb(8 + (z - a)); let at = text;
    setb(at++, 40); for (let i = o; i < z; i++) setb(at++, b(i)); setb(at++, 41); setb(at++, 46); for (let i = a; i < o; i++) setb(at++, b(i));
    const r = reading(t, text, at, w(names + F_RULE), w(names + F_CLOSURE), latest(self), self, 0, 0, 0, 0);
    if (w(r) === K_UNREAD || w(r) === K_EMPTY) return 0;
    return ev(t, r, names, names, self, 1, self, self);
  }
  // (`x => body` as a value: read as `(x) => {body}`)
  function lambda(t: number, ps: number, pe: number, bd: number, names: number, self: number): number {
    if (DEBUG) debug(D_FAULT, 1109, ps, pe);
    const sep = w(SEPARATOR), sn = w(SEPARATOR_LENGTH);
    code(t, w(bd), w(bd + 4)); const bs = w(t + T_A), be = w(t + T_B);
    const open = w(OPEN), ol = w(OPEN_LENGTH), close = w(CLOSE), cl = w(CLOSE_LENGTH);
    const text = allocb((pe - ps) + 4 + sn + ol + (be - bs) + cl + 1);
    let at = text;
    setb(at++, 40); for (let i = ps; i < pe; i++) setb(at++, b(i)); setb(at++, 41);
    setb(at++, 32); for (let i = 0; i < sn; i++) setb(at++, b(sep + i)); setb(at++, 32);
    for (let i = 0; i < ol; i++) setb(at++, b(open + i));
    const body = at; for (let i = bs; i < be; i++) setb(at++, b(i)); const body_end = at;
    for (let i = 0; i < cl; i++) setb(at++, b(close + i));
    const rule = alloc(R_PART); put(rule + R_CLOSURE, names); put(rule + R_INL_S, body); put(rule + R_INL_E, body_end); put(rule + R_INL_F, w(bd + T_ORIGIN));
    const fr = frame(rule, 0, self, text, at, 0, 0, self, self);
    const r = reading(t, text, at, rule, names, latest(self), self, 0, 0, 0, 0);
    if (w(r) === K_UNREAD) { say(t, ps, L_NOT_ON, ps, pe); return 0; }
    return ev(t, r, fr, fr, self, 1, self, self);
  }
  function called(t: number, v: number, bd: number, names: number, self: number): number {
    const hs = w(v + N_A), he = w(v + N_B), place = w(v + N_PARENT), sep = w(SEPARATOR), sn = w(SEPARATOR_LENGTH);
    code(t, w(bd), w(bd + 4)); const bs = w(t + T_A), be = w(t + T_B);
    // (after a 0: a beginning of its own, how deep its lines are its own)
    // (the body on a line of its own, as deep as the line it began on: lines below it deeper still continue it, `=> true` with
    // `? …` below)
    let deep = 0; { let p = bs; while (p > 0 && b(p - 1) !== 10 && b(p - 1) !== 0) p--; while (b(p + deep) === 32 && p + deep < bs) deep++; }
    const n = (he - hs) + 1 + sn + 3 + (be - bs) + 1 + 1 + deep, text = allocb(n + 4) + 4; put(text - 4, 0);
    let at = text;
    for (let i = hs; i < he; i++) setb(at++, b(i));
    setb(at++, 32); for (let i = 0; i < sn; i++) setb(at++, b(sep + i)); setb(at++, 32);
    // (the body, in brackets: one block, its value its last statement's)
    const open = w(OPEN), ol = w(OPEN_LENGTH), close = w(CLOSE), cl = w(CLOSE_LENGTH);
    for (let i = 0; i < ol; i++) setb(at++, b(open + i));
    setb(at++, 10); for (let i = 0; i < deep; i++) setb(at++, 32);
    const body = at; for (let i = bs; i < be; i++) setb(at++, b(i)); const body_end = at;
    for (let i = 0; i < cl; i++) setb(at++, b(close + i));
    // (what it is read with: a rule of no holes whose names are the head's, the body's span the body's)
    const rule = alloc(R_PART); put(rule + R_CLOSURE, names); put(rule + R_INL_S, body); put(rule + R_INL_E, body_end); put(rule + R_INL_F, w(bd + T_ORIGIN));
    const fr = frame(rule, 0, self, text, at, 0, 0, self, self);
    const value = ev(t, reading(t, text, at, rule, names, latest(self), self, 0, 0, 0, 0), fr, fr, self, 1, self, self);
    if (!value || stopped(t)) return 0;
    // (written bare, `f (x) =>`: the name this node's own, not one visible where it is (a class's `from (x)`, the language's
    // `from` untouched); written on a value, `x.f (y) =>`, that value's)
    const bare = skip(hs, he) === skip(w(place + N_A), w(place + N_B));
    const named = bound(w(place + N_A), w(place + N_B), bare ? self : (place_in(place) || self), value);
    // (the rule naming it is a method's, called with what follows it: `f (x) =>` beside `f =>`, each by what is given)
    const nr = latest(bare ? self : (place_in(place) || self)); if (nr && w(nr + R_HEAD) === named) put(nr + R_FLAGS, w(nr + R_FLAGS) | CALLS);
    return named;
  }
  // (a name, from s to e, given a value in a node: a rule there answering it)
  function bound(s: number, e: number, self: number, value: number): number {
    s = skip(s, e); while (e > s && b(e - 1) <= 32) e--;
    const named_ = alloc(R_PART + PART), hd = node(IS_HEAD, s, e, self, 0);
    put(named_ + R_KIND, VALUE); put(named_ + R_MASK, bytes(s, e)); put(named_ + R_BS, value); put(named_ + R_PARTS, 1); put(named_ + R_FLAGS, LED);
    put(named_ + R_HEAD, hd); put(named_ + R_OWNER, self); put(named_ + R_PART + 4, s); put(named_ + R_PART + 8, e - s);
    link(self, named_);
    return hd;
  }
  // (a body written in a body, `{{x}}` in it one of that body's holes: the code it took, written there, unread; at T_A, T_B)
  // (where the text a take took was written: its origin; a copy that origin read (a closure literal made of a body), on to
  // where that text was)
  function written_from(tk: number, a: number, z: number): number {
    let fo = w(tk + T_ORIGIN);
    for (let n = 0; fo && n < 16; n++) {
      const r = w(fo + F_RULE);
      if (r && w(r + R_INL_F) && a >= w(r + R_INL_S) && z <= w(r + R_INL_E)) fo = w(r + R_INL_F);
      else if (r && w(r + R_IN2_F) && a >= w(r + R_IN2_S) && z <= w(r + R_IN2_E)) fo = w(r + R_IN2_F);
      else break;
    }
    return fo;
  }
  function inlined(bd: number) {
    const s = w(bd), e = w(bd + 4), o = w(bd + T_ORIGIN), open = w(OPEN_LENGTH), close = w(CLOSE_LENGTH), hole = 5 + 8 * open;
    put(THREAD + T_A, s); put(THREAD + T_B, e); put(THREAD + T_INL_S, 0); put(THREAD + T_INL_E, 0); put(THREAD + T_INL_F, 0); put(THREAD + T_IN2_S, 0); put(THREAD + T_IN2_E, 0); put(THREAD + T_IN2_F, 0); put(THREAD + T_ALL_S, 0); put(THREAD + T_ALL_E, 0);
    if (!o || !w(o + F_RULE)) return;
    let n = 0, any = 0, inl_read = 0;
    for (let pass = 0, out = 0; pass < 2; pass++) {
      for (let at = s; at < e;) {
        // (`{{x}}`: a hole's brackets around `{x}`, a hole of it)
        let x = 0;
        if (bracket(at, e) === hole && bracket(at + open, e) === hole) {
          const inner = past(at + open, e);
          if (past(at, e) === inner + close) x = refer(o, w(o + F_RULE), w(o + F_CLOSURE), at + 2 * open, inner - close, 0);
        }
        if (x) {
          const tk = follow(take(w(THREAD + T_REFF), (x - 1) >> 16, (x - 1) & 0xFFFF), 0);
          // (code written in brackets, `{ … }`: what is inside them, as a rule's body is)
          code(THREAD, w(tk), w(tk + 4)); const ca = w(THREAD + T_A), cz = w(THREAD + T_B);
          // (its lines indented as where it is inlined: each as far in past that as it was past the least of them)
          let ind = 0; for (let i = at; i > s && b(i - 1) === 32; i--) ind++;
          let least = 1 << 30;
          for (let i = ca; i < cz; i++) if (b(i) === 10) { let k = 0; while (i + 1 + k < cz && b(i + 1 + k) === 32) k++; if (i + 1 + k < cz && b(i + 1 + k) !== 10 && k < least) least = k; }
          if (least === 1 << 30) least = 0;
          // (and its first line's, when it begins a line of its own: lines below it deeper than that continue it)
          { let p = ca, k = 0; while (p > 0 && b(p - 1) === 32) { p--; k++; } if ((b(p - 1) === 10 || b(p - 1) === 0) && k < least) least = k; }
          // (and, not written in brackets, beginning after other text, `=> true` of `f (x) => true`: the line it begins on's)
          if (b(skip(w(tk), w(tk + 4))) !== 123) { let p = ca; while (p > 0 && b(p - 1) !== 10 && b(p - 1) !== 0) p--; let k = 0; while (p + k < ca && b(p + k) === 32) k++; if (p + k < ca && k < least) least = k; }
          // (what it took keeps the names of where it was written: what is read in it is read with them)
          const from = out + n;
          for (let i = ca; i < cz; i++) {
            if (pass) setb(out + n, b(i)); n++;
            if (b(i) === 10) { for (let k = 0; k < least && i + 1 < cz && b(i + 1) === 32; k++) i++; for (let k = 0; k < ind; k++) { if (pass) setb(out + n, 32); n++; } }
          }
          // (with the names of where it was written: a copy read already, where that was; the first, and the one after it, each
          // its own (`({{parameters}}) …{{body}}`, a closure's parameters and its body))
          if (pass) {
            const fo = written_from(tk, ca, cz);
            if (!w(THREAD + T_INL_F)) { put(THREAD + T_INL_S, from); put(THREAD + T_INL_E, out + n); put(THREAD + T_INL_F, fo); inl_read = w(tk + T_ORIGIN); }
            else if (!w(THREAD + T_IN2_F)) { put(THREAD + T_IN2_S, from); put(THREAD + T_IN2_E, out + n); put(THREAD + T_IN2_F, fo); }
          }
          if (pass) { if (!w(THREAD + T_ALL_S)) put(THREAD + T_ALL_S, from); put(THREAD + T_ALL_E, out + n); }
          at = past(at, e); any = 1;
          continue;
        }
        if (pass) setb(out + n, b(at));
        n++; at++;
      }
      if (!any) return;
      if (!pass) { out = allocb(n); n = 0; }
      else { put(THREAD + T_A, out); put(THREAD + T_B, out + n); }
    }
    // (one inlined, a second not: the same, as read where it was taken (a closure's call, its parameters and locals), for what
    // nothing reads in it where it was written)
    if (inl_read && inl_read !== w(THREAD + T_INL_F) && !w(THREAD + T_IN2_F)) { put(THREAD + T_IN2_S, w(THREAD + T_INL_S)); put(THREAD + T_IN2_E, w(THREAD + T_INL_E)); put(THREAD + T_IN2_F, inl_read); }
  }
  // (a head written in a body, its holes named as that body's: what they took in their place, `{operator} {rest}` the text
  // they took; at T_A, T_B)
  // (a head made only of holes of where it was written, `{operator} {rest}`: what they took, as written, one text; else 0)
  function raw_head(hd: number): number {
    const s = w(hd), e = w(hd + 4), o = w(hd + T_ORIGIN), open = w(OPEN_LENGTH), close = w(CLOSE_LENGTH), hole = 5 + 8 * open;
    if (!o || !w(o + F_RULE)) return 0;
    let refs = 0, n = 0;
    for (let at = skip(s, e); at < e; at = skip(at, e)) {
      if (bracket(at, e) !== hole) return 0;
      const x = refer(o, w(o + F_RULE), w(o + F_CLOSURE), at + open, past(at, e) - close, 0);
      if (!x) return 0;
      const tk = follow(take(w(THREAD + T_REFF), (x - 1) >> 16, (x - 1) & 0xFFFF), 0);
      n += w(tk + 4) - w(tk) + 1; refs++; at = past(at, e);
    }
    if (refs < 2) return 0;
    const text = allocb(n + 1); let out = text;
    for (let at = skip(s, e); at < e; at = skip(at, e)) {
      const x = refer(o, w(o + F_RULE), w(o + F_CLOSURE), at + open, past(at, e) - close, 0);
      const tk = follow(take(w(THREAD + T_REFF), (x - 1) >> 16, (x - 1) & 0xFFFF), 0);
      if (out > text) setb(out++, 32);
      for (let i = w(tk); i < w(tk + 4); i++) setb(out++, b(i));
      at = past(at, e);
    }
    put(THREAD + T_A, text); put(THREAD + T_B, out);
    return 1;
  }
  function spliced(hd: number) {
    const s = w(hd), e = w(hd + 4), o = w(hd + T_ORIGIN), open = w(OPEN_LENGTH), close = w(CLOSE_LENGTH), hole = 5 + 8 * open;
    put(THREAD + T_A, s); put(THREAD + T_B, e);
    if (!o || !w(o + F_RULE)) return;
    // (what each took, found once (pass 0), then written (pass 1))
    const SUBS = 32, subs = alloc(8 * SUBS);
    let n = 0, any = 0;
    for (let pass = 0, out = 0; pass < 2; pass++) {
      for (let at = s, depth = 0, k = 0; at < e;) {
        const x = bracket(at, e) === hole ? refer(o, w(o + F_RULE), w(o + F_CLOSURE), at + open, past(at, e) - close, 0) : 0, from = w(THREAD + T_REFF);
        if (x) {
          let a = 0, z = 0;
          if (pass) { a = w(subs + 8 * k); z = w(subs + 8 * k + 4); }
          else {
            const tk = follow(take(from, (x - 1) >> 16, (x - 1) & 0xFFFF), 0);
            a = skip(w(tk), w(tk + 4)); z = w(tk + 4); while (z > a && b(z - 1) <= 32) z--;
            // (one that took code, not a name: what it answers, when that is a name (a place, what a rule was named, a text));
            // but in brackets, part of what is read as a whole (`({lhs} => {rhs}).style`): as written
            // (an operator, `+` of `compounds +`, the same: as written, no left side (read as one, it declared itself a place in
            // what the rule ran on, and `global.({name} += …)` was defined there))
            let name = 1, op = a < z ? 1 : 0; for (let i = a; i < z; i++) { if (b(w(CLASSES) + b(i)) !== 1) name = 0; if (b(w(CLASSES) + b(i)) !== 2) op = 0; }
            if (op) name = 1;
            // (one that took a pattern, `{x} + {y}` (holes of none of where it was written): a head, as written)
            if (!name && !depth && !pattern(a, z, w(tk + T_ORIGIN))) {
              // (read as a left side: what it declares; what it runs defines with places of its own, not this one's)
              const declaring = w(THREAD + T_DECL), into = w(THREAD + T_PLACE_IN), pushed = push_left(w(tk), w(tk + 4)); put(THREAD + T_DECL, 1);
              const v = valued(THREAD, take(from, (x - 1) >> 16, (x - 1) & 0xFFFF)), is = v ? w(v + N_IS) : -1;
              put(THREAD + T_DECL, declaring); put(THREAD + T_PLACE_IN, into); put(THREAD + T_LE, pushed);
              if (is === IS_PLACE || is === IS_HEAD || is === IS_TEXT) { a = w(v + N_A); z = w(v + N_B); }
              // (else, a name in a group, `(name)`, that names a hole: that hole's code, as written (`=`'s `(name) :=` of
              // `x.type`))
              else if ((bracket(a, z) & 3) === 1 && past(a, z) === z) {
                const og = w(tk + T_ORIGIN), i = skip(a + 1, z - 1); let j = z - 1; while (j > i && b(j - 1) <= 32) j--;
                const y = og && worded(i, j) ? refer(og, w(og + F_RULE), w(og + F_CLOSURE), i, j, 0) : 0;
                if (y) { const t2 = follow(take(w(THREAD + T_REFF), (y - 1) >> 16, (y - 1) & 0xFFFF), 0); a = skip(w(t2), w(t2 + 4)); z = w(t2 + 4); while (z > a && b(z - 1) <= 32) z--; }
              }
              if (is === IS_PLACE && place_in(v)) put(THREAD + T_PLACE_IN, place_in(v));
            }
            if (k < SUBS) { put(subs + 8 * k, a); put(subs + 8 * k + 4, z); }
          }
          for (let i = a; i < z; i++) { if (pass) setb(out + n, b(i)); n++; }
          at = past(at, e); any = 1; k++;
          continue;
        }
        const c = bracket(at, e) & 3;
        if (c === 1) depth++; else if (c === 2 && depth > 0) depth--;
        if (pass) setb(out + n, b(at));
        n++; at++;
      }
      if (!any) return;
      // (made after a 0, a beginning of its own: how deep its first line is, its own, not what was made before it)
      if (!pass) { out = allocb(n + 4) + 4; put(out - 4, 0); n = 0; }
      else { put(THREAD + T_A, out); put(THREAD + T_B, out + n); }
    }
  }
  // (an operator hole, `[x]` alone between a head's spaces (`{a} [x] {b}`): a hole an operator alone fills (`{x: Operator}`),
  // and `[x]` in the body that operator, spliced (`a [x] b`))
  function operator_holes(hs: number, he: number, bs: number, be: number): number {
    let found = 0;
    for (let p = hs; p < he; p++) {
      if (b(p) !== 91 || !(p === hs || b(p - 1) <= 32)) continue;
      let q = p + 1; while (q < he && b(w(CLASSES) + b(q)) === 1) q++;
      if (q === p + 1 || q >= he || b(q) !== 93 || !(q + 1 >= he || b(q + 1) <= 32)) continue;
      found = 1; break;
    }
    if (!found) return 0;
    const out = allocb(4 * (he - hs) + 64 + 4 * (be - bs) + 64 + 8) + 4; put(out - 4, 0);
    let at = out;
    const names = alloc(72), lens = alloc(64); let nn = 0;
    for (let p = hs; p < he;) {
      if (b(p) === 91 && (p === hs || b(p - 1) <= 32)) {
        let q = p + 1; while (q < he && b(w(CLASSES) + b(q)) === 1) q++;
        if (q > p + 1 && q < he && b(q) === 93 && (q + 1 >= he || b(q + 1) <= 32)) {
          if (nn < 16) { put(names + 4 * nn, p + 1); put(lens + 4 * nn, q - p - 1); nn++; }
          setb(at++, 123); for (let i = p + 1; i < q; i++) setb(at++, b(i));
          setb(at++, 125); p = q + 1; continue;
        }
      }
      setb(at++, b(p)); p++;
    }
    const he2 = at; setb(at++, 0); const bs2 = at;
    for (let p = bs; p < be;) {
      let hit = 0;
      if (b(p) === 91) for (let k = 0; k < nn; k++) { const s0 = w(names + 4 * k), n0 = w(lens + 4 * k); if (p + n0 + 1 < be && b(p + n0 + 1) === 93 && same(p + 1, s0, n0)) { setb(at++, 32); setb(at++, 123); for (let i = 0; i < n0; i++) setb(at++, b(s0 + i)); setb(at++, 125); setb(at++, 32); p += n0 + 2; hit = 1; break; } }
      if (!hit) { setb(at++, b(p)); p++; }
    }
    const spans = alloc(24); put(spans, out); put(spans + 4, he2); put(spans + 8, bs2); put(spans + 12, at); put(spans + 16, names); put(spans + 20, nn); put(names + 64, lens);
    return spans;
  }
  function rule_(t: number, self: number, hs: number, he: number, bs: number, be: number, closure: number, names: number): number {
    // (off: `{a: Superposed} [x] {b}` matches nearly every binary expression, its typed hole asked at each, or (superposing)
    // each read twice, nested: the suite times out)
    const spans = 0 && operator_holes(hs, he, bs, be); if (spans) { hs = w(spans); he = w(spans + 4); bs = w(spans + 8); be = w(spans + 12); }
    const r = head(t, hs, he, latest(self), names);
    // (its operator holes: what fills one, only an operator's characters)
    if (spans) { const nm = w(spans + 16), ln = w(nm + 64); for (let k = 0; k < w(r + R_PARTS); k++) { const q = r + R_PART + PART * k; if ((w(q) & 15) !== HOLE) continue; for (let j = 0; j < w(spans + 20); j++) { const a0 = skip(w(q + 4), w(q + 4) + w(q + 8)); let z0 = w(q + 4) + w(q + 8); while (z0 > a0 && b(z0 - 1) <= 32) z0--; if (z0 - a0 === w(ln + 4 * j) && same(a0, w(nm + 4 * j), z0 - a0)) put(q, w(q) | OPER); } } }
    // (a body written in brackets is what is inside them; one that is `{name}`, a hole of its own, is that hole's code)
    if (!ref(r, 0, bs, be, 1)) { code(t, bs, be); bs = w(t + T_A); be = w(t + T_B); }
    // (in a node made before the test it is in: of its rules, only the test's own (what it made there), defined again in place)
    const old_ = older(self);
    for (let o = latest(self); o && o !== w(self + N_BASE) && (!old_ || in_region(o)); o = w(o)) {
      if (w(o + R_KIND) !== RULE || (w(o + R_FLAGS) & DEAD) || !alike(o, r)) continue;
      // (one with holes: that rule given this one's parts and body, for what read it already; and this one placed last, binding
      // loosest)
      if (w(o + R_HOLES)) {
        for (let i = 0; i < PART * w(r + R_PARTS); i += 4) put(o + R_PART + i, w(r + R_PART + i));
        // (a hole's type not read yet, to be read into this one's parts now)
        for (let i = 0; i < w(LAZY_N) && i < w(LAZY_CAP); i++) { const l = w(LAZY) + 24 * i, q = w(l); if (q >= r + R_PART && q < r + R_PART + PART * w(r + R_PARTS)) put(l, o + (q - r)); }
        put(o + R_MASK, w(r + R_MASK));
        put(o + R_BS, bs); put(o + R_BE, be); put(o + R_CLOSURE, closure); put(o + R_HEAD, w(r + R_HEAD)); put(o + R_BODY, 0);
        break;
      }
      put(o + R_BS, bs); put(o + R_BE, be); put(o + R_CLOSURE, closure); put(o + R_BODY, 0);
      return o;
    }
    put(r + R_OWNER, self); put(r + R_BS, bs); put(r + R_BE, be); put(r + R_CLOSURE, closure);
    link(self, r);
    // (one made while the files are read, not in a test: listed, its body read at build)
    // (held weakly where what is made is moved or let go of (`rules_listed`): by what it is a rule of, if anything)
    if (!w(THREAD + T_REG_AT)) { const k = xadd(RULES_N, 1); if (k < w(RULES_CAP)) { if (w(THREAD + EV) && w(w(THREAD + EV))) set(w(RULES) + 4 * k, r); else put(w(RULES) + 4 * k, r); } }
    return r;
  }
  // (the names a hole's content (a to z, in the head s to e) read from `from` on, each not another's type: when there are
  // several, the head written again with a hole for each, the text between them as it was (at T_A, T_B); else 0)
  function separate(t: number, from: number, s: number, e: number, a: number, z: number): number {
    const list = w(t + T_DECLS), n = w(t + T_DECLS_N), W = w(w(WORDS) + 8 * W_TYPE), WN = w(w(WORDS) + 8 * W_TYPE + 4);
    let count = 0;
    // (written in it: what the rules applied there read, elsewhere, is not)
    for (let k = from; k < n; k++) { const d = list + 12 * k; if (w(d + 4) < a || w(d + 8) > z) put(d, 0); }
    // (one inside another, `{x: T, y}` read as `x: (T, y)`: the outer one)
    for (let k = from; k < n; k++) { const d = list + 12 * k; if (!w(d)) continue; for (let j = from; j < n; j++) { const o = list + 12 * j; if (j !== k && w(o) && w(o) !== w(d) && w(o + 4) <= w(d + 4) && w(d + 8) <= w(o + 8)) { put(d, 0); break; } } }
    // (the same name read twice, once)
    for (let k = from; k < n; k++) { const d = list + 12 * k; if (!w(d)) continue; for (let j = from; j < k; j++) if (w(list + 12 * j) === w(d)) { put(d, 0); break; } }
    for (let k = from; k < n; k++) {
      const d = list + 12 * k;
      if (!w(d)) continue;
      for (let j = from; j < n; j++) if (j !== k && w(list + 12 * j) && member(t, w(list + 12 * j), W, WN) === w(d)) { put(d, 0); break; }
      if (w(d)) count++;
    }
    if (count < 2) return 0;
    const open = w(OPEN_LENGTH), close = w(CLOSE_LENGTH), out = allocb((e - s) + count * (open + close) + 8);
    let o = 0, at = a;
    for (let i = s; i < a - open; i++) { setb(out + o, b(i)); o++; }
    for (;;) {
      // (the next of them, by where it is written)
      let next = 0;
      for (let k = from; k < n; k++) { const d = list + 12 * k; if (w(d) && w(d + 4) >= at && (!next || w(d + 4) < w(next + 4))) next = d; }
      if (!next) break;
      for (let i = at; i < w(next + 4); i++) { setb(out + o, b(i)); o++; }
      for (let i = 0; i < open; i++) { setb(out + o, b(w(OPEN) + i)); o++; }
      for (let i = w(next + 4); i < w(next + 8); i++) { setb(out + o, b(i)); o++; }
      for (let i = 0; i < close; i++) { setb(out + o, b(w(CLOSE) + i)); o++; }
      at = w(next + 8);
    }
    for (let i = at; i < z; i++) { setb(out + o, b(i)); o++; }
    for (let i = z + close; i < e; i++) { setb(out + o, b(i)); o++; }
    // (written the same: nothing to separate)
    if (o === e - s && same(out, s, o)) return 0;
    put(t + T_A, out); put(t + T_B, out + o);
    return 1;
  }
  // (the same head: its text and where its holes are, whatever they are named)
  function alike(a: number, c: number) {
    if ((w(a + R_FLAGS) & METHOD) !== (w(c + R_FLAGS) & METHOD) || w(a + R_PARTS) !== w(c + R_PARTS)) return 0;
    for (let k = 0; k < w(a + R_PARTS); k++) {
      const p = a + R_PART + PART * k, q = c + R_PART + PART * k;
      if ((w(p) & 15) !== (w(q) & 15)) return 0;
      // (a hole of another type, `{x: T}`: another rule)
      if ((w(p) & 15) === HOLE && w(p + 16) !== w(q + 16)) return 0;
      if ((w(p) & 15) === LITERAL && (w(p + 8) !== w(q + 8) || !same(w(p + 4), w(q + 4), w(p + 8)))) return 0;
    }
    return 1;
  }
  // A head compiled (read with the rules from `vis` on): literal text, spaces and holes. A hole's text is read as code, in a node
  // that is the hole (`{x: T}`: `{x}: {type}` gives it its type); text it reads as is a literal (`{\`=>\`}`).
  function head(t: number, s: number, e: number, vis: number, names: number): number {
    const asked = R_PART + PART * (e - s > 1 ? e - s : 1), rule = alloc(asked), led = rule + R_PART;
    // (out of memory: a rule of nothing, what reads it stopping)
    if (rule === w(TRASH)) { put(rule + R_PARTS, 0); put(rule + R_HOLES, 0); put(rule + R_FLAGS, 0); return rule; }
    put(rule + R_PREV, vis); parts(s, e, rule);
    // (room for a part a character, as many as there are kept: the rest given back, unwritten, when nothing was made after it)
    const used = R_PART + PART * (w(rule + R_PARTS) > 1 ? w(rule + R_PARTS) : 1);
    if (used < asked && w(THREAD + T_CHUNK) === rule + asked) { set(THREAD + T_CHUNK, rule + used); if (w(THREAD + EV) && w(w(THREAD + EV))) set(rule - 4, used); set(THREAD + T_ALLOCATED, w(THREAD + T_ALLOCATED) - (asked - used)); }
    // (led by the hole `this`, `{this}…`: a method, read only on a value, what is after it)
    let method = 0;
    // (led by a space, `{ }…`: the same, what follows a value after a space)
    if (w(rule + R_PARTS) > 1 && (w(led) & 15) === SPACE) {
      method = 1;
      const n = w(rule + R_PARTS) - 1;
      for (let i = 0; i < PART * n; i += 4) put(led + i, w(led + PART + i));
      put(rule + R_PARTS, n);
      // (what follows a value after a space, `3 boolean`, is a value: never an operator and what it takes, `== 8`)
      if ((w(led) & 15) === HOLE) put(led, w(led) | VALUED_HOLE);
    }
    if (w(rule + R_PARTS) > 1 && w(led) === HOLE) {
      let a = w(led + 4), z = a + w(led + 8); while (a < z && b(a) <= 32) a++; while (z > a && b(z - 1) <= 32) z--;
      if (word(a, z, W_THIS)) {
        method = 1;
        const n = w(rule + R_PARTS) - 1;
        for (let i = 0; i < PART * n; i += 4) put(led + i, w(led + PART + i));
        put(rule + R_PARTS, n);
      }
    }
    // (led by a symbol and written in a node, not everywhere nor at the top of a file (`@me/{path}`) (`[{{selection}}]`, `.. (last)` of Iterable's): a method of the
    // value it follows, not what reads the same text written alone in that node (`[1, 2, 3]` there))
    if (!method && w(rule + R_PARTS) > 1 && w(led) === LITERAL && owner(vis) !== w(GLOBAL) && !(w(owner(vis) + N_IS) === IS_NODE && w(owner(vis) + N_A) === ROOT) && (b(w(CLASSES) + b(w(led + 4))) === 2 || b(w(led + 4)) === 91)) method = 1;
    let hole = 0;
    for (let k = 0; k < w(rule + R_PARTS); k++) {
      const q = rule + R_PART + PART * k;
      if ((w(q) & 15) !== HOLE) continue;
      const a = w(q + 4), z = a + w(q + 8), nd = node(IS_HOLE, 0, 0, owner(vis), 0);
      // (a hole of code, `{{x: T}}`: its name and type are those of what its braces hold, `x: T`)
      let ra = a, rz = z; { let p = a, y = z; while (p < y && b(p) <= 32) p++; while (y > p && b(y - 1) <= 32) y--; if (b(p) === 123 && b(y - 1) === 125 && past(p, y) >= y) { ra = p + 1; rz = y - 1; } }
      // (read with the names of where it is written: `{x: a}` in a rule's body, its `a`; code led by an operator declares
      // nothing, `{!= ":" && != "/"}` of a narrowing in a header made a head: not run (it would ask it of what is being made))
      const r = vis && b(w(CLASSES) + b(ra)) !== 2 ? reading(t, ra, rz, names ? w(names + F_RULE) : 0, names ? w(names + F_CLOSURE) : 0, vis, nd, HOLES, 0, DEFINES | READER, 0) : 0;
      let value = 0;
      if (r && w(r) === K_RULE) {
        const outer = w(t + T_HOLE), decls = w(t + T_DECLS_N), oa = w(t + T_HOLE_A), ob = w(t + T_HOLE_B);
        put(t + T_HOLE, nd); put(t + T_HOLE_A, ra); put(t + T_HOLE_B, rz);
        value = ev(t, r, names || (w(GLOBAL) ? frame(0, 0, nd, a, z, 0, 0, nd, nd) : 0), 0, nd, 1, nd, nd);
        put(t + T_HOLE, outer); put(t + T_HOLE_A, oa); put(t + T_HOLE_B, ob);
        caught(t, a);
        // (it read several names, `{a, b}` (not one's type, `{x: T}`): a hole for each, what is between them as written)
        const several = separate(t, decls, s, e, a, z);
        set(t + T_DECLS_N, decls);
        if (several) return head(t, w(t + T_A), w(t + T_B), vis, names);
      }
      if (value && value !== nd && w(value + N_IS) === IS_TEXT) { put(q, LITERAL); put(q + 4, w(value + N_A)); put(q + 8, w(value + N_B) - w(value + N_A)); continue; }
      if (w(nd + N_A)) { put(q + 4, w(nd + N_A)); put(q + 8, w(nd + N_B) - w(nd + N_A)); }
      else { put(nd + N_A, ra); put(nd + N_B, rz); put(q + 4, ra); put(q + 8, rz - ra); }
      const type = r && w(r) === K_RULE ? member(t, nd, w(w(WORDS) + 8 * W_TYPE), w(w(WORDS) + 8 * W_TYPE + 4)) : 0;
      // (a type that is a hole, or a name nothing defines yet (a place), or nothing (a member of what is not there yet,
      // `Subscript.String` before `Subscript`): not yet a type, it reads nothing yet (not: anything))
      const pending = type === nd || (type && (w(type + N_IS) === IS_HOLE || w(type + N_IS) === IS_PLACE || type === w(NOTHING)));
      if (DEBUG && !type) { for (let x = a; x < z; x++) if (b(x) === 58) { debug(D_FAULT, 79, a, z); debug(D_FAULT, 78, r ? w(r) : -1, r && w(r) === K_RULE ? w(w(r + 12) + R_BS) : 0); break; } }
      put(q + 12, hole); hole++; put(q + 16, type && !pending ? type : 0); put(q + 20, nd);
      // (a type nothing reads yet, `{x: T}` before T is there: none yet, the rule reads nothing until it is)
      if (pending) { if (DEBUG) debug(D_DEFINE, a, z, type || 1); put(q + 16, 1); const lz = xadd(LAZY_N, 1), l = w(LAZY) + 24 * lz; if (lz < w(LAZY_CAP)) { put(l, q); put(l + 4, r); put(l + 8, a); put(l + 12, z); put(l + 16, vis); put(l + 20, names); } }
    }
    put(rule + R_HOLES, hole);
    const n = w(rule + R_PARTS), sep = w(SEPARATOR), sn = w(SEPARATOR_LENGTH);
    // (one whose head is one hole: a reader, not read in a hole, which names what it holds)
    let literal = 0; for (let k = 0; k < n; k++) if ((w(rule + R_PART + PART * k) & 15) === LITERAL) literal = 1;
    let flags = (n > 0 && w(led) === LITERAL ? LED : 0) | (hole > 0 ? HOLES : 0) | (method ? METHOD : 0) | (hole > 0 && !literal && !method ? READER : 0);
    for (let k = 0; k < n; k++) { const q = rule + R_PART + PART * k; if (w(q) === LITERAL && w(q + 8) === sn && sn && same(w(q + 4), sep, sn)) flags |= DEFINES; }
    put(rule + R_FLAGS, flags);
    // (a head that is one hole between two characters makes them a pair, as the brackets are: a hole never ends inside one)
    if (n === 3 && w(led) === LITERAL && w(led + PART) === HOLE && w(led + 2 * PART) === LITERAL && w(led + 8) === 1 && w(led + 2 * PART + 8) === 1) {
      const o = b(w(led + 4)), c = b(w(led + 2 * PART + 4)), pairs = w(PAIRS);
      // (characters on their own only, the brackets and quotes: an operator, `.{x}?`, is no pair)
      if (!b(pairs + o) && !b(pairs + c) && b(w(CLASSES) + o) === 3 && b(w(CLASSES) + c) === 3) { if (o === c) setb(pairs + o, 3); else { setb(pairs + o, 1); setb(pairs + c, 2); } put(PAIRS_GEN, w(PAIRS_GEN) + 1); }
    }
    // (a hole written against text takes no space, `{x}: {type}` (`:` binds the nearest); the last one, none it begins with
    // (`.{member}`); one inside a pair, any)
    for (let k = 0; k < n; k++) {
      const q = rule + R_PART + PART * k;
      if ((w(q) & 15) !== HOLE) continue;
      const before = k > 0 && (w(q - PART) & 15) === LITERAL, after = k < n - 1 && (w(q + PART) & 15) === LITERAL, pairs = w(PAIRS);
      const o = before ? b(w(q - PART + 4) + w(q - PART + 8) - 1) : 0, c = after ? b(w(q + PART + 4)) : 0;
      // (or between `<` and `>` written in the head, `class: <{generics}>(…)`: what is between them, any)
      const enclosed = before && after && ((b(pairs + o) === 1 && b(pairs + c) === 2) || (o === c && b(pairs + o) === 3) || (o === 60 && c === 62));
      // (not against what separates, `,` `;` (on its own, no pair): `{list}, {other}`'s list may hold spaces)
      const separates = (before ? b(w(CLASSES) + o) === 3 && !b(pairs + o) : 1) && (after ? b(w(CLASSES) + c) === 3 && !b(pairs + c) : 1);
      if ((before || after) && !enclosed && !separates) put(q, HOLE | HUG);
    }
    // (a head that is one hole takes a word, of a word's characters only: anything else it would read whole is everything)
    // (a method's, `{this}{rest}`: what follows the value it is read on)
    if (n === 1 && (w(led) & 15) === HOLE && !w(led + 16) && !method) put(led, HOLE | HUG | WORD);
    // (and a space between two holes is one: two holes never touch)
    for (let k = 1; k < n - 1; k++) { const q = rule + R_PART + PART * k; if ((w(q) & 15) === SPACE && (w(q - PART) & 15) === HOLE && (w(q + PART) & 15) === HOLE) put(q, SPACE | HUG); }
    // (its head: read on, what any value answers (not what the node it is defined in has); where it is defined, kept by it)
    const head_ = node(IS_HEAD, s, e, w(GLOBAL) || (vis ? owner(vis) : 0), 0); put(w(head_ + N_BASE) + R_CLOSURE, vis ? owner(vis) : 0);
    put(rule + R_HEAD, head_);
    // (a numeral, as the kernel's map names it (`numeral `{head}``, read before the rule is): flagged when it is defined)
    if (numeral_head(s, e - s)) put(rule + R_FLAGS, w(rule + R_FLAGS) | NUMERAL);
    // (one superposing, as the map names it (`superposing `{head}``, read before the library defines it): flagged so too)
    if ((w(SUPERPOSING_AT) && e - s === w(SUPERPOSING_AT + 4) && same(s, w(SUPERPOSING_AT), e - s)) || (w(SUPERPOSING_AT + 8) && e - s === w(SUPERPOSING_AT + 12) && same(s, w(SUPERPOSING_AT + 8), e - s))) put(rule + R_FLAGS, w(rule + R_FLAGS) | SUPERPOSING);
    // (a method, named first, whose parameters have types, `as (base: Number.Base)`: those are part of its pattern, asked once, of what it is
    // applied to; not one of them, it does not apply (what reads the text without it does))
    if ((w(rule + R_FLAGS) & METHOD) && !(w(rule + R_FLAGS) & SUPERPOSING) && (w(rule + R_PART) & 15) === LITERAL && b(w(CLASSES) + b(w(rule + R_PART + 4))) === 1) for (let k = 0; k < w(rule + R_PARTS); k++) { const q = rule + R_PART + PART * k; if ((w(q) & 15) === HOLE && w(q + 16)) { put(rule + R_FLAGS, w(rule + R_FLAGS) | REFUSES); break; } }
    let m = 0;
    for (let k = 0; k < w(rule + R_PARTS); k++) { const q = rule + R_PART + PART * k; if ((w(q) & 15) === LITERAL) m |= bytes(w(q + 4), w(q + 4) + w(q + 8)); }
    put(rule + R_MASK, m);
    return rule;
  }
  // (a jump or a stop left where it can go nowhere: said, and done with)
  function caught(t: number, at: number) {
    if (w(t + T_JUMP_N)) { if (!word(w(t + T_JUMP_S), w(t + T_JUMP_S) + w(t + T_JUMP_N), W_ERRED)) say(t, at, L_UNLABELLED, w(t + T_JUMP_S), w(t + T_JUMP_N)); put(t + T_JUMP_N, 0); }
    if (w(t + T_FAULT)) { say(t, at, w(t + T_FAULT), w(t + T_FAULT) === L_DEEP ? w(t + T_DEEPC) : 0, 0); put(t + T_FAULT, 0); }
  }

  // What a node holds under a name (the text at s, n long): its own rule written as that name, applied.
  function member(t: number, nd: number, s: number, n: number): number {
    if (w(t + T_BUDGET) < 1000) set(t + T_BUDGET, w(BUDGET));
    if (w(t + T_QBUDGET) < 1000) set(t + T_QBUDGET, 10 * w(BUDGET));
    for (let r = latest(nd); r && r !== w(nd + N_BASE); r = w(r)) {
      const hd = w(r + R_HEAD);
      if (w(r + R_HOLES) || !hd || !trimmed(w(hd + N_A), w(hd + N_B) - w(hd + N_A), s, s + n)) continue;
      return apply(t, r, 0, w(GLOBAL) ? frame(0, 0, nd, 0, 0, 0, 0, nd, nd) : 0, 0, nd, w(hd + N_A), w(hd + N_B), nd, nd);
    }
    return 0;
  }
  // A take's value: its code read where it was written, once. (What a reference took is read again, for this one: `while c
  // { … }` asks its condition each time.)
  // (being read: by which thread, odd; another waits for it, this one needs itself)
  // (a place a take answered: its name read again where it was named, now (defined since, its value; else the place))
  function resolved(t: number, tk: number): number {
    const v = w(tk + T_VALUE);
    if (!v || w(v + N_IS) !== IS_PLACE || !place_in(v) || w(v + N_A) >= w(v + N_B)) return v;
    // (only where its code is that name, a name read before it is defined: a place given along under another name is the place)
    const o = follow(tk, 1); if (!trimmed(w(v + N_A), w(v + N_B) - w(v + N_A), w(o), w(o + 4))) return v;
    const scope = place_in(v), r = reading(t, w(v + N_A), w(v + N_B), 0, 0, latest(scope), scope, 0, 0, 0, 0);
    if (w(r) !== K_RULE || (w(w(r + 12) + R_KIND) === VALUE && w(w(r + 12) + R_BS) === v)) return v;
    // (while it is: the place (what was defined from it, read on, reads it again))
    aput(tk + T_STATE, 3);
    const fr = frame(0, 0, scope, w(v + N_A), w(v + N_B), 0, 0, scope, scope), now = ev(t, r, fr, fr, scope, 1, scope, scope);
    aput(tk + T_STATE, 2);
    // (kept, but not by a take made before a test, of what the test made: it is let go of with the test)
    if (now && w(now + N_IS) !== IS_PLACE && !older(tk) && (!w(THREAD + T_REG_AT) || in_region(tk) || !in_region(now))) cache_take(tk, now);
    return now || v;
  }
  // (a hole's code written in the left side being read (its text inside it): read as part of it, wherever it is used)
  // (the texts of the left side being read: each code it read as part of it (T_LS spans, T_LE of them, from T_LB: a value read
  // in it, a receiver, reads none of them))
  function in_left(s: number, e: number): number {
    const at = w(THREAD + T_LS);
    for (let i = w(THREAD + T_LB); at && i < w(THREAD + T_LE); i++) if (s >= w(at + 8 * i) && e <= w(at + 8 * i + 4)) return 1;
    return 0;
  }
  function lefts() { return w(THREAD + T_LE) > w(THREAD + T_LB) ? 1 : 0; }
  function push_left(s: number, e: number): number {
    if (!w(THREAD + T_LS)) put(THREAD + T_LS, alloc(8 * LEFTS));
    const n = w(THREAD + T_LE); if (n < LEFTS) { put(w(THREAD + T_LS) + 8 * n, s); put(w(THREAD + T_LS) + 8 * n + 4, e); put(THREAD + T_LE, n + 1); }
    return n;
  }
  // (a take's value kept, read: one newer than the take, made by an application still running, noted, so that when that one's
  // memory is let go of the take is unread again (read again, where it was written, when it is asked))
  // (and a reading kept for all, at a slot: one holding what an application still running made keeps that application's memory
  // (forgotten instead, it is read again and again: many times slower))
  function memo_holds(slot: number, lo: number, hi: number): number {
    const a = w(slot + 8), c = w(slot + 12), d = w(slot + 16), g = w(slot + 24), r = w(slot + 28);
    return (a >= lo && a < hi) || (c >= lo && c < hi) || (d >= lo && d < hi) || (g >= lo && g < hi) || (r >= lo && r < hi) ? 1 : 0;
  }
  function memo_noted(slot: number) {
    const n = w(THREAD + T_LVL_N); if (!n || !w(THREAD + T_WEAK)) return;
    const top = w(THREAD + T_LVL) + 24 * (n - 1), lo = w(top + 12), hi = w(THREAD + T_CHUNK);
    if (memo_holds(slot, lo, hi)) set(top + 4, -1);
  }
  function cache_take(tk: number, v: number) {
    // (forgotten instead when that application's memory is let go of, it is read again and again: many times slower)
    // (one noted so, its value not keeping that memory: written without marking it kept) TODO(explicit)
    const n = w(THREAD + T_LVL_N), top = n ? w(THREAD + T_LVL) + 24 * (n - 1) : 0;
    if (w(THREAD + T_WEAK_ON) && n && w(THREAD + T_WEAK) && v >= w(top + 12) && v < w(THREAD + T_CHUNK) && !(tk >= w(top) && tk < w(THREAD + T_CHUNK)) && w(THREAD + T_WEAK_N) < 1 << 20) {
      const k = w(THREAD + T_WEAK_N); set(w(THREAD + T_WEAK) + 4 * k, tk); set(THREAD + T_WEAK_N, k + 1);
      set(tk + T_VALUE, v); aput(tk + T_STATE, 2);
      return;
    }
    put(tk + T_VALUE, v); aput(tk + T_STATE, 2);
  }
  function valued(t: number, tk: number): number {
    let state = aload(tk + T_STATE);
    if (state === 2) return resolved(t, tk);
    if (state === 3) return w(tk + T_VALUE);
    if (!state && w(t + T_GIVEN_N) && !NOGIVEN) { const g = given(tk); if (g) { put(tk + T_VALUE, g); aput(tk + T_STATE, 3); return g; } }
    // (a take of what another took, `{x}` or `x`: that one's value, read once where it was written, kept there (and here))
    const source = follow(tk, 1);
    // (one word, read as a left side through what refers to it (`(name)` given `seen`): which one, so that what it names,
    // visible, is where it is; not a value read in a left side directly, `arguments = None`'s `None`)
    if (source !== tk) {
      const one = w(t + T_ONE);
      const here = w(t + T_HERE);
      // (a word given by reference, `(name)` (`=`): the visible one's place; given as code spliced here, `({written_parameters})`
      // (a call's parameters): declared here)
      if (w(t + T_DECL) && (worded(w(source), w(source + 4)) || operated(w(source), w(source + 4)))) { const ta = skip(w(tk), w(tk + 4)); let tz = w(tk + 4); while (tz > ta && b(tz - 1) <= 32) tz--; put(t + T_ONE, skip(w(source), w(source + 4))); put(t + T_HERE, bracket(ta, tz) === 5 + 8 * w(OPEN_LENGTH) && past(ta, tz) === tz ? 1 : 0); }
      const v = valued(t, source);
      put(t + T_ONE, one); put(t + T_HERE, here);
      if (aload(source + T_STATE) === 2 && !older(tk)) cache_take(tk, v);
      return v;
    }
    // (one made before what is isolated, not yet known: known here only, as it is here)
    if (state !== 2 && older(tk)) { const o = follow(tk, 1), origin = w(o + T_ORIGIN); return block(t, w(o), w(o + 4), origin, origin, w(o + T_THIS), w(o + T_VIS), 1, 0, w(o + T_THIS), w(o + T_LEX)); }
    for (let n = 0; (state & 1) && (state & -2) !== THREAD && n < 100000000; n++) state = aload(tk + T_STATE);
    if (state === 2) return resolved(t, tk);
    if (state & 1) { if (DEBUG) debug(D_FAULT, 97, w(tk), w(tk + 4)); say(t, w(tk), L_CYCLE, 0, 0); return 0; }
    aput(tk + T_STATE, THREAD | 1);
    // (one typed by a text reads only that text: its value is the text)
    const o = follow(tk, 1), origin = w(o + T_ORIGIN), ty = w(o + T_VIS), left = in_left(w(o), w(o + 4)), decl_was = w(t + T_DECL), one_was = w(t + T_ONE);
    // (its own text, a word of the left side (`(x) := …`, a call's `(other)`): declared here, not where a visible one is (`=`
    // asks for that: its name is code its caller wrote, above))
    const here_was = w(t + T_HERE);
    if (left) { put(t + T_DECL, 1); if (worded(w(o), w(o + 4)) || operated(w(o), w(o + 4))) { put(t + T_ONE, skip(w(o), w(o + 4))); put(t + T_HERE, (w(FAIL_FAST) & 8) ? 0 : 1); } }
    // (code read as a left side: the left side, from here, its text)
    const pushed = w(t + T_LE); if (w(t + T_DECL)) push_left(w(o), w(o + 4));
    const tv = w(t + T_TV), tvs = w(t + T_TVS), tve = w(t + T_TVE);
    if (ty > 1 && w(ty + N_IS) !== IS_TEXT) { put(t + T_TV, ty); put(t + T_TVS, w(o)); put(t + T_TVE, w(o + 4)); }
    const ld = w(o + T_LEAD), lwr = w(t + T_WRITER), lws = w(t + T_WRITER_SELF); if (ld) { put(t + T_WRITER, w(o + T_THIS)); put(t + T_WRITER_SELF, ld); }
    const v = ty > 1 && w(ty + N_IS) === IS_TEXT ? ty : block(t, w(o), w(o + 4), origin, origin, ld || w(o + T_THIS), ty, 1, 0, ld || w(o + T_THIS), w(o + T_LEX));
    if (ld) { put(t + T_WRITER, lwr); put(t + T_WRITER_SELF, lws); }
    put(t + T_TV, tv); put(t + T_TVS, tvs); put(t + T_TVE, tve);
    put(t + T_LE, pushed);
    if (left) { put(t + T_DECL, decl_was); put(t + T_ONE, one_was); put(t + T_HERE, here_was); }
    if (stopped(t)) { aput(tk + T_STATE, 0); return 0; }
    // (a place, a name nothing defines yet: not kept, read again when it may be)
    // (a place, a name nothing defines yet: kept as the place, its name read again where it was named when asked (`resolved`))
    cache_take(tk, v);
    return v;
  }
  // (a take whose code is `{name}` (as a value, also `name`): what that hole took)
  // (some code along a take's references, `{x}` to what x took and so on, written in the left side being read)
  function left_along(tk: number): number {
    for (let n = 0; n < 64; n++) {
      if (in_left(w(tk), w(tk + 4))) return 1;
      const origin = w(tk + T_ORIGIN); if (!origin) return 0;
      let x = refer(origin, w(origin + F_RULE), w(origin + F_CLOSURE), w(tk), w(tk + 4), 1);
      if (!x) x = refer(origin, w(origin + F_RULE), w(origin + F_CLOSURE), w(tk), w(tk + 4), 0);
      if (!x) return 0;
      tk = take(w(THREAD + T_REFF), (x - 1) >> 16, (x - 1) & 0xFFFF);
    }
    return 0;
  }
  // (how many takes of other rules' holes a take goes through to the text it is: what `follow` walks)
  function hops(tk: number): number {
    let n = 0;
    for (; n < 8; n++) {
      const origin = w(tk + T_ORIGIN);
      if (!origin || w(origin + N_IS) !== IS_FRAME) return n;
      let x = refer(origin, w(origin + F_RULE), w(origin + F_CLOSURE), w(tk), w(tk + 4), 1);
      if (!x) x = refer(origin, w(origin + F_RULE), w(origin + F_CLOSURE), w(tk), w(tk + 4), 0);
      if (!x) return n;
      tk = take(w(THREAD + T_REFF), (x - 1) >> 16, (x - 1) & 0xFFFF);
    }
    return n;
  }
  function follow(tk: number, bare: number): number {
    for (let n = 0; n < 1000; n++) {
      const origin = w(tk + T_ORIGIN);
      if (!origin) return tk;
      if (DEBUG && w(origin + N_IS) !== IS_FRAME) { debug(D_FAULT, 1102, w(tk), w(tk + 4)); return tk; }
      let x = refer(origin, w(origin + F_RULE), w(origin + F_CLOSURE), w(tk), w(tk + 4), 1);
      if (!x && bare) x = refer(origin, w(origin + F_RULE), w(origin + F_CLOSURE), w(tk), w(tk + 4), 0);
      if (!x) return tk;
      if (DEBUG) { let fq = w(THREAD + T_REFF); const dd = (x - 1) >> 16, ii = (x - 1) & 0xFFFF; for (let d = 0; d < dd && fq; d++) fq = w(fq + F_CLOSURE); if (!fq || w(fq + N_IS) !== IS_FRAME || ii >= w(w(fq + F_RULE) + R_HOLES)) { debug(D_FAULT, 1103, w(tk), w(tk + 4)); debug(D_FAULT, 1104, dd, w(THREAD + T_REFF) === origin ? 0 : 1); if (fq && w(fq + N_IS) === IS_FRAME) debug(D_FAULT, 1105, w(fq + F_RULE), ii); return tk; } }
      tk = take(w(THREAD + T_REFF), (x - 1) >> 16, (x - 1) & 0xFFFF);
    }
    return tk;
  }
  // (what a frame holds by this name: its caller, its this, one of its rule's holes)
  function held_in(fr: number, s: number, e: number): number { s = skip(s, e); while (e > s && b(e - 1) <= 32) e--; return word(s, e, W_CALLER) || word(s, e, W_THIS) || (w(fr + F_RULE) && named(w(fr + F_RULE), s, e) >= 0) ? 1 : 0; }
  // (a node a method made to run in (`external .` in a frame of a rule led by `{this}`), made of what it was read on)
  // (a rule led by `.`, `.{member}`: what it declares is a member of what `.` is)
  function dotted(rule: number): number { return rule && (w(rule + R_FLAGS) & LED) && b(w(rule + R_PART + 4)) === 46 ? 1 : 0; }
  function run_node(n: number): number { const mk = w(n + N_IS) === IS_NODE && w(n + N_ALSO) ? w(n + N_B) : 0; return mk > 1 && w(mk + N_IS) === IS_FRAME && w(mk + F_RULE) && (w(w(mk + F_RULE) + R_FLAGS) & (METHOD | OWNS)) ? 1 : 0; }
  // (at written in rule r's own body)
  function in_body(r: number, at: number): number { return w(r + R_BS) <= at && at < w(r + R_BE) ? 1 : 0; }
  function inlined_at(r: number, at: number): number { return w(r + R_ALL_S) && w(r + R_ALL_S) <= at && at < w(r + R_ALL_E) ? 1 : 0; }
  // (the text from s to e an operator's name, only characters of an operator: `==`, `..` (what a method of it is named by))
  function operated(s: number, e: number): number { s = skip(s, e); while (e > s && b(e - 1) <= 32) e--; if (s >= e) return 0; for (let i = s; i < e; i++) if (b(w(CLASSES) + b(i)) !== 2) return 0; return 1; }
  // (rule r: text, then its hole i written against it, the last of its head, and its body that hole alone (`.{member} =>
  // {member}`))
  function rest_of_line(r: number, i: number): number {
    if (!r) return 0;
    const k = part(r, i), n = w(r + R_PARTS), q = r + R_PART + PART * k;
    if (k !== n - 1 || k < 1 || (w(r + R_PART + PART * (k - 1)) & 15) !== LITERAL || !(w(q) & HUG)) return 0;
    return ref(r, 0, w(r + R_BS), w(r + R_BE), 1) === i + 1 ? 1 : 0;
  }
  function take(f: number, depth: number, i: number) { for (let d = 0; d < depth; d++) f = w(f + F_CLOSURE); return f + F_TAKES + TAKE * i; }

  // ---- files and tests

  // A file's statements (`Statements(file, dynamically scope.last)`): each read with its scope's rules as they are then. What
  // none reads is read again when the scope gains a rule. (The language's own file, `k` < 0: as it goes, and what is left is
  // said. Another, read beside the others: with the language and its own rules only, what it writes in the language's a shadow
  // of it; what is left is read again once every file is read, with what each file wrote, in the order they were given.)
  function run(t: number, s: number, e: number, top: number, k: number, order: number) {
    const scope = w(top + F_THIS);
    let lines = 1; for (let i = s; i < e; i++) if (b(i) === 10) lines++;
    const unread = alloc(4 + 8 * lines);
    let pv = s;
    for (let at = skip(s, e); at < e; at = skip(at, e)) {
      const ln = line(at, e);
      // (painted (`T_PAINTS`): each comment on a line of its own before it, read as what it is, `// …`) TODO(explicit)
      if (w(t + T_PAINTS) && pv < at) comments_read(t, pv, at, scope);
      pv = ln;
      if (!statement(t, at, ln, top, scope, unread)) { const n = w(unread); put(unread + 4 + 8 * n, at); put(unread + 8 + 8 * n, ln); put(unread, n + 1); }
      at = ln;
    }
    if (w(t + T_PAINTS) && pv < e) comments_read(t, pv, e, scope);
    if (k < 0) { said(t, unread); return; }
    const p = w(PEND) + 20 * k;
    put(p, order); put(p + 4, top); put(p + 8, unread);
    kept(t, p);
  }
  // (what is left unread, said)
  function said(t: number, unread: number) { for (let i = 0; i < w(unread); i++) say(t, w(unread + 4 + 8 * i), L_UNREAD, w(unread + 4 + 8 * i), w(unread + 8 + 8 * i)); }
  // (a file's shadows, kept until they are merged)
  function kept(t: number, p: number) {
    const n = w(t + T_SH_N), sh = alloc(12 * n + 4);
    for (let i = 0; i < 12 * n; i += 4) put(sh + i, w(w(t + T_SH) + i));
    put(p + 12, sh); put(p + 16, n); set(t + T_SH_N, 0); set(t + T_ISO, 0);
  }
  // Every file read: what each wrote in the language, given to it in the order the files were given (their shadows made its
  // own); then what is left unread in each, read again (any thread, each file); until a round reads nothing, and what is left is
  // said. (Every thread does its part; one merges.)
  function settle(t: number, last: number) {
    for (;;) {
      const phase = aload(PHASE), n = aload(PEND_N);
      if (phase === FINAL) return;
      if (phase & 1) continue;
      if (phase >= 2) {
        const i = xadd(NEXT, 1);
        if (i < n) {
          const p = w(PEND) + 20 * i, unread = w(p + 8), before = unread ? w(unread) : 0;
          if (before) {
            isolate(t, 0);
            for (let j = 0; j < w(unread);) {
              if (statement(t, w(unread + 4 + 8 * j), w(unread + 8 + 8 * j), w(p + 4), w(w(p + 4) + F_THIS), unread)) {
                if (DEBUG) debug(D_SETTLED, w(unread + 4 + 8 * j), w(unread + 8 + 8 * j), w(unread) - 1);
                const m = w(unread) - 1;
                for (let x = j; x < m; x++) { put(unread + 4 + 8 * x, w(unread + 12 + 8 * x)); put(unread + 8 + 8 * x, w(unread + 16 + 8 * x)); }
                put(unread, m);
              } else j++;
            }
            if (w(unread) < before) aput(ANY, 1);
          }
          if (unread) kept(t, p);
          xadd(DONE, 1);
          continue;
        }
        if (aload(DONE) < n) continue;
      }
      if (acas(PHASE, phase, phase + 1) !== phase) continue;
      merged(n);
      typing(t, 0);
      let left = 0;
      for (let i = 0; i < n; i++) if (w(w(PEND) + 20 * i + 8)) left += w(w(w(PEND) + 20 * i + 8));
      if (left && (phase === 0 || aload(ANY))) { aput(ANY, 0); aput(DONE, 0); aput(NEXT, 0); aput(PHASE, phase + 2); continue; }
      for (let i = 0; i < n; i++) if (w(w(PEND) + 20 * i + 8)) { said(t, w(w(PEND) + 20 * i + 8)); put(w(PEND) + 20 * i + 8, 0); }
      if (last) typing(t, 1);
      aput(PHASE, FINAL);
      return;
    }
  }
  // (the types holes were given that nothing read yet, read again: the ones there now, given; at the end, the rest said)
  function typing(t: number, last: number) {
    for (let i = 0; i < w(LAZY_N) && i < w(LAZY_CAP); i++) {
      const l = w(LAZY) + 24 * i, q = w(l), r = w(l + 4);
      if (!q || w(q + 16) !== 1) continue;
      // (the same text, a type tried already in this pass and read as none (one made again for each rule made of it): not tried
      // again)
      let tried = 0; for (let j = 0; j < i && !tried; j++) { const lj = w(LAZY) + 24 * j; if (w(lj) && w(w(lj) + 16) === 1 && w(lj + 8) === w(l + 8) && w(lj + 12) === w(l + 12)) tried = 1; }
      if (tried) { if (last) { say(t, w(l + 8), L_UNREAD, w(l + 8), w(l + 12)); put(l, 0); } continue; }
      // (an attempt that reads no type yet keeps nothing: what it made let go of, as an application's is (`freeing`), when
      // nothing made before it was given what it made; it is tried again at every settle)
      const lv = w(t + T_LVL), ln = w(t + T_LVL_N), start = w(t + T_CHUNK), cend = w(t + T_CHUNK_END), slot0 = w(t + T_SLOT), lazy0 = w(LAZY_N), log0 = w(LOG_N), at_ = lv + 24 * ln, rules0 = w(RULES_N);
      const scoped = w(t + T_FREEING) > 1 && lv && ln < DEPTH ? 1 : 0;
      if (scoped) {
        const below = ln ? at_ - 24 : 0;
        set(at_, start); set(at_ + 4, 0x7FFFFFFF); set(at_ + 8, cend); set(at_ + 12, below && w(below + 8) === cend ? w(below + 12) : start); set(at_ + 16, 0); set(at_ + 20, w(t + T_WEAK_N));
        const ev0 = w(t + EV); if (ev0 && w(ev0)) { if (!ln) { set(ev0 + 8, 0); set(ev0 + 40, 0); } if (ln < 6000) set(w(ev0 + 16) + 4 * ln, w(ev0 + 8)); }
        set(t + T_LVL_N, ln + 1);
      }
      const nd = node(IS_HOLE, 0, 0, owner(w(l + 16)), 0), outer = w(t + T_HOLE), oa = w(t + T_HOLE_A), ob = w(t + T_HOLE_B);
      // (each with a budget of its own: not what the thread that settles did before left (which thread it is is not the
      // language's: a constructor's `{arguments: Arguments}` stayed untyped on some runs))
      set(t + T_BUDGET, w(BUDGET)); set(t + T_QBUDGET, 10 * w(BUDGET)); set(t + T_GREW, 0);
      put(t + T_HOLE, nd); put(t + T_HOLE_A, w(l + 8)); put(t + T_HOLE_B, w(l + 12));
      ev(t, r, w(l + 20) || frame(0, 0, nd, w(l + 8), w(l + 12), 0, 0, nd, nd), 0, nd, 1, nd, nd);
      put(t + T_HOLE, outer); put(t + T_HOLE_A, oa); put(t + T_HOLE_B, ob);
      put(t + T_FAULT, 0); put(t + T_JUMP_N, 0);
      const type = member(t, nd, w(w(WORDS) + 8 * W_TYPE), w(w(WORDS) + 8 * W_TYPE + 4));
      if (scoped) set(t + T_LVL_N, ln);
      if (type && type !== nd && w(type + N_IS) !== IS_PLACE && w(type + N_IS) !== IS_HOLE) { put(q + 16, type); put(l, 0); }
      else {
        const now = w(t + T_CHUNK);
        let holds = w(LAZY_N) !== lazy0 || w(LOG_N) !== log0 ? 1 : 0;
        for (let k = 0; k < 1024 && !holds && scoped; k += 4) { if (k === T_LEXV || k === T_REFF || k === T_WRITTEN_IN || k === T_CHUNK || k === T_CHUNK_END || k === T_SLOT || k === T_SLOT_END || k === T_SCRATCH) continue; const tw = w(t + k); if (tw >= start && tw < now) holds = 1; }
        if (scoped && !holds && w(at_ + 4) >= start && now > start && w(t + T_CHUNK_END) === cend && w(RULES_N) === rules0) {
          for (let k = slot0; k < w(t + T_SLOT) && k < w(LIST_CAP); k++) { const pv = w(w(LIST) + 4 * k); if (pv >= start && pv < now) set(w(LIST) + 4 * k, 0); }
          rules_listed(rules0, start, now, 0, -1, 0);
          const wk = w(t + T_WEAK); let kept_n = w(at_ + 20);
          for (let weak_i = w(at_ + 20); weak_i < w(t + T_WEAK_N); weak_i++) {
            const en = w(wk + 4 * weak_i);
            if (en & 1) { const sl = en & -2; if (memo_holds(sl, start, now)) astore(sl, 0); else { set(wk + 4 * kept_n, en); kept_n++; } continue; }
            const tv = w(en + T_VALUE); if (tv >= start && tv < now && aload(en + T_STATE) === 2) { set(en + T_VALUE, 0); astore(en + T_STATE, 0); } else { set(wk + 4 * kept_n, en); kept_n++; }
          }
          set(t + T_WEAK_N, kept_n);
          fill(start, 0, now - start); set(t + T_CHUNK, start);
          if (w(t + T_LEXV) >= start && w(t + T_LEXV) < now) set(t + T_LEXV, 0);
          if (w(t + T_REFF) >= start && w(t + T_REFF) < now) set(t + T_REFF, 0);
          if (w(t + T_WRITTEN_IN) >= start && w(t + T_WRITTEN_IN) < now) set(t + T_WRITTEN_IN, 0);
        }
        if (last) { say(t, w(l + 8), L_UNREAD, w(l + 8), w(l + 12)); put(l, 0); }
      }
    }
  }
  // (the files' shadows, each file's in turn, by the order they were given: made the nodes' own)
  function merged(n: number) {
    let done = -1, changed = 0;
    for (let c = 0; c < n; c++) {
      let next = 0x7FFFFFFF, at = -1;
      for (let i = 0; i < n; i++) { const o = w(w(PEND) + 20 * i); if (o > done && o < next) { next = o; at = i; } }
      if (at < 0) break;
      done = next;
      const p = w(PEND) + 20 * at, sh = w(p + 12);
      for (let j = 0; j < w(p + 16); j++) {
        const nd = w(sh + 12 * j), top = w(sh + 12 * j + 4), was = w(sh + 12 * j + 8);
        if (top === was) continue;
        // (what a file put on the node, down to where it began; not there (that chain changed since): nothing to put back,
        // said with --debug)
        let r = top, count = 1; while (r && w(r + R_PREV) !== was && count < 1 << 20) { r = w(r + R_PREV); count++; }
        if (!r || w(r + R_PREV) !== was) { if (DEBUG) debug(D_FAULT, 1092, nd, top); continue; }
        put(r + R_PREV, w(nd + N_LAST)); put(nd + N_LAST, top); changed = 1;
        // (what each of them passes over, again: from the first of them, now after the others)
        const order = alloc(4 * count);
        r = top; for (let i = count - 1; i >= 0; i--) { put(order + 4 * i, r); r = w(r + R_PREV); }
        for (let i = 0; i < count; i++) skips(w(order + 4 * i));
      }
      put(p + 16, 0);
    }
    leveled(t);
    // (what was read once was read without them)
    if (changed) for (let tab = w(MEMO); tab; tab = w(tab - 8)) { for (let i = 0; i <= w(tab - 12); i++) put(tab + MEMO_ENTRY * i, 0); set(tab - 4, 0); }
  }
  // (the level the language is read with: the global `O`, a node of rules (`Compiler.ray` sets it, a scope made of each part of
  // `Compiler.default`); changed, what was read with the one before is read again (each rule's body, what was kept as read))
  function leveled(t: number) {
    // (what `O` was last given in the language (the latest value of that name), not read: nothing is applied here)
    const ws = w(w(WORDS) + 8 * W_O), wn = w(w(WORDS) + 8 * W_O + 4);
    let o = 0;
    for (let r = latest(w(GLOBAL)), k = 0; r && ws && k < 1 << 20; r = w(r), k++) { const hd = w(r + R_HEAD); if (w(r + R_KIND) !== VALUE || w(r + R_HOLES) || !hd || (w(r + R_FLAGS) & DEAD)) continue; if (w(hd + N_B) - w(hd + N_A) === wn && same(w(hd + N_A), ws, wn)) { o = w(r + R_BS); break; } }
    const lv = o && o !== w(NOTHING) && w(o + N_IS) === IS_NODE ? o : 0;
    if (lv === w(LEVEL_OF)) return;
    // (made where nothing lets go of it: past where any statement's memory is)
    let ln = 0;
    if (lv) { const a = xadd(HEAP, (NODE + R_PART + 15) & -16); if (a > 0 && a < w(LIMIT) - NODE - R_PART) { fill(a, 0, NODE + R_PART); const anchor = a + NODE; set(anchor + R_FLAGS, DEAD); set(anchor + R_OWNER, a); set(a + N_LAST, anchor); set(a + N_BASE, anchor); set(a + N_IS, IS_NODE); set(a + N_ALSO, lv); ln = a; } }
    put(LEVEL_OF, lv); put(LEVEL, ln);
    for (let tab = w(MEMO); tab; tab = w(tab - 8)) { for (let i = 0; i <= w(tab - 12); i++) put(tab + MEMO_ENTRY * i, 0); set(tab - 4, 0); }
    for (let tab = w(TMEMO); tab; tab = w(tab - 8)) { for (let i = 0; i <= w(tab - 12); i++) put(tab + TMEMO_ENTRY * i, 0); set(tab - 4, 0); }
    for (let i = 0; i < w(RULES_N) && i < w(RULES_CAP); i++) { const r = w(w(RULES) + 4 * i); if (r && w(r + R_BODY) && !w(r + R_FN)) put(r + R_BODY, 0); }
  }
  // (how many rules a statement may apply: as many per line of it as one line may, a long block more than a line)
  function budgeted(s: number, e: number) { let n = 1; for (let i = s; i < e && n < 20; i++) if (b(i) === 10) n++; return w(BUDGET) * n; }
  function statement(t: number, at: number, ln: number, top: number, scope: number, unread: number): number {
    if (DEBUG) debug(D_STATEMENT, at, ln, 0);
    // (its budget its own, reading it too: not what the statement this thread read before left (which thread reads it is
    // not the language's))
    set(t + T_BUDGET, budgeted(at, ln)); set(t + T_QBUDGET, 10 * budgeted(at, ln)); set(t + T_GREW, 0);
    const r = reading(t, at, ln, 0, 0, latest(scope), scope, 0, 0, 0, 0);
    if (w(r) === K_UNREAD) { if (DEBUG) debug(D_STATEMENT_END, at, ln, 0); return 0; }
    const before = latest(scope), f = frame(0, top, scope, at, ln, 0, 0, scope, scope);
    put(f + N_A, ROOT); set(t + T_BUDGET, budgeted(at, ln)); set(t + T_QBUDGET, 10 * budgeted(at, ln)); set(t + T_GREW, 0);
    ev(t, r, f, f, scope, 0, scope, scope);
    if (DEBUG) { debug(D_STATEMENT_END, at, ln, 0); if (w(t + T_GREW) > 8 << 20) debug(D_FAULT, 1096, at, w(t + T_GREW) >> 20); }
    caught(t, at);
    // (what nothing read, read again: when a rule the scope gained since has its texts written in it, one after another)
    const now = latest(scope);
    if (now !== before) for (let i = 0; i < w(unread);) {
      const us = w(unread + 4 + 8 * i), ue = w(unread + 8 + 8 * i), has = bytes(us, ue);
      let could = 0, seen = 0;
      for (let o = now; o && o !== before && !could; o = w(o), seen++) if (seen > 4096 || (!(w(o + R_MASK) & ~has) && (w(o + R_KIND) !== RULE || written(o, us, ue)))) could = 1;
      if (!could) { i++; continue; }
      if (statement(t, us, ue, top, scope, unread)) {
        const n = w(unread) - 1;
        for (let j = i; j < n; j++) { put(unread + 4 + 8 * j, w(unread + 12 + 8 * j)); put(unread + 8 + 8 * j, w(unread + 16 + 8 * j)); }
        put(unread, n);
      } else i++;
    }
    return 1;
  }
  // What was put off until everything was read (`external goto afterwards`: the tests), taken by any thread, each from where it
  // stopped. A name it reads that nothing defines is said, and the test failed (it goes on at its label `erred`); so does one
  // that said anything.
  function tests(t: number) {
    settle(t, 1);
    for (;;) {
      // (none left, and none being run that could put off more: done)
      const h = aload(AFTER_HEAD);
      if (h >= aload(AFTER_TAIL) || h >= w(AFTER_CAP)) { if (!aload(ACTIVE) && aload(AFTER_HEAD) >= aload(AFTER_TAIL)) return 0; continue; }
      // (memory for one more as well as for those running, each as much as a test may take: else wait for one to end (the first
      // is always run), not run it into memory there is not)
      const before = xadd(ACTIVE, 1);
      if (before && w(LIMIT) - aload(HEAP) + aload(POOL_BYTES) < (before + 1) * (TEST_GROWN + 2 * (1 << 20)) + 4 * TEST_GROWN) { xadd(ACTIVE, -1); continue; }
      if (acas(AFTER_HEAD, h, h + 1) !== h) { xadd(ACTIVE, -1); continue; }
      // (one that follows another is run by the thread that runs that one)
      for (let k = h; k < w(AFTER_CAP) && (k === h ? !w(w(AFTER) + AFTER_ENTRY * k + 8) : w(w(AFTER) + AFTER_ENTRY * k + 8)) && k < aload(AFTER_TAIL); k++) {
        // (what was made before it, it shadows; what it makes is its own)
        // (in memory of its own, let go of when it and what it held are done: an assert answers whether it held)
        const te = w(AFTER) + AFTER_ENTRY * k, tf = w(te), rules = region_begin(t, tf);
        isolate(t, 0);
        put(t + T_WRITER, w(te + 12)); put(t + T_WRITER_SELF, w(te + 16)); put(t + T_WRITER_S, w(te + 20)); put(t + T_WRITER_E, w(te + 24));
        test(t, tf, w(te + 4));
        put(t + T_WRITER, 0); put(t + T_WRITER_SELF, 0);
        // (what it put off, the tests written in it: here, after it, in the order written (they share what it made))
        for (let i = 0; i < w(t + T_HELD_N) && i < HELD; i++) if (w(w(t + T_HELD) + 8 * i + 4) >= 0) test(t, w(w(t + T_HELD) + 8 * i), w(w(t + T_HELD) + 8 * i + 4));
        set(t + T_HELD_N, 0);
        region_end(t, tf, rules);
        set(t + T_SH_N, 0); set(t + T_ISO, 0);
      }
      xadd(ACTIVE, -1);
    }
  }
  function test(t: number, f: number, from: number) {
    const bd = body(t, w(f + F_RULE)), said = w(t + T_SAID);
    put(f + N_A, w(f + N_A) | ROOT); set(t + T_BUDGET, w(BUDGET)); set(t + T_QBUDGET, 10 * w(BUDGET)); set(t + T_GREW, 0); set(t + T_TESTING, 1); set(t + T_ERRED, 0); put(t + T_ROOT, f);
    if (DEBUG && w(THREAD + T_QUIET)) debug(D_FAULT, 90, w(f + F_START), w(f + F_END));
    // (`RAY_ONLY=…` with --debug: a test it does not name, not run)
    if (DEBUG && debug(D_TEST, w(f + F_START), w(f + F_END), w(f + F_RULE)) === 1) { set(t + T_TESTING, 0); return; }
    ran(t, f, w(f + F_RULE), bd, from);
    if (DEBUG) debug(D_TEST_END, w(f + F_START), w(f + F_END), w(f + F_RULE));
    caught(t, w(f + F_START));
    if (w(t + T_SAID) > said && !w(t + T_ERRED)) { const er = labelled(bd, w(w(WORDS) + 8 * W_ERRED), w(w(WORDS) + 8 * W_ERRED + 4)); if (er >= 0) { ran(t, f, w(f + F_RULE), bd, er); caught(t, w(f + F_START)); } }
    // (a test that failed and said nothing of why: said, so no failure goes unexplained)
    if (w(t + T_ERRED) && !(w(t + T_SAID) > said)) say(t, w(f + F_START), L_SILENT, 0, 0);
    // (it passed when it said nothing; and not when memory ran out: what stopped it is no answer)
    const failed = w(t + T_SAID) > said || w(t + T_ERRED) || w(OOM) ? 1 : 0;
    xadd(failed ? FAILED : PASSED, 1);
    // (passed: told, what it asserted)
    if (!failed) log(w(f + F_START), L_PASSED, w(f + F_START), w(f + F_END));
    if (DEBUG) debug(D_RESULT, w(f + F_START), w(f + F_END), failed);
    set(t + T_TESTING, 0);
  }

  // Built: every rule made while the files were read, its body read now (read once, at build: what a test would read again).
  function prepared(t: number) {
    for (let k = 0; k < w(RULES_N) && k < w(RULES_CAP); k++) { const r = w(w(RULES) + 4 * k); if (r && w(r + R_KIND) === RULE && !(w(r + R_FLAGS) & DEAD) && w(r + R_BS) < w(r + R_BE)) body(t, r); }
  }

  return { prepared, begins, same, bracket, past, skip, line, apart, typed: typed_, match, read, parts, reading, ev, block, apply, head, rule_, member, valued, follow, run, tests, settle, node, frame, alloc, code, isolate };
}
