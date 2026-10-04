import { Text } from './text.ts';
import { env } from './env.ts';
import { Natives } from './natives.ts';
import { Interpreter, Node, Rule, type Native } from './interpreter.ts';

type Checkpoint = { phase: number; index: number; file: string; log: [string, string][]; eager?: [string, boolean][] };
type Index = { checkpoints: Checkpoint[] };

const root = (): string | undefined => {
  if (!env.nodejs) return undefined;
  const configured = process.env.RAY_BOOT_GRAPH;
  if (configured === 'off') return undefined;
  return configured ?? env.path.join(env.import<typeof import('os')>('os').homedir(), '.cache', 'ray-scratch', 'bootgraph');
};
const ROOT = root();
const DEBUG = env.nodejs && process.env.RAY_BOOT_DEBUG !== undefined;
const note = (...said: unknown[]) => { if (DEBUG) console.error('boot graph:', ...said); };

const hashes = new WeakMap<Text.Source, { value: string; hash: string }>();
function hash_of(text: string): string { return env.import<typeof import('crypto')>('crypto').createHash('sha1').update(text).digest('hex'); }
export function source_hash(src: Text.Source): string {
  const held = hashes.get(src);
  if (held !== undefined && held.value === src.value) return held.hash;
  const hash = hash_of(src.value);
  hashes.set(src, { value: src.value, hash });
  return hash;
}

let engine: string | undefined | null;
export function engine_hash(): string | undefined {
  if (engine !== undefined) return engine ?? undefined;
  if (typeof import.meta.dirname !== 'string') { engine = null; return undefined; }
  const { fs, path } = env;
  const files: string[] = [];
  const walk = (dir: string) => { for (const name of fs.readdirSync(dir).sort()) { const at = path.join(dir, name); if (fs.statSync(at).isDirectory()) walk(at); else if (name.endsWith('.ts')) files.push(at); } };
  walk(import.meta.dirname);
  return engine = hash_of(files.map(file => `${path.relative(import.meta.dirname, file)}\n${fs.readFileSync(file, 'utf-8')}`).join('\0'));
}

const KEPT = 16;
const SPAN = new Set(['source', 'expression', 'cursor', 'until', 'from', 'to']);
const DROPPED = new Set(['scoped', 'ruled', 'shaped', 'watchers', 'watching', 'visited', 'layout', 'heading', 'held_by', 'reached', 'fitting', 'reduced', 'inner_body', 'applications']);
let natives: Map<Native, string> | undefined;
function native_name(native: Native): string | undefined {
  if (natives === undefined) { natives = new Map(); for (const [name, held] of Object.entries(Natives)) if (!natives.has(held)) natives.set(held, name); }
  return natives.get(native);
}
const kinds = new Map<string, object>();
export function kept(made: { name: string; prototype: object }) { kinds.set(made.name, made.prototype); }
const relative = (location: string): string => env.path.isAbsolute(location) ? env.path.relative(env.root, location) : location;
const plain = (value: object) => { const proto = Object.getPrototypeOf(value); return proto === Object.prototype || proto === null; };

function encode(root: unknown, sources: Map<string, Text.Source>): unknown {
  const memo = new Map<unknown, unknown>(), queue: [any, any][] = [];
  const of = (value: any): any => {
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'function' || typeof value === 'symbol') throw new Error('a function is not kept');
      return value;
    }
    const known = memo.get(value);
    if (known !== undefined) return known;
    let shell: any;
    if (value instanceof Text.Source) shell = value.location !== undefined && sources.get(relative(value.location)) === value ? { $: 'S', l: relative(value.location) } : { $: 'V', l: value.location, v: value.value };
    else if (typeof value.fn === 'function' && typeof value.arity === 'number') {
      const name = native_name(value);
      shell = name !== undefined ? { $: 'F', n: name } : { $: 'F', r: undefined };
      if (name === undefined && value.recipe === undefined) throw new Error('a native without a recipe is not kept');
    }
    else if (value instanceof Map) shell = new Map();
    else if (value instanceof Set) shell = new Set();
    else if (Array.isArray(value)) shell = [];
    else if (value instanceof Uint8Array) shell = value;
    else if (value instanceof Node) shell = value.constructor === Node ? { $: 'N' } : { $: 'N', c: value.constructor.name };
    else if (value instanceof Rule) shell = { $: 'R' };
    else if (value instanceof Text.Node) shell = { $: 'T' };
    else if (plain(value)) shell = {};
    else throw new Error(`a ${value.constructor?.name} is not kept`);
    memo.set(value, shell);
    if (shell !== value) queue.push([value, shell]);
    return shell;
  };
  const top = of(root);
  for (let k = 0; k < queue.length; k++) {
    const [value, shell] = queue[k];
    if (shell.$ === 'S' || shell.$ === 'V') continue;
    if (shell.$ === 'F') { if (shell.n === undefined) shell.r = of(value.recipe); continue; }
    if (shell instanceof Map) { for (const [key, held] of value) shell.set(of(key), of(held)); continue; }
    if (shell instanceof Set) { for (const held of value) shell.add(of(held)); continue; }
    if (Array.isArray(shell)) { for (const held of value) shell.push(of(held)); continue; }
    if (shell.$ === 'T') {
      shell.a = [of(value.source), of(value.expression), value.cursor, value.until, value.from, value.to];
      let extra: Record<string, unknown> | undefined;
      for (const key of Object.keys(value)) {
        if (SPAN.has(key)) continue;
        const held = value[key];
        if (held === undefined || typeof held === 'function') continue;
        (extra ??= {})[key] = of(held);
      }
      if (extra !== undefined) shell.f = extra;
      continue;
    }
    const fields: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      if (DROPPED.has(key)) continue;
      const held = value[key];
      if (held === undefined) continue;
      fields[key] = of(held);
    }
    if (shell.$ === undefined) Object.assign(shell, fields);
    else shell.f = fields;
  }
  return top;
}

function decode(root: unknown, sources: Map<string, Text.Source>, it: Interpreter): any {
  const memo = new Map<unknown, unknown>(), queue: [any, any][] = [], made: [any, any][] = [];
  const of = (value: any): any => {
    if (value === null || typeof value !== 'object' || value instanceof Uint8Array) return value;
    const known = memo.get(value);
    if (known !== undefined) return known;
    let shell: any;
    if (value instanceof Map) shell = new Map();
    else if (value instanceof Set) shell = new Set();
    else if (Array.isArray(value)) shell = [];
    else switch (value.$) {
      case 'S': { shell = sources.get(value.l); if (shell === undefined) throw new Error(`${value.l} is not read`); break; }
      case 'V': { shell = new Text.Source(); if (value.l !== undefined) shell.location = value.l; shell.value = value.v; break; }
      case 'F': {
        if (value.n !== undefined) { shell = Natives[value.n]; if (shell === undefined) throw new Error(`no native ${value.n}`); break; }
        memo.set(value, shell = {});
        made.push([shell, of(value.r)]);
        return shell;
      }
      case 'N': { if (value.c === undefined) { shell = new Node(); break; } const kind = kinds.get(value.c); if (kind === undefined) throw new Error(`no kind ${value.c}`); shell = Object.create(kind); break; }
      case 'R': shell = new Rule(undefined as unknown as Rule['pattern'], undefined as unknown as Node, undefined as unknown as Text.Node, '', 0); break;
      case 'T': shell = new Text.Node(undefined as unknown as Text.Source); break;
      default: shell = {};
    }
    memo.set(value, shell);
    if (value.$ !== 'S' && value.$ !== 'V' && value.$ !== 'F') queue.push([value, shell]);
    return shell;
  };
  const top = of(root);
  for (let k = 0; k < queue.length; k++) {
    const [value, shell] = queue[k];
    if (shell instanceof Map) { for (const [key, held] of value) shell.set(of(key), of(held)); continue; }
    if (shell instanceof Set) { for (const held of value) shell.add(of(held)); continue; }
    if (Array.isArray(shell)) { for (const held of value) shell.push(of(held)); continue; }
    if (value.$ === 'T') {
      const [source, expression, cursor, until, from, to] = value.a;
      shell.source = of(source); shell.expression = of(expression); shell.cursor = cursor; shell.until = until; shell.from = from; shell.to = to;
      if (value.f !== undefined) for (const key of Object.keys(value.f)) shell[key] = of(value.f[key]);
      continue;
    }
    const fields = value.$ === undefined ? value : value.f;
    for (const key of Object.keys(fields)) shell[key] = of(fields[key]);
  }
  for (const [shell, recipe] of made) Object.assign(shell, it.rebuild(recipe));
  return top;
}

export class Boot {
  private dir: string;
  private log: [string, string][] = [];
  private eager: [string, boolean][] = [];
  private tainted = false;
  private saved = new Set<string>();
  constructor(private it: Interpreter, private mine: Text.Source[], private sources: Map<string, Text.Source>) {
    const program = it.program!;
    const key = [engine_hash(), it.constructor.name, program.serving ? 'serving' : '', program.eager === undefined ? '' : 'eager', ...mine.map(src => relative(src.location)), '|', ...program.interpreted.map(src => relative(src.location))].join('\n');
    this.dir = env.path.join(ROOT!, hash_of(key));
  }
  static of(it: Interpreter, mine: Text.Source[]): Boot | undefined {
    const program = it.program;
    if (ROOT === undefined || program === undefined || engine_hash() === undefined || mine.some(src => src.location === undefined)) return undefined;
    const sources = new Map<string, Text.Source>();
    for (const src of [...program.sources, ...program.interpreted, ...mine]) if (src.location !== undefined && src.loaded) sources.set(relative(src.location), src);
    return new Boot(it, mine, sources);
  }
  read(src: Text.Source) {
    if (src.location === undefined || !this.sources.has(relative(src.location))) { note('unknown source', src.location); this.tainted = true; return; }
    if (this.it.painting(src)) this.tainted = true;
    this.log.push([relative(src.location), source_hash(src)]);
  }
  decided(src: Text.Source, eager: boolean) { this.eager.push([relative(src.location), eager]); }
  private index(): Index {
    try { return JSON.parse(env.fs.readFileSync(env.path.join(this.dir, 'index.json'), 'utf-8')); } catch { return { checkpoints: [] }; }
  }
  private valid(checkpoint: Checkpoint): boolean {
    for (const [location, hash] of checkpoint.log) {
      const src = this.sources.get(location);
      if (src === undefined || source_hash(src) !== hash || this.it.painting(src)) { note('stale', location, src === undefined ? 'missing' : source_hash(src) !== hash ? 'changed' : 'painted'); return false; }
    }
    const eager = this.it.program?.eager;
    for (const [location, decided] of checkpoint.eager ?? []) {
      const src = this.sources.get(location);
      if (src === undefined || (src.is_entrypoint || eager === undefined || eager(src)) !== decided) return false;
    }
    return true;
  }
  restore(): { phase: number; index: number } {
    const fresh = { phase: 0, index: -1 };
    const checkpoints = this.index().checkpoints.sort((a, b) => b.phase - a.phase || b.index - a.index);
    for (const checkpoint of checkpoints) {
      if (!this.valid(checkpoint)) continue;
      let state: any;
      try { state = decode(env.import<typeof import('v8')>('v8').deserialize(env.fs.readFileSync(env.path.join(this.dir, checkpoint.file))), this.sources, this.it); }
      catch (error) { note('not restored', error); continue; }
      this.it.restore_state(state, this.mine);
      this.log = [...checkpoint.log];
      this.eager = [...(checkpoint.eager ?? [])];
      for (const c of checkpoints) this.saved.add(c.file);
      return { phase: checkpoint.phase, index: checkpoint.index };
    }
    return fresh;
  }
  save(phase: number, index: number) {
    const file = `${phase}-${index}-${hash_of(JSON.stringify(this.log))}.bin`;
    if (this.tainted || this.saved.has(file)) return;
    this.saved.add(file);
    let bytes: Buffer;
    try { bytes = env.import<typeof import('v8')>('v8').serialize(encode(this.it.saved_state(this.mine), this.sources)); }
    catch (error) { note('not saved', error); this.tainted = true; return; }
    const { fs, path } = env;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const temporary = path.join(this.dir, `${file}.${process.pid}`);
      fs.writeFileSync(temporary, bytes);
      fs.renameSync(temporary, path.join(this.dir, file));
      const listed = this.index();
      listed.checkpoints = listed.checkpoints.filter(c => c.file !== file);
      listed.checkpoints.push({ phase, index, file, log: [...this.log], eager: [...this.eager] });
      while (listed.checkpoints.length > KEPT) { const dropped = listed.checkpoints.shift()!; try { fs.unlinkSync(path.join(this.dir, dropped.file)); } catch {} }
      const listing = path.join(this.dir, `index.json.${process.pid}`);
      fs.writeFileSync(listing, JSON.stringify(listed));
      fs.renameSync(listing, path.join(this.dir, 'index.json'));
    } catch (error) { note('not written', error); this.tainted = true; }
  }
}
