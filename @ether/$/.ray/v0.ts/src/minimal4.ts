// Capture methods up to precedence
// Info message if a method on @ is used as a direct .; Mute with X.
// Bundle all the .ray files in a single .ray file.
// Support older versions of Node
// Dependency which alters Language workings; prompt: Do you want to apply those language changes too.
// support relative paths

const version: [major: number, releaseDate: string, index: number] =
               [0, '2027-01-01', 1];

const cli: CLI.Spec = {
  help:     { alias: 'h', description: 'Print this help and exit.' },
  version:  { description: 'Print the version number.' },
  abstract: { alias: 'n', description: 'Abstractly interpret (analyze) instead of executing.' },
  debug:    { alias: 'd', description: 'Enable the debugger and debug-level logging.' },
};

async function main([args, kwargs]: CLI.Args) {
  if (kwargs.version) return console.log(env.version.toString())
  if ((args.length === 0 && !kwargs.abstract) || kwargs.help) { console.log(CLI.help(cli)); return; }

  const diagnostics = new Diagnostics();
  await Ray.v0(diagnostics).abstract(!!kwargs.abstract).add(args.flatMap(x => env.at(x))).exec()

  if (env.nodejs && diagnostics.has_errors) process.exitCode = 1;

  diagnostics.print();
}

namespace Global {
  export abstract class Node {
    abstract source: Source
  }
  export abstract class Source {
    location: string
    constructor(public relative_location?: string) { if (relative_location !== undefined) this.location = env.nodejs ? env.path.join(env.root, relative_location) : new URL('../' + relative_location, import.meta.url).href }
    abstract load(): Promise<void>

    get dir() { return this.location.slice(0, this.location.lastIndexOf('/')); }
    get is_dot_project() { return this.location.endsWith(`/.project${Ray.EXTENSION}`); }
  }
}
export type Node = Global.Node;
export type Source = Global.Source;

export namespace Text {
  export class Node extends Global.Node {
    constructor(public source: Text.Source) { super(); }

    cursor: number = 0;
    selection: number[] = [];

    color?: string
    style?: string
    of?: string

    get file(): string | undefined { return this.source.location; }

    get begin() { return this.selection.length > 0 ? this.selection[0] : this.cursor; }
    set begin(location: number) {
      if (this.selection.length > 0) { this.selection[0] = location; }
      else { this.selection.push(location, this.cursor!); }
    }
    get end() {
      const len = this.selection.length;
      return len > 0 ? this.selection[len - 1] : this.cursor;
    }
    set end(location: number) {
      const len = this.selection.length;
      if (len > 0) { this.selection[len - 1] = location; }
      else { this.selection.push(this.cursor!, location); }
    }

    get line(): number {
      if (this.cursor != null) return this.source.lineOf(this);
      return 1;
    }
    get col(): number {
      if (this.cursor != null) return this.source.colOf(this);
      return 1;
    }

    empty() { return this.selection.length === 0; }
    get string() {
      return this.empty() ? '' : this.source.value.slice(this.begin!, this.end! + 1);
    }

    get ranges(): { begin: number; end: number }[] {
      if (this.selection.length === 0) return [{ begin: this.cursor!, end: this.cursor! }];
      const out: { begin: number; end: number }[] = [];
      for (let i = 0; i < this.selection.length; i += 2) out.push({ begin: this.selection[i], end: this.selection[i + 1] });
      return out;
    }
    get segments(): Text.Node[] {
      return this.ranges.map(r => {
        const n = new Node(this.source);
        n.color = this.color;
        n.selection = [r.begin, r.end];
        return n;
      });
    }
  }
  export class Source extends Global.Source {
    private _value: string; get value(): string { if (this._value === undefined) { throw new Error(`Source '${this.location ?? ''}' not loaded — call 'await source.load()' first.`); } return this._value; }
    set value(value: string) { this._value = value; }
    get text(): string { return this.value; }
    get path(): string | undefined { return this.location; }

    async load(): Promise<void> {
      if (this._value !== undefined) return;
      if (!this.location) throw new Error('Source has neither value nor location.');

      this.value = env.nodejs 
        ? await env.fs.promises.readFile(this.location, 'utf-8')
        : await (await fetch(new URL(this.location))).text()
    }

    private _newlines?: number[];
    get newlines(): number[] {
      if (this._newlines) return this._newlines;
      const arr: number[] = [];
      const s = this.value;
      for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) arr.push(i);
      return this._newlines = arr;
    }

    lineOf(position: Node): number {
      const cursor = position.cursor ?? 0;
      const nls = this.newlines;
      let lo = 0, hi = nls.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (nls[mid] < cursor) lo = mid + 1;
        else hi = mid;
      }
      return lo + 1;
    }

    colOf(position: Node): number {
      const cursor = position.cursor ?? 0;
      const nls = this.newlines;
      let lo = 0, hi = nls.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (nls[mid] < cursor) lo = mid + 1;
        else hi = mid;
      }
      return lo === 0 ? cursor + 1 : cursor - nls[lo - 1];
    }

    line(lineNo: number): Node {
      const nls = this.newlines;
      const begin = lineNo === 0 ? 0 : nls[lineNo - 1] + 1;
      const end = nls[lineNo] ?? this.value.length;
      const n = new Node(this);
      if (end > begin) n.selection = [begin, end - 1];
      else n.cursor = begin;
      return n;
    }

    get lines(): Iterable<[Node, number]> {
      const self = this, count = this.newlines.length + 1;
      return (function* () { for (let i = 0; i < count; i++) yield [self.line(i), i]; })();
    }
  }
}

export type Painted = Text.Node;

export namespace Ray {
  export const EXTENSION = '.ray'

  export async function load_file(location: string): Promise<Source> { const s = new Text.Source(location); await s.load(); return s; }
  export async function load_project(location: string): Promise<Source[]> { return env.directory(location, { recursively: true, filter: x => x.endsWith(EXTENSION) }); }

  export function source(location: string, value: string): Source { const s = new Text.Source(); s.location = location; s.value = value; return s; }

  export function lsp(diagnostics: Diagnostics): Program {
    return new Program(diagnostics, () => {})
      .add(env.directory(`@ether/$/${EXTENSION}/v0`, { recursively: true, filter: x => x.endsWith(EXTENSION) }));
  }

  export function v0(diagnostics: Diagnostics) {
    return new Program(diagnostics, () => {})
      .add(env.directory(`@ether/$/${EXTENSION}/v0`, { recursively: true, filter: x => x.endsWith(EXTENSION) }))
      // .add(env.directory(`@ether/$/${EXTENSION}/tests`, { recursively: true, filter: x => x.endsWith(EXTENSION) }));
  }

  export class Project {
    source: Source[] = []
    dependencies: Project[] = []

    interpreters: Map<Project, Interpreter> = new Map();

    constructor(private program: Program, public dot_project: Source, interpreter: Interpreter) { this.interpreters.set(this, interpreter); }
    get directory(): string { return this.dot_project.dir; }

    get is_language() { return (this.dot_project as Text.Source).line(0).string.includes('!language'); }
    
    get interpreter() { return this.interpreters.get(this); }
    get dependants() { return this.interpreters.keys().filter(x => x !== this); }

    dependent_on(project: Project) {
      if (this === project) return;
      this.dependencies.push(project);
      project.interpreters.set(this, this.interpreter.copy())
    }
  }

  export class Program {

    projects: Project[] = []
    default_language: Project

    // the flat source list (what derive reads) is just project membership
    get sources(): Source[] {
      const seen = new Set<Source>(), out: Source[] = [];
      for (const project of this.projects) for (const s of [project.dot_project, ...project.source])
        if (!seen.has(s)) { seen.add(s); out.push(s); }
      return out;
    }
    reloaded: (src: Source) => void = () => {};
    active = new Set<string>();
    get abstract_blocks(): boolean { return this.abstractly; }

    get highlighting(): Map<string, Text.Node[]> {
      const out = new Map<string, Text.Node[]>();
      for (const map of this.diagnostics.expressions.values())
        for (const e of map.values())
          for (const node of e.nodes) {
            const path = node.source.path;
            if (path === undefined) continue;
            const lazy = (node as { lazy?: () => string | undefined }).lazy;   // resolve deferred decorator styles now that the fixpoint has converged
            if (lazy) { const s = lazy(); if (s === undefined) continue; node.style = s; node.color = theme[s.split('.')[0]]; }
            let arr = out.get(path); if (!arr) out.set(path, arr = []);
            arr.push(node);
          }
      return out;
    }
    get groups(): string[] {
      const h = this.engine.classes.get('H');
      return h?.methods ? [...h.methods.keys()].filter((k): k is string => typeof k === 'string') : [];
    }
    private generation = 0;
    private settling?: ReturnType<typeof setTimeout>;
    private cycling: Promise<void> = Promise.resolve();

    private feedback(touched: Source[]): void {
      if (touched.length) void this.interpret(touched);
    }

    private async interpret(srcs: Source[], generation?: number): Promise<boolean | undefined> {
      const ip = this.engine;
      ip.abstract_blocks = this.abstract_blocks;
      externals(ip);
      this.diagnostics.forget(undefined);
      for (const src of srcs) {
        if (src instanceof Text.Source) ip.parse(src);
        if (generation !== undefined) {
          await new Promise<void>(resolve => typeof setImmediate === 'function' ? setImmediate(resolve) : setTimeout(resolve, 0));
          if (this.generation !== generation) return undefined;
        }
      }
      const moved = ip.analyze();
      const set = new Set(srcs);
      for (const issue of ip.issues)
        if (!issue.at?.src || set.has(issue.at.src)) ip.error(issue.message, issue.at);
      for (const src of srcs) this.reloaded(src);
      return moved;
    }
    private schedule(): void {
      const g = this.generation;
      const run = () => { this.cycling = this.cycling.then(() => this.generation === g ? this.rederive(g) : Promise.resolve()); };
      if (typeof setTimeout !== 'function') { run(); return; }
      clearTimeout(this.settling);
      this.settling = setTimeout(run, 300);
    }

    reload(next: Source | Node | Iterable<Source | Node>): void {
      const items: (Source | Node)[] = (next instanceof Node || !((next as any)?.[Symbol.iterator])) ? [next as Source] : [...(next as Iterable<Source | Node>)];
      const touched = items.map(item => item instanceof Node ? item.src : item).filter((src): src is Source => src instanceof Text.Source);
      this.add(touched);
      this.generation++;
      this.survey(this.sources);
      this.feedback(touched);
      this.schedule();
    }
    reroot(roots: string[]): void {
      this.roots = roots;
      this.membership = new WeakMap();
      this._closures.clear();
      this.engine.evict();
      if (this.sources.some(s => !this.language(s))) { this.generation++; this.schedule(); }
    }
    remove(path: string): void {
      for (const project of this.projects) {
        const at = project.source.findIndex(s => s.path === path);
        if (at < 0) continue;
        const removed = project.source[at]; project.source.splice(at, 1);
        this.diagnostics.forget(removed); this.reloaded(removed); break;
      }
      this.generation++;
      this.schedule();
    }

    get engine(): Interpreter { return this.default_language.interpreter!; }
    constructor(public diagnostics: Diagnostics, public initialize_interpreter: (interpreter: Interpreter) => void) { diagnostics.program = this; }

    project_of(src: Source): Project | undefined {
      if (src.location === undefined) return undefined;
      let best: Project | undefined;
      for (const project of this.projects)
        if ((src.location === project.directory || src.location.startsWith(`${project.directory}/`)) && (best === undefined || project.directory.length > best.directory.length)) best = project;
      return best;
    }
    project_header(src: Source): string | undefined {
      const project = this.project_of(src);
      return project && (project.source.includes(project.dot_project) ? project.dot_project.location : project.directory);
    }

    abstractly: boolean = false;
    abstract(abstractly?: boolean): this { this.abstractly = abstractly ?? true; return this; }

    add(srcs: Source[]): this {
      const claims = [...this.projects.flatMap(project => project.source), ...srcs].filter(x => x.is_dot_project).map(x => x.dir);
      const project_directory_of = (src: Source): string => {
        let best: string | undefined;
        for (const c of claims) if (src.location.startsWith(`${c}/`) && (best === undefined || c.length > best.length)) best = c;
        return best ?? src.dir;
      };
      
      const home = (src: Source): void => {
        const directory = project_directory_of(src);
        let project = this.projects.find(project => project.directory === directory);
        if (!project) {
          const interpreter = new Interpreter(this, this.diagnostics); this.initialize_interpreter(interpreter)
          const dot = src.is_dot_project ? src : source(`${directory}/.project${EXTENSION}`, '');
          this.projects.push(project = new Project(this, dot, interpreter));
        }
        if (src.is_dot_project) project.dot_project = src;
        const existing = project.source.findIndex(s => s.location === src.location);
        if (existing >= 0) project.source[existing] = src; else project.source.push(src);
      };
      
      for (const src of srcs) home(src);
      
      if (srcs.some(x => x.is_dot_project)) {
        for (const project of [...this.projects]) for (const src of [...project.source])
          if (project_directory_of(src) !== project.directory) { project.source.splice(project.source.indexOf(src), 1); home(src); }
        this.projects = this.projects.filter(project => project.source.length > 0);
      }
      return this;
    }
    
    private async derive(generation?: number): Promise<Interpreter | undefined> {
      const order = [...this.sources]
        .filter(s => !s.path?.endsWith(`/.project${EXTENSION}`))
        .sort((a, b) => (this.language(a) ? 0 : 1) - (this.language(b) ? 0 : 1));
      this.engine.issues = [];
      this.engine.clear();
      for (let i = 0; i < 6; i++) {
        const size = this.engine.rules.size;
        this.engine.reset();
        const moved = await this.interpret(order, generation);
        if (moved === undefined) return undefined;
        let probing = false;
        for (const rule of this.engine.rules.values()) {
          if (rule.disabled || rule.exists) continue;
          const contingent = rule.definitions.some(d =>
            d.seen instanceof Rule && !d.seen.disabled && !d.seen.definitions.some(x => x.seen === 'live'));
          if (contingent) { rule.exists = true; probing = true; }
        }
        if (!moved && !probing && this.engine.rules.size === size) break;
      }
      for (const project of this.projects)
        project.interpreters.set(project, project === this.default_language ? this.engine : this.engine.copy());
      return this.engine;
    }

    private async rederive(generation?: number): Promise<void> {
      this.survey(this.sources);
      this.diagnostics.items.clear();
      const ip = await this.derive(generation);
      if (!ip) return;
      if (![...this.engine.rules.values()].some(r => r.name === 'rule-definition' && r.project === undefined))
        ip.error(`'${this.language_project ?? 'language project'}' did not declare the grammar-rule definition rule.`);
    }

    async exec(): Promise<Node> {
      await Promise.all(this.sources.map(s => s.load()));

      this.default_language = this.projects.find(project => project.is_language)!;
      if (!this.default_language) return this.diagnostics.report({ level: 'fatal', message: "Expected to have recognized the string !language (the project defining the default language) on the first line in a .project.ray file, but it wasn't provided." }) as unknown as Node;

      const seed = new Text.Source(); seed.value = '{(String.Word | `{`, expr, `}`)[]}=>{body}';
      this.survey(this.sources);
      this.engine.register(span(seed, 0, seed.value.length), [], 'Node', this.language_project);

      await this.rederive();
      return this.default_language.interpreter!.GLOBAL;
    }


    language_project?: string;

    language(src: Source): boolean { return this.project(src) === this.language_project; }


    // ── projects ──

    roots: string[] = [];
    private claims: string[] = [];
    private membership = new WeakMap<Source, string>();

    dependencies = new Map<string, Set<string>>();
    private _closures = new Map<string, Set<string>>();

    closure(project: string): Set<string> {
      let out = this._closures.get(project);
      if (out) return out;
      out = new Set();
      const visit = (q: string): void => {
        if (out!.has(q)) return;
        out!.add(q);
        for (const d of this.dependencies.get(q) ?? []) visit(d);
        if (this.language_project !== undefined && q !== this.language_project) visit(this.language_project);
      };
      visit(project);
      this._closures.set(project, out);
      return out;
    }

    survey(sources: Source[]): boolean {
      const markers = sources.filter(s => s.path !== undefined && s.path.endsWith(`/.project${EXTENSION}`));
      const dir = (s: Source) => s.path!.slice(0, s.path!.lastIndexOf('/'));
      const claims = markers.map(dir).sort();
      const language = markers.find(s => s.text.trim().replace(/`/g, '').startsWith('!language'));
      const language_project = language ? dir(language) : undefined;
      if (claims.join('\n') === this.claims.join('\n') && language_project === this.language_project) return false;
      this.claims = claims;
      this.language_project = language_project;
      this.membership = new WeakMap();
      this._closures.clear();
      this.engine.evict();
      return true;
    }


    project(src: Source): string {
      const path = src.path;
      if (path === undefined) return '';
      let found = this.membership.get(src);
      if (found === undefined) {
        const within = (dirs: string[]): string | undefined => {
          let best: string | undefined;
          for (const dir of dirs) if (path.startsWith(dir + '/') && (best === undefined || dir.length > best.length)) best = dir;
          return best;
        };
        found = within(this.claims) ?? within(this.roots) ?? path.slice(0, path.lastIndexOf('/'));
        this.membership.set(src, found);
      }
      return found;
    }

  }

  // ─────────────────────────── interpreter ───────────────────────────

  interface Reading {
    sign?: 1 | -1;
    indent?: number;
    forwards?: boolean;
  }

  interface Found { rule: Rule; m: Matched }

  interface Candidate extends Found { level: number; rank: number }
  function prefers(a: Candidate, b: Candidate | null): boolean {
    if (!b) return true;
    if (a.rule.comment !== b.rule.comment) return a.rule.comment;
    const la = a.m.end - a.m.begin, lb = b.m.end - b.m.begin;
    if (la !== lb) return la > lb;
    if (a.rule.anchored !== b.rule.anchored) return a.rule.anchored;
    if (a.rank !== b.rank) return a.rank < b.rank;
    return a.level < b.level;
  }

  export type Key = string | Node
  export type Args = { interpreter: Interpreter; self?: Node; method: Node; args: Node; at: Node; match?: Match; recognized?: Recognized }
  export type Method = (args: Args) => Node | undefined;

  export type Role =
    | { kind: 'forward'; name: string; on: Node }
    | { kind: 'slot'; on: Node; key: Key }
    | { kind: 'bound'; self: Node; method: Node };

  export class Node {
    methods?: Map<Key, Node>
    fn?: Method
    flags?: Set<string>
    position?: Text.Node
    role?: Role
    consumed = false
    references?: Node[]

    constructor(public _super?: Node) {}

    reference(at: Node): void {
      (this.references ??= []);
      if (!this.references.some(r => r.src?.path === at.src?.path && r.begin === at.begin)) this.references.push(at);
    }

    method(key: Key, fn?: Method, ...flags: string[]): Node {
      const node = new Node(this);
      node.fn = fn;
      for (const f of flags) node.flag(f);
      this.set(key, node);
      return node;
    }
    set(key: Key, value: Node): void { (this.methods ??= new Map()).set(key, value); if (key instanceof Rule) { this._rules = undefined; this._dispatch = undefined; } }
    private _rules?: Rule[];
    get ruleset(): readonly Rule[] { return this._rules ??= this.methods ? [...this.methods.keys()].filter((k): k is Rule => k instanceof Rule) : []; }
    get(key: Key): Node | undefined { return this.methods?.get(key); }
    delete(key: Key): void { this.methods?.delete(key); if (key instanceof Rule) { this._rules = undefined; this._dispatch = undefined; } }
    flag(name: string): this { (this.flags ??= new Set()).add(name); return this; }
    has_flag(name: string): boolean { return !!this.flags?.has(name); }
    get sup(): Node | undefined { return this._super; }
    set sup(v: Node | undefined) { this._super = v; }

    // ── structure: super chain, member lookup, slot dereference, identity ──
    *chain(): Generator<Node> {
      const seen = new Set<Node>();
      for (let n: Node | undefined = this; n && !seen.has(n); n = n.sup) { seen.add(n); yield n; }
    }
    resolve_on(key: Key): Node | undefined {
      for (const node of this.chain()) { const found = node.get(key); if (found) return found; }
      return undefined;
    }
    deref(): Node {
      const seen = new Set<Node>();
      let n: Node = this;
      while (n.role?.kind === 'slot' && !seen.has(n)) {
        seen.add(n);
        const found = n.role.on.resolve_on(n.role.key);
        if (!found || found === n) break;
        n = found;
      }
      return n;
    }
    private static IDS = 0;
    private _id?: number;
    get id(): number { return this._id ??= ++Node.IDS; }

    get src(): Source | undefined { return this.position?.source; }
    set src(s: Source | undefined) { if (this.position) this.position.source = s as Text.Source; else this.position = new Text.Node(s as Text.Source); }
    get begin(): number { const p = this.position; return p ? (p.selection.length ? p.selection[0] : p.cursor) : 0; }
    set begin(v: number) { this.setspan(v, this.end); }
    get end(): number { const p = this.position; return p ? (p.selection.length ? p.selection[p.selection.length - 1] + 1 : p.cursor) : 0; }
    set end(v: number) { this.setspan(this.begin, v); }
    private setspan(b: number, e: number): void {
      const p = this.position ??= new Text.Node(undefined as unknown as Text.Source);
      p.cursor = b;
      if (e > b) { if (p.selection.length === 2) { p.selection[0] = b; p.selection[1] = e - 1; } else p.selection = [b, e - 1]; }
      else if (p.selection.length) p.selection.length = 0;
    }
    get text(): string { return this.position?.string ?? ''; }
    get empty(): boolean { return this.end <= this.begin; }

    // ── walking through text (direction is cursor state) ──
    sign: 1 | -1 = 1;
    ip!: Interpreter;
    head(): number { return this.sign === 1 ? this.begin : this.end - 1; }
    done(): boolean { return this.begin >= this.end; }
    at(offset = 0): string | undefined { return (this.src as Source | undefined)?.text[this.head() + offset * this.sign]; }
    behind(offset = 1): string | undefined { return (this.src as Source | undefined)?.text[this.head() - offset * this.sign]; }
    take(n = 1): void { if (this.sign === 1) this.begin += n; else this.end -= n; }
    cut(edge: number): void { if (this.sign === 1) this.begin = edge; else this.end = edge; }

    // ── the scope's delimiter view (was the Scan object), cached on the scope node ──
    _view?: { epoch: number; version: number; src: Source; signs: Map<1 | -1, View> };
    private viewer(): View {
      const ip = this.ip, src = this.src!, sign = this.sign, top = ip.scope();
      let c = top._view;
      if (!c || c.epoch !== ip.scope_epoch || c.version !== ip.rules_version || c.src !== src)
        top._view = c = { epoch: ip.scope_epoch, version: ip.rules_version, src, signs: new Map() };
      let v = c.signs.get(sign);
      if (v) return v;
      const claimable = new Map<string, Rule[]>();
      const edges = new Set<string>();   // every anchored rule's edge char is a word boundary
      for (const node of ip.lookup())
        for (const rule of node.ruleset) {
          if (!rule.anchored || (rule.project !== undefined && rule.project !== ip.program.project(src))) continue;
          const ch = rule.edge_char(sign)!;
          if (!rule.delimited) { if (node === ip.BASE) edges.add(ch); continue; }   // only BASE-level operators are word boundaries
          let bucket = claimable.get(ch);
          if (!bucket) claimable.set(ch, bucket = []);
          if (!bucket.includes(rule)) bucket.push(rule);
        }
      c.signs.set(sign, v = { anchors: new Set(claimable.keys()), edges, claimable, memo: new Map() });
      return v;
    }
    get anchors(): Set<string> { return this.viewer().anchors; }
    get edges(): Set<string> { return this.viewer().edges; }
    claim(at: number): number {
      const v = this.viewer(), ip = this.ip, text = this.src!.text;
      const candidates = v.claimable.get(text[at]);
      if (!candidates) return -1;
      if (!candidates.some(rule => this.lit_at(at, rule.edge(this.sign)!))) return -1;
      if (ip.scan_depth > 64) return -1;
      const hit = v.memo.get(at);
      if (hit !== undefined) return hit;
      ip.scan_depth++;
      try {
        let best = -1;
        for (const rule of candidates) {
          if (!ip.visible(rule, this.src!)) continue;
          const m = this.match(rule, at);
          if (!m) continue;
          const far = this.sign === 1 ? m.end - 1 : m.begin;
          if (best === -1 || far * this.sign > best * this.sign) best = far;
        }
        v.memo.set(at, best);
        return best;
      } finally { ip.scan_depth--; }
    }
    literal_of(begin: number, end: number): { text: string; by: Rule } | undefined {
      const v = this.viewer(), text = this.src!.text;
      const candidates = v.claimable.get(text[begin]);
      if (!candidates) return undefined;
      for (const rule of candidates) {
        if (!rule.body || !this.ip.visible(rule, this.src!)) continue;
        const captures = rule.pieces.filter(p => !is_literal(p)) as Capture[];
        if (captures.length !== 1 || !captures[0].name || rule.body.text.trim() !== captures[0].name) continue;
        const m = this.match(rule, begin);
        if (!m || m.end !== end) continue;
        const cap = m.captures.find(c => c.piece === captures[0]);
        return { text: cap ? text.slice(cap.begin, cap.end) : '', by: rule };
      }
      return undefined;
    }

    // ── boundary finders (were the free scan_* functions) ──
    lit_at(j: number, lit: string): boolean {
      const text = this.src!.text;
      if (text[j] !== near(this.sign, lit)) return false;
      if (lit.length === 1) return true;
      const begin = this.sign === 1 ? j : j - lit.length + 1;
      return begin >= 0 && text.startsWith(lit, begin);
    }
    until(from: number, lit: string, capture?: Capture): number {
      const text = this.src!.text, sign = this.sign, v = this.viewer();
      const multiline = capture !== undefined;
      if (capture?.raw) {
        const k = sign === 1 ? text.indexOf(lit, from) : text.lastIndexOf(lit, from - lit.length + 1);
        if (k === -1) return -1;
        const head = sign === 1 ? k : k + lit.length - 1;
        if (!multiline) {
          const nl = sign === 1 ? text.indexOf('\n', from) : text.lastIndexOf('\n', from);
          if (nl !== -1 && (head - nl) * sign > 0) return -1;
        }
        return head;
      }
      const c0 = near(sign, lit);
      let j = from;
      while (j >= 0 && j < text.length) {
        const c = text[j];
        if (c === c0 && this.lit_at(j, lit)) return j;
        if (c === '\n' && !multiline) return -1;
        if (v.anchors.has(c)) { const far = this.claim(j); if (far !== -1) { j = far + sign; continue; } }
        j += sign;
        while (j >= 0 && j < text.length && text[j] !== c0 && text[j] !== '\n' && !v.anchors.has(text[j])) j += sign;
      }
      return -1;
    }
    group(j: number): number { const k = this.until(j + 1, '}'); return k === -1 ? -1 : k + 1; }
    block(at: number, indent: number): number {
      const text = this.src!.text;
      let end = at, j = at;
      while (j < text.length && text[j] === '\n') {
        let k = j + 1, spaces = 0;
        while (text[k] === ' ') { k++; spaces++; }
        if (k >= text.length) break;
        if (text[k] === '\n') { j = k; continue; }
        if (spaces <= indent) break;
        end = this.line_end(k);
        j = end;
      }
      return end;
    }
    expression(from: number): number {
      const text = this.src!.text, sign = this.sign, v = this.viewer();
      let j = from;
      while (j >= 0 && j < text.length) {
        const c = text[j];
        if (c === '\n') break;
        if (v.anchors.has(c)) { const far = this.claim(j); if (far !== -1) { j = far + sign; continue; } }
        j += sign;
        while (j >= 0 && j < text.length && text[j] !== '\n' && !v.anchors.has(text[j])) j += sign;
      }
      return j;
    }
    word(from: number): number {
      const text = this.src!.text, sign = this.sign, v = this.viewer();
      let j = from;
      while (j >= 0 && j < text.length) {
        const c = text[j];
        if (c === ' ' || c === '\n') break;
        if (v.anchors.has(c) && this.claim(j) !== -1) break;
        if (j !== from && v.edges.has(c)) break;   // an operator-edged rule (the `.` rule, `*`, …) ends a word
        j += sign;
      }
      return j;
    }
    line_end(i: number): number { const text = this.src!.text; const nl = text.indexOf('\n', i); return nl === -1 ? text.length : nl; }
    line_begin(i: number): number { return this.src!.text.lastIndexOf('\n', i - 1) + 1; }
    indent(i: number): number {
      const text = this.src!.text, line = text.lastIndexOf('\n', i - 1) + 1;
      let n = 0; while (text[line + n] === ' ') n++;
      return n;
    }
    match(rule: Rule, at: number, indent?: number): Matched | null {
      if (!rule.edge(this.sign)) return null;
      const text = this.src!.text, sign = this.sign, pieces = rule.pieces;
      let i = at;
      const captures: Matched['captures'] = [];
      for (let p = 0; p < pieces.length; p++) {
        const idx = sign === 1 ? p : pieces.length - 1 - p;
        const piece = pieces[idx];
        if (is_literal(piece)) {
          if (!this.lit_at(i, piece.text)) return null;
          i += piece.text.length * sign;
          continue;
        }
        const entry = i;
        switch (piece.kind) {
          case 'until': {
            const bound = pieces[idx + sign];
            if (!bound || !is_literal(bound)) return null;
            const k = this.until(i, bound.text, piece);
            if (k === -1) return null;
            i = k;
            break;
          }
          case 'block':
            if (sign === -1) return null;
            i = this.block(this.line_end(i), indent ?? this.indent(at));
            break;
          case 'text':
            i = sign === 1 ? this.line_end(i) : this.line_begin(i + 1) - 1;
            break;
          case 'expression':
            i = this.expression(i);
            break;
          case 'word':
            i = this.word(i);
            if (i === entry) return null;
            break;
        }
        captures.push(sign === 1 ? { piece, begin: entry, end: i } : { piece, begin: i + 1, end: entry + 1 });
      }
      if (i === at) return null;
      return sign === 1 ? { begin: at, end: i, captures } : { begin: i + 1, end: at + 1, captures };
    }

    // ── dispatch + name buckets (were the dispatch_of / names_at WeakMaps) ──
    _dispatch?: Dispatch;
    get dispatch(): Dispatch {
      let d = this._dispatch;
      const rules = this.ruleset;
      if (!d || d.count !== rules.length) {
        d = this._dispatch = { count: rules.length, keyed: [new Map(), new Map()], unkeyed: [[], []] };
        for (const rule of rules) for (const s of [1, -1] as const) {
          const edge = rule.edge_char(s);
          if (edge !== undefined) { const map = d.keyed[s === 1 ? 0 : 1]; let list = map.get(edge); if (!list) map.set(edge, list = []); list.push(rule); }
          else if (s === 1 && rule.matcher) d.unkeyed[0].push(rule);
        }
      }
      return d;
    }
    _buckets?: { count: number; names: [Map<string, NameBucket>, Map<string, NameBucket>] };
    names(c: string, sign: 1 | -1): NameBucket | undefined {
      let b = this._buckets;
      if (!b) b = this._buckets = { count: 0, names: [new Map(), new Map()] };
      const size = this.methods?.size ?? 0;
      if (b.count !== size && this.methods) {
        let i = 0;
        for (const key of this.methods.keys()) {
          if (i++ < b.count) continue;
          if (typeof key !== 'string') continue;
          for (const s of [1, -1] as const) {
            const map = b.names[s === 1 ? 0 : 1];
            const n = near(s, key);
            let bucket = map.get(n);
            if (!bucket) map.set(n, bucket = { lengths: [], sets: new Map() });
            let set = bucket.sets.get(key.length);
            if (!set) {
              bucket.sets.set(key.length, set = new Set());
              let at = 0;
              while (at < bucket.lengths.length && bucket.lengths[at] > key.length) at++;
              bucket.lengths.splice(at, 0, key.length);
            }
            set.add(key);
          }
        }
        b.count = size;
      }
      return b.names[sign === 1 ? 0 : 1].get(c);
    }
    name_at(cursor: Node, at: number, floor: number): string | null {
      const text = cursor.src!.text, sign = cursor.sign;
      const bucket = this.names(text[at], sign);
      if (!bucket) return null;
      let best: string | null = null;
      for (const length of bucket.lengths) {
        if (length <= floor || (best !== null && length <= best.length)) break;
        const begin = sign === 1 ? at : at - length + 1;
        if (begin < 0 || begin + length > text.length) continue;
        const key = text.slice(begin, begin + length);
        if (!bucket.sets.get(length)!.has(key)) continue;
        const far = sign === 1 ? at + length : begin - 1;
        if (/\w/.test(near(-sign as 1 | -1, key)) && /\w/.test(text[far] ?? '')) continue;
        best = key;
      }
      return best;
    }


    clone(seen: Map<Node, Node> = new Map()): Node {
      const existing = seen.get(this); if (existing) return existing;
      const copy: Node = Object.create(Object.getPrototypeOf(this));
      seen.set(this, copy);
      copy._super = this._super?.clone(seen);
      copy.fn = this.fn;
      copy.position = this.position;
      copy.consumed = this.consumed;
      if (this.flags) copy.flags = new Set(this.flags);
      if (this.methods) {
        copy.methods = new Map();
        for (const [key, value] of this.methods)
          copy.methods.set(key instanceof Node ? key.clone(seen) : key, value.clone(seen));
      }
      const r = this.role;
      if (r) copy.role =
        r.kind === 'forward' ? { kind: 'forward', name: r.name, on: r.on.clone(seen) }
        : r.kind === 'slot' ? { kind: 'slot', on: r.on.clone(seen), key: r.key instanceof Node ? r.key.clone(seen) : r.key }
        : { kind: 'bound', self: r.self.clone(seen), method: r.method.clone(seen) };
      return copy;
    }
  }

  function span(src: Source, begin: number, end: number, sup?: Node): Node {
    const node = new Node(sup);
    node.src = src;
    node.begin = begin;
    node.end = Math.max(begin, end);
    return node;
  }

  // ─────────────────────────── diagnostics ───────────────────────────

  interface Issue { message: string; at?: Node }

  export class Expression {
    children: Expression[] = [];
    errored = false;
    nodes: Text.Node[] = [];
    private painted = new Set<string>();
    constructor(public src: Source, public begin: number, public end: number, public parent?: Expression) {
      parent?.children.push(this);
    }
    paint(src: Source, begin: number, end: number, style: string | (() => string | undefined), of?: string): void {
      if (src.path === undefined || end <= begin) return;
      const lazy = typeof style === 'function';   // a lazy style resolves at the `highlighting` getter (after the fixpoint converges decorator styles)
      const key = `${src.path}:${begin}:${end}:${lazy ? '~' : style}:${of ?? ''}`;
      if (this.painted.has(key)) return;
      this.painted.add(key);
      const node = new Text.Node(src as Text.Source);
      node.selection = [begin, end - 1];
      node.of = of;
      if (lazy) (node as { lazy?: () => string | undefined }).lazy = style as () => string | undefined;
      else { node.style = style as string; node.color = theme[(style as string).split('.')[0]]; }
      this.nodes.push(node);
    }
  }

  // ─────────────────────────── patterns ───────────────────────────

  type Literal = { kind: 'literal'; text: string; style?: string; at?: number; from?: number; to?: number; claim?: Rule };
  type Piece = Literal | Capture;

  class Capture extends Node {
    kind!: 'until' | 'text' | 'block' | 'expression' | 'word';
    name?: string;
    type?: string;
    content = '';
    raw = false;
    style?: string;
    at?: number;
    get from(): number { return this.begin; }
    set from(v: number) { this.begin = v; }
    get to(): number { return this.end; }
    set to(v: number) { this.end = v; }
  }

  function is_literal(piece: Piece): piece is Literal { return piece.kind === 'literal'; }

  interface View { anchors: Set<string>; edges: Set<string>; claimable: Map<string, Rule[]>; memo: Map<number, number>; }

  function classify(pieces: Piece[]): void {
    for (let p = 0; p < pieces.length; p++) {
      const piece = pieces[p];
      if (is_literal(piece)) continue;
      piece.raw = (piece.type ?? '').startsWith('String');
      const next = pieces[p + 1];
      if (next && is_literal(next)) piece.kind = 'until';
      else if (piece.name === 'block') piece.kind = 'block';
      else if (piece.raw) piece.kind = 'text';
      else if (piece.name === 'expr' || piece.name === 'args' || piece.name === undefined) piece.kind = 'expression';
      else piece.kind = 'word';
    }
  }

  function pattern_key(pattern: Node, pieces: Piece[]): string {
    if (!pieces.length) return pattern.text.trim();
    return pieces.map(p => is_literal(p) ? p.text : `{${p.content}}`).join('');
  }

  // ─────────────────────────── scanning ───────────────────────────
  // the scan_*/word_edge/match_rule helpers now live on Node as cursor methods (`cursor.word()`,
  // `cursor.match(rule, at)`, …); only `near` (direction-pick, no cursor) stays free here.

  function near(sign: 1 | -1, lit: string): string {
    return sign === 1 ? lit[0] : lit[lit.length - 1];
  }


  // ─────────────────────────── matching ───────────────────────────

  interface Matched { begin: number; end: number; captures: { piece: Capture; begin: number; end: number }[]; recognized?: Recognized }

  class Match {
    constructor(private m: Matched, private src: Source, private sup?: Node) {}
    get recognized(): Recognized | undefined { return this.m.recognized; }
    capture(name: string): Node | undefined {
      const c = this.m.captures.find(c => c.piece.name === name);
      return c && span(this.src, c.begin, c.end, this.sup);
    }
  }

  interface Recognized { pattern_begin: number; pattern_end: number; pieces: Piece[]; body_begin: number; body_end: number; end: number }
  type Recognize = (text: string, at: number, cursor: Node) => Recognized | null;

  // ───────────────────────────── rules ─────────────────────────────

  interface External {
    name: string;
    fn?: Method;
    flags?: string[];
    pattern?: string;
    match?: (rule: Rule, cursor: Node, at: number, start?: boolean, recognize?: Recognize) => Matched | null;
  }

  interface Definition { at: Node; seen?: 'live' | Rule }

  interface Site { src: Source; begin: number; end: number; on?: Node; home?: string }

  class Rule extends Node {
    definitions: Definition[] = [];
    body?: Node;
    name?: string;
    matcher?: (rule: Rule, cursor: Node, at: number, start?: boolean, recognize?: Recognize) => Matched | null;
    project?: string;
    key?: string;
    style?: string;
    styled: boolean;
    exists = true;
    disabled = false;
    readonly anchored: boolean;
    readonly delimited: boolean;
    readonly anchor?: string;
    readonly tail?: string;
    readonly comment: boolean;
    private readonly edge_chars: [string | undefined, string | undefined];
    constructor(public pattern: Node, public pieces: Piece[], public on: string) {
      super();
      this.styled = pieces.some(p => p.style !== undefined);
      this.anchored = pieces[0] !== undefined && is_literal(pieces[0]);
      this.delimited = pieces.length > 0 && is_literal(pieces[pieces.length - 1]);
      this.anchor = this.anchored ? (pieces[0] as { text: string }).text : undefined;
      this.tail = this.delimited ? (pieces[pieces.length - 1] as { text: string }).text : undefined;
      this.comment = this.anchored && pieces[pieces.length - 1]?.kind === 'text';
      this.edge_chars = [this.anchor?.[0], this.tail ? this.tail[this.tail.length - 1] : undefined];
    }
    edge(sign: 1 | -1): string | undefined { return sign === 1 ? this.anchor : this.tail; }
    edge_char(sign: 1 | -1): string | undefined { return this.edge_chars[sign === 1 ? 0 : 1]; }
    activate(ext?: External): void {
      if (!ext) return;
      this.name = ext.name;
      this.matcher = ext.match;
      this.fn = ext.fn;
    }
    definition(at: Node): Definition {
      let d = this.definitions.find(x => x.at.src === at.src && x.at.begin === at.begin);
      if (!d) { this.definitions.push(d = { at }); DEFINITIONS++; }
      return d;
    }
  }

  let DEFINITIONS = 0;

  // ─────────────────────────── grammar ───────────────────────────

  const GLOBAL_SCOPE = '~';

  class Interpreter {
    constructor(public program: Program, public diagnostics = new Diagnostics()) {
      this.BASE = new Node(); this.PROGRAM = new Node(this.BASE); this.GLOBAL = new Node(this.BASE);
      this.classes = new Map<string, Node>([['Node', this.BASE], ['*', this.BASE], ['Program', this.PROGRAM]]);
      this.transients = new Map<string, Node>();
      this.scopes = [this.GLOBAL];
    }

    defs_now = new Map<string, Site>();
    defs_before = new Map<string, Site>();
    issues: Issue[] = [];

    get expression(): Expression | undefined { return this.diagnostics.expression; }
    set expression(e: Expression | undefined) { this.diagnostics.expression = e; }
    expression_at(src: Source, begin: number, end: number, parent?: Expression): Expression {
      return this.diagnostics.expression_at(src, begin, end, parent);
    }
    error(message: string, at?: Node): void {
      this.diagnostics.report({ level: 'error', message, node: at?.position }, this.expression as any);
    }
    info(message: string, at?: Node): void {
      this.diagnostics.report({ level: 'info', message, node: at?.position }, this.expression as any);
    }
    paint(src: Source, begin: number, end: number, style: string, of?: string): void {
      this.expression?.paint(src, begin, end, style, of);
    }

    BASE: Node;
    PROGRAM: Node;
    GLOBAL: Node;
    classes: Map<string, Node>;
    class_node(name: string): Node { return this.scope_node(name === '*' ? 'Node' : name); }

    transients: Map<string, Node>;
    name_of(node: Node): string {
      if (node === this.GLOBAL) return GLOBAL_SCOPE;
      for (const [name, cls] of this.classes) if (cls === node) return name;
      const name = `#${node.id}`;
      this.transients.set(name, node);
      return name;
    }
    node_of(name: string): Node | undefined {
      if (name === GLOBAL_SCOPE) return this.GLOBAL;
      return this.classes.get(name) ?? this.transients.get(name);
    }


    // ── grammar engine ──
    scope_node(on: string): Node {
      let n = this.node_of(on);
      if (!n) this.classes.set(on, n = new Node(this.BASE));
      return n;
    }
    private *rule_nodes(): Generator<Node> {
      const seen = new Set<Node>();
      for (const node of [this.GLOBAL, ...this.classes.values(), ...this.transients.values()])
        if (!seen.has(node)) { seen.add(node); yield node; }
    }
    get rules(): Map<string, Rule> {
      const m = new Map<string, Rule>();
      for (const node of this.rule_nodes()) for (const rule of node.ruleset) m.set(rule.key!, rule);
      return m;
    }
    // ── definitions ──
    get defined(): number { return this.defs_now.size + this.defs_before.size; }
    define_at(on: string, key: string, site: Site, home?: string): void {
      if (home !== undefined) site.home = home;
      this.defs_now.set(`${on}::${key}`, site);
    }
    defined_at(on: string, key: string): Site | undefined {
      return this.defs_now.get(`${on}::${key}`) ?? this.defs_before.get(`${on}::${key}`);
    }
    undefine(path: string, keep?: Source): void {
      for (const defs of [this.defs_now, this.defs_before])
        for (const [key, site] of [...defs])
          if (site.src !== keep && site.src.path === path) defs.delete(key);
    }
    *sites(): IterableIterator<[string, Site]> {
      const seen = new Set<string>();
      for (const defs of [this.defs_now, this.defs_before])
        for (const [key, site] of defs) {
          if (seen.has(key)) continue;
          seen.add(key);
          yield [key, site];
        }
    }
    private evict(): void {
      for (const node of this.rule_nodes())
        for (const rule of [...node.ruleset])
          if (rule.project !== undefined && rule.project !== this.program.language_project) node.delete(rule);
    }
    clear(): void {
      for (const node of this.rule_nodes())
        for (const rule of [...node.ruleset])
          if (rule.project !== this.program.language_project) node.delete(rule);
    }
    register(pattern: Node, pieces: Piece[], on: string, project?: string): Rule {
      const text = pattern_key(pattern, pieces);
      const key = `${on}::${project ?? ''}::${text}`;
      const node = this.scope_node(on);
      let rule = node.ruleset.find(r => r.key === key);
      if (!rule) {
        rule = new Rule(pattern, pieces, on);
        rule.activate(EXTERNALS.find(e => e.pattern === text));
        rule.project = project;
        rule.key = key;
        node.method(rule, rule.fn);
      } else if (pieces !== rule.pieces) {
        for (let i = 0; i < pieces.length && i < rule.pieces.length; i++) {
          const style = pieces[i].style;
          if (style !== undefined && rule.pieces[i].style === undefined) {
            rule.pieces[i].style = style;
            rule.styled = true;
          }
        }
      }
      return rule;
    }

    reset(): void {
      this.rtl_names.clear();
      this.defs_before = this.defs_now;
      this.defs_now = new Map();
      for (const rule of this.rules.values()) for (const d of rule.definitions) d.seen = undefined;
    }

    analyze(): boolean {
      const rules = [...this.rules.values()].filter(r => !r.disabled && r.definitions.length);
      const state = new Map<Rule, boolean>(rules.map(r => [r, true]));
      const step = (): boolean => {
        const previous = new Map(state);
        const exists = (r: Rule) => previous.get(r) ?? (r.disabled || r.exists);
        let changed = false;
        for (const r of rules) {
          const alive = r.definitions.some(d => d.seen === 'live' || (d.seen instanceof Rule && !exists(d.seen)));
          if (alive !== previous.get(r)) changed = true;
          state.set(r, alive);
        }
        return changed;
      };

      const limit = 2 * rules.length + 6;
      let stable = false;
      const oscillating = new Set<Rule>();
      for (let k = 0; k < limit; k++) {
        const before = new Map(state);
        if (!step()) { stable = true; break; }
        if (k >= rules.length + 2) for (const r of rules) if (state.get(r) !== before.get(r)) oscillating.add(r);
      }

      if (!stable && oscillating.size) this.report_cycles(oscillating, { state, step, limit });

      let moved = false;
      for (const r of rules) {
        const exists = (state.get(r) ?? true) && !r.disabled;
        if (exists !== r.exists) moved = true;
        r.exists = exists;
      }
      return moved;
    }

    private report_cycles(oscillating: Set<Rule>, { state, step, limit }: { state: Map<Rule, boolean>; step: () => boolean; limit: number }): void {
      const issue = (message: string, ...definitions: Definition[]) => {
        for (const d of definitions) {
          if (this.issues.some(i => i.at?.src === d.at.src && i.at.begin === d.at.begin && i.message === message)) continue;
          this.issues.push({ message, at: d.at });
        }
      };
      const suppressed_by = (r: Rule) => r.definitions.find(d => d.seen instanceof Rule && oscillating.has(d.seen));
      const reported = new Set<Rule>();
      for (const start of oscillating) {
        if (reported.has(start)) continue;
        const order = new Map<Rule, number>();
        let current: Rule | undefined = start;
        while (current && !order.has(current) && !reported.has(current)) {
          order.set(current, order.size);
          current = suppressed_by(current)?.seen as Rule | undefined;
        }
        const trail = [...order.keys()];
        const cycle = current && order.has(current) ? trail.slice(order.get(current)!) : [];
        for (const r of cycle) reported.add(r);
        if (cycle.length === 1) {
          for (const d of cycle[0].definitions) if (d.seen === cycle[0])
            issue(`Unresolved grammar rule \`${cycle[0].pattern.text}\`: its only definition is inside its own interpretation.`, d);
        } else if (cycle.length > 1) {
          const names = cycle.map(r => `\`${r.pattern.text}\``);
          const message = `The rules ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} circularly prevent each other from existing.`;
          for (const r of cycle) { const d = suppressed_by(r); if (d) issue(message, d); }
        }
        for (const r of trail) {
          if (reported.has(r)) continue;
          reported.add(r);
          const d = suppressed_by(r);
          if (d) issue(`The rule \`${r.pattern.text}\` is circularly prevented from existing (via \`${(d.seen as Rule).pattern.text}\`).`, d);
        }
      }
      for (const r of oscillating) { r.disabled = true; state.set(r, false); }
      for (let k = 0; k < limit; k++) if (!step()) break;
    }
    copy(): Interpreter { return this.clone(); }
    clone(): Interpreter {
      const seen = new Map<Node, Node>();
      const ip = new Interpreter(this.program, this.diagnostics);
      ip.BASE = this.BASE.clone(seen);
      ip.PROGRAM = this.PROGRAM.clone(seen);
      ip.GLOBAL = this.GLOBAL.clone(seen);
      ip.classes = new Map(); for (const [name, node] of this.classes) ip.classes.set(name, node.clone(seen));
      ip.transients = new Map(); for (const [name, node] of this.transients) ip.transients.set(name, node.clone(seen));
      ip.defs_now = new Map(this.defs_now);
      ip.defs_before = new Map(this.defs_before);
      ip.scopes = [ip.GLOBAL];
      ip.abstract_blocks = this.abstract_blocks;
      ip.rtl_names = new Set(this.rtl_names);
      return ip;
    }

    rules_version = 0;

    scopes: Node[] = [];
    abstract_blocks = false;
    rtl_names = new Set<string>();

    language(src: Source): boolean { return this.program.language(src); }
    scope(): Node { return this.scopes[this.scopes.length - 1]; }
    scope_epoch = 0;
    enter(scope: Node): void { this.scopes.push(scope); this.scope_epoch++; }
    leave(): void { this.scopes.pop(); this.scope_epoch++; }

    private looked?: { epoch: number; nodes: Node[] };
    lookup(): readonly Node[] {
      let l = this.looked;
      if (!l || l.epoch !== this.scope_epoch) {
        const seen = new Set<Node>();
        const nodes: Node[] = [];
        for (let i = this.scopes.length - 1; i >= 0; i--)
          for (let n: Node | undefined = this.scopes[i]; n && !seen.has(n); n = n.sup) { seen.add(n); nodes.push(n); }
        this.looked = l = { epoch: this.scope_epoch, nodes };
      }
      return l.nodes;
    }

    visible(rule: Rule, src: Source): boolean {
      if (!(rule.exists || rule.disabled)) return false;
      return rule.project === undefined || this.program.closure(this.program.project(src)).has(rule.project);
    }

    // ── the grammar ledger ──

    reach(src: Source): string | undefined {
      return this.language(src) ? undefined : this.program.project(src);
    }


    private decorating = new Set<number>();




    install(_rule?: Rule): void {
      this.rules_version++;
    }


    // ── the scanning context ──

    scan_depth = 0;
    cursor(src: Source, sign: 1 | -1 = 1): Node { const n = span(src, 0, (src as Text.Source).text.length); n.ip = this; n.sign = sign; return n; }

    // ── parsing ──

    parse(src: Source): void {
      this.diagnostics.forget(src);
      const saved = this.scopes;
      this.scopes = [this.GLOBAL];
      this.scope_epoch++;
      this.statements(span(src, 0, src.text.length));
      this.scopes = saved;
      this.scope_epoch++;
    }

    frames: Site[] = [];
    statements(cursor: Node, forwards = false): Node | undefined {
      const text = cursor.src!.text;
      let result: Node | undefined;
      while (cursor.begin < cursor.end) {
        while (cursor.begin < cursor.end && (text[cursor.begin] === ' ' || text[cursor.begin] === '\n')) cursor.begin++;
        if (cursor.begin >= cursor.end) break;
        const before = cursor.begin;
        const frame: Site = { src: cursor.src!, begin: before, end: 0, on: this.scope() };
        this.frames.push(frame);
        const r = this.expr(cursor, { forwards });
        this.frames.pop();
        frame.end = Math.max(cursor.begin, before);
        if (r !== undefined) result = r;
        if (cursor.begin <= before) cursor.begin = before + 1;
      }
      return result;
    }

    eval_block(block: Node | undefined, forwards = false): Node | undefined {
      if (!block || block.empty) return undefined;
      return this.statements(span(block.src!, block.begin, block.end), forwards);
    }

    // ── reading expressions ──

    expr(cursor: Node, reading: Reading = {}): Node | undefined {
      const ip = this, src = cursor.src!, text = src.text;
      const parent = this.expression;
      this.expression = this.expression_at(src, cursor.begin, cursor.end, parent);
      try {
        cursor.ip = ip; cursor.sign = reading.sign ?? 1;
        const indent = reading.indent ?? cursor.indent(cursor.begin);
        const forwards = reading.forwards ?? false;
        const proven = new Set<Rule>();

        // ── direction: read left-to-right unless right-to-left tokens flip it ──
        let sign: 1 | -1 = reading.sign ?? 1;

        // ── read: walk the span in `sign`, folding each token onto `result` ──
        let result: Node | undefined;
        function decorate_pieces(pieces: Piece[], src: Source, evaluate: boolean): void {   // eval inline-decorator pieces; the leading `H.x ` prefix split now happens in read_group
          if (!evaluate) return;
          for (const piece of pieces) {
            if (piece.at === undefined || piece.from === undefined) continue;
            if (piece.at > piece.from + 1) {   // decorator prefix [from+1, at) stripped by read_group — resolve it as an arbitrary expression (on a path-less shadow so it doesn't paint); style converges over the fixpoint. KNOWN GAP: the `.` rule's own self-referential pieces lose 5 member-name paints (to fix later).
              const shadow = new Text.Source(); shadow.value = src.text.slice(piece.from + 1, piece.at);
              const decorator = ip.eval_block(span(shadow, 0, shadow.value.length), true);
              const s = decorator ? STYLED.get(decorator) : undefined;
              if (s !== undefined) piece.style = s;
              continue;
            }
            if (is_literal(piece)) continue;
            let head = piece.at;
            const end = piece.at + piece.content.length;
            while (head < end && src.text[head] === ' ') head++;
            const sc = ip.cursor(src);
            if (head >= end || !sc.anchors.has(src.text[head]) || sc.claim(head) === -1) continue;
            if (ip.decorating.has(piece.at)) continue;
            ip.decorating.add(piece.at);
            try { ip.eval_block(span(src, head, end, ip.BASE), true); }
            finally { ip.decorating.delete(piece.at); }
          }
        }
        function read_group(cursor: Node, begin: number, end: number): Piece {
          const gtext = cursor.src!.text;
          if (cursor.until(begin, ':') === -1 || cursor.until(begin, ':') >= end) {   // a top-level `:` makes it a typed capture, not a decorator
            let space = -1;   // the constraint: the content is the trailing token; whatever precedes the last top-level space is the decorator prefix (an arbitrary expression, resolved by decorate_pieces)
            for (let i = begin; i < end; ) {
              const c = gtext[i];
              if (c === ' ') { space = i; i++; }
              else if (cursor.anchors.has(c)) { const f = cursor.claim(i); i = f !== -1 ? f + 1 : i + 1; }
              else i++;
            }
            if (space !== -1) { let a = space; while (gtext[a] === ' ') a++; if (a < end) begin = a; }   // structural strip; prefix is [groupStart, begin)
          }
          const content = gtext.slice(begin, end);
          const quoted = cursor.literal_of(begin, end);
          if (quoted !== undefined) return { kind: 'literal', text: quoted.text, at: begin, claim: quoted.by };
          const colon = cursor.until(begin, ':');
          const split = colon !== -1 && colon < end;
          const name = (split ? gtext.slice(begin, colon) : content).trim();
          const cap = new Capture();
          cap.kind = 'word';
          cap.name = name || undefined;
          cap.type = split ? gtext.slice(colon + 1, end).trim() : undefined;
          cap.content = content;
          cap.at = begin;
          return cap;
        }
        function parse_pattern(text: string, begin: number, end: number, cursor: Node): Piece[] | null {
          const pieces: Piece[] = [];
          let literal_start = begin;
          let i = begin;
          const flush_literal = (upto: number): void => {
            if (upto > literal_start) pieces.push({ kind: 'literal', text: text.slice(literal_start, upto), from: literal_start, to: upto });
          };
          while (i < end) {
            if (text[i] !== '{') { i++; continue; }
            const close = cursor.group(i);
            if (close === -1) return null;
            flush_literal(i);
            const piece = read_group(cursor, i + 1, close - 1);
            piece.from = i; piece.to = close;
            pieces.push(piece);
            i = close;
            literal_start = i;
          }
          flush_literal(i);
          if (!pieces.length) return null;
          classify(pieces);
          return pieces;
        }
        function recognize(text: string, at: number, cursor: Node): Recognized | null {
          let saw_group = false, j = at;
          for (;;) {
            const c = text[j];
            if (c === undefined || c === '\n') return null;
            if (c === '{') {
              const close = cursor.group(j);
              if (close === -1) return null;
              saw_group = true;
              j = close;
              continue;
            }
            if (cursor.anchors.has(c)) {            // a claimable group/literal — `(…)`, `[…]`, `` `…` `` — is a pattern token too, not just `{…}`
              const far = cursor.claim(j);
              if (far !== -1) { saw_group = true; j = far + 1; continue; }
            }
            if (c === '=' && text[j + 1] === '>') break;
            if (c === ' ') { j++; continue; }
            let w = cursor.word(j);   // a rule-def token is `String.Word | {group}`, so a word can't contain `{` — it starts the group alternative
            for (let k = j; k < w; k++) if (text[k] === '{') { w = k; break; }
            if (w === j) return null;
            j = w;
          }
          if (!saw_group) return null;
          let pattern_end = j;
          while (pattern_end > at && text[pattern_end - 1] === ' ') pattern_end--;
          if (pattern_end === at) return null;
          const pieces = parse_pattern(text, at, pattern_end, cursor);
          if (!pieces) return null;
          let b = j + 2;
          while (text[b] === ' ') b++;
          const body_end = (b >= text.length || text[b] === '\n')
            ? cursor.block(b, cursor.indent(at))
            : cursor.expression(b);
          return { pattern_begin: at, pattern_end, pieces, body_begin: b, body_end, end: Math.max(j + 2, body_end) };
        }
        function rule(pattern: Node, pieces: Piece[], on: Node, evaluate = true, style?: string): Rule {
          const src = pattern.src!;
          decorate_pieces(pieces, src, evaluate);
          const rule = ip.register(pattern, pieces, ip.name_of(on), ip.reach(src));
          if (style !== undefined) rule.style = style;
          if (evaluate && src.path !== undefined) {
            const own = rule.style ?? 'function.definition';
            for (const piece of rule.pieces) {
              const { from, to } = piece;
              if (from === undefined || to === undefined) continue;
              if (piece.at === undefined) { ip.paint(src, from, to, own); continue; }
              let inner = from + 1;
              if (piece.style !== undefined && piece.at > inner) { ip.paint(src, inner, piece.at, piece.style); inner = piece.at; }
              if (is_literal(piece) && piece.claim?.style !== undefined) ip.paint(src, inner, to - 1, piece.claim.style);
            }
          }
          return rule;
        }

        function paint_def(src: Source, r: Recognized): void {
          const shape = [...ip.rules.values()].find(s => s.name === 'rule-definition' && s.styled);
          if (src.path === undefined || !shape) return;
          const caps = shape.pieces.filter((p): p is Capture => !is_literal(p));
          const lit = shape.pieces.find(is_literal);
          let arrow = r.pattern_end;
          while (src.text[arrow] === ' ') arrow++;
          const after = arrow + (lit?.text.length ?? 0);
          if (caps[0]?.style !== undefined) ip.paint(src, r.pattern_begin, arrow, caps[0].style);
          if (lit?.style !== undefined) ip.paint(src, arrow, after, lit.style);
          if (caps[1]?.style !== undefined && r.body_end > after) ip.paint(src, after, r.body_end, caps[1].style);
        }
        function define(at: Node, style?: string, pre?: Recognized): Rule {
          const src = at.src!;
          const r = pre ?? recognize(src.text, at.begin, ip.cursor(src))!;
          const pattern = span(src, r.pattern_begin, r.pattern_end);
          paint_def(src, r);
          const built = rule(pattern, r.pieces, ip.scope(), true, style);
          built.definition(pattern).seen = 'live';
          if (r.body_end > r.body_begin) {
            const body = span(src, r.body_begin, r.body_end);
            if (!body.empty) built.body = body;
          }
          ip.install(built);
          return built;
        }

        function declare(pattern: Node, pieces: Piece[], on: Node): Rule | undefined {
          const built = rule(pattern, pieces, on);
          const external = EXTERNALS.find(e => e.pattern === pattern_key(pattern, built.pieces));
          if (!external) return undefined;
          built.activate(external);
          built.definition(pattern).seen = 'live';
          ip.install(built);
          return built;
        }

        function declare_external(raw: Node, on: Node, at: Node, recognized?: Recognized): Node {
          const src = raw.src!;
          let begin = raw.begin, end = raw.end;
          while (begin < end && src.text[begin] === ' ') begin++;
          while (end > begin && src.text[end - 1] === ' ') end--;
          const text = src.text.slice(begin, end);
          if (!text) { ip.error('`external` requires a declaration as its argument.', at); return raw; }
          if ('{(['.includes(text[0]) || text.includes('{')) {
            const r = recognized;
            const pattern = r && r.pattern_end <= end ? span(src, r.pattern_begin, r.pattern_end) : span(src, begin, end);
            const pieces = (r && r.pattern_end <= end ? r.pieces : parse_pattern(src.text, begin, end, ip.cursor(src))) ?? [];
            if (!declare(pattern, pieces, on))
              ip.error(`Expected the rule \`${pattern.text}\` to be provided by the runtime, but it wasn't.`, pattern);
            return raw;
          }
          const words = text.split(/\s+/);
          const modifiers: Node[] = [];
          while (words.length > 1) {
            const modifier = on.resolve_on(words[0]) ?? ip.resolve(words[0]);
            if (!modifier?.fn || !modifier.has_flag('modifier')) break;
            modifiers.push(modifier);
            words.shift();
          }
          const name = words[0].split(':')[0];
          const target = on.resolve_on(name) ?? (on.has_flag('highlight') ? ip.group(on, name) : ip.resolve(name));
          if (!target) {
            ip.error(`Expected method \`${name}\` to be externally defined by the runtime, but it wasn't.`, span(src, begin, end));
            return raw;
          }
          let declared: Node = target;
          for (const modifier of modifiers) declared = ip.apply(modifier, { self: on, args: declared, at }) ?? declared;
          if (declared.has_flag('right-to-left') && !declared.has_flag('left-to-right')) ip.rtl_names.add(name);
          const site = ip.frames[ip.frames.length - 1];
          if (site) ip.define_at(ip.name_of(on), name, site, site.on && ip.name_of(site.on));
          return declared;
        }

        const decorate = (callee: Node, args: Node, recognized?: Recognized): Node => {
          const name = STYLED.get(callee)!;
          if (args.empty) return callee;
          const dat = args.src;
          if (dat && recognized && recognized.pattern_end <= args.end) {
            define(span(dat, args.begin, args.end, ip.BASE), name, recognized);
            return span(dat, args.begin, recognized.end, ip.BASE);
          }
          const value = ip.eval_block(args, true) ?? args;
          if (value.src?.path !== undefined && value.end > value.begin) ip.paint(value.src, value.begin, value.end, name);
          STYLED.set(value, name);
          const host = ip.hosted(value);
          const ste = ip.frames[ip.frames.length - 1];
          if (host && ste) ip.define_at(host.on, host.name, ste, ste.on && ip.name_of(ste.on));
          return value;
        };
        const paint_rule = (m: Matched, rule: Rule): void => {
          ip.paint(src, m.begin, m.end, '', rule.key);
          let pos = m.begin;   // always paint pieces lazily — a piece's decorator style may converge after this fire (e.g. the `.` rule styling its own `H.property` later in the pass); the getter drops pieces that resolve to no style
          for (const piece of rule.pieces) {
            let pb = pos, pe: number;
            if (is_literal(piece)) pe = pos + piece.text.length;
            else { const cap = m.captures.find(c => c.piece === piece); if (!cap) break; pb = cap.begin; pe = cap.end; }
            const b = pb, e = pe;   // paint in-context now, resolve the (possibly not-yet-converged) decorator style lazily at the highlighting getter
            ip.paint(src, b, e, () => piece.style ?? (rule.style !== undefined && (is_literal(piece) || (piece as Capture).raw) ? rule.style : undefined), rule.key);
            pos = pe;
          }
        };
        const eval_body = (rule: Rule, m: Matched, self: Node | undefined): Node | undefined => {
          if (!rule.body || rule.body.empty) return undefined;
          const ctx = new Node(ip.BASE);
          for (const cap of m.captures) {
            if (!cap.piece.name) continue;
            const node = span(src, cap.begin, cap.end, ip.BASE);
            const value = (cap.piece.name === 'expr' || cap.piece.name === 'args') ? (ip.eval_block(node) ?? node) : node;
            if (cap.piece.name === 'block') ip.abstract(value);
            ctx.set(cap.piece.name, value);
          }
          if (self) ctx.set('this', self);
          return ip.eval_in(ctx, rule.body);
        };
        const directed = (m: Node, r?: Node): boolean => {
          const rtl = m.has_flag('right-to-left'), ltr = m.has_flag('left-to-right');
          return sign === 1 ? (ltr || !rtl) : (rtl || (!ltr && r === undefined));
        };
        // ── one loop: read the cursor and, per position, claim/fire/name/word directly onto `result` ──
        let raw_pending: Node | undefined;  // a raw method that just fired; consumes the rest of its line next iteration
        let first = true;
        while (true) {                        // the cursor is the claimable-delimiter view for this scope (cursor.sign/cursor.viewer())
          if (raw_pending) {                  // a raw method awaiting its declaration
            const v = raw_pending; raw_pending = undefined;
            const callee = v.role?.kind === 'bound' ? v.role.method : v;
            const self = v.role?.kind === 'bound' ? v.role.self : ip.scope();
            let a = cursor.head(); while (text[a] === ' ') a++;
            const eol = Math.min(cursor.line_end(a), cursor.end);
            const args = span(src, Math.min(a, eol), eol, ip.BASE);
            const at = span(src, cursor.head(), cursor.head(), ip.BASE);
            const recognized = recognize(text, args.begin, cursor) ?? undefined;
            cursor.cut(eol);
            if (callee.has_flag('highlight')) result = decorate(callee, args, recognized);
            else if (callee.has_flag('declares')) result = declare_external(args, self, at, recognized) ?? result;
            else result = callee.fn!({ interpreter: ip, self, method: callee, args, at, recognized }) ?? result;
            continue;
          }
          if (cursor.done()) break;
          const c = cursor.at();
          if (c === undefined || c === '\n') break;
          const head = cursor.head();
          // ── the best rule + the longest method name at this position, in one chain walk ──
          const start = result === undefined && sign === 1;
          const own = ip.program.project(src);
          let best: Candidate | null = null;
          const seen = proven; seen.clear();
          let level = 0;
          const attempt = (rule: Rule) => {
            if (!ip.visible(rule, src) || seen.has(rule)) return;
            seen.add(rule);
            const edge = rule.edge(sign);
            if (edge !== undefined && (rule.edge_char(sign) !== c || (edge.length > 1 && !cursor.lit_at(head, edge)))) return;
            if (rule.matcher && sign === -1) return;
            const m = rule.matcher ? rule.matcher(rule, cursor, head, start, recognize) : cursor.match(rule, head, indent);
            const rank = rule.project === own ? 0 : 1;
            if (m && prefers({ rule, m, level, rank }, best)) best = { rule, m, level, rank };
          };
          let nm: string | null = null, owner: Node | undefined;
          let firstScope = true;
          for (const nodes of result ? [result.chain(), ip.lookup()] : [ip.lookup()]) {
            for (const node of nodes) {
              const rules = node.ruleset;
              if (rules.length) {
                const dispatch = node.dispatch;
                const keyed = dispatch.keyed[sign === 1 ? 0 : 1].get(c);
                if (keyed) for (const rule of keyed) attempt(rule);
                for (const rule of dispatch.unkeyed[sign === 1 ? 0 : 1]) attempt(rule);
              }
              if (firstScope && node.methods) {
                const n = node.name_at(cursor, head, nm?.length ?? -1);
                if (n) { nm = n; owner = node; }
              }
              level++;
            }
            firstScope = false;
          }
          const found = best;
          const name = nm !== null ? { name: nm, owner: owner! } : null;
          if (first) {   // first step, default forward: let right-to-left tokens flip/split this expression (reusing `found` as the lead)
            first = false;
            const begin = cursor.begin;
            if (reading.sign === undefined && ip.rtl_names.size && ip.rtl_site_in(src, begin, cursor.line_end(begin))) {
              const extent = cursor.expression(begin);
              const claimed = !!(found && found.m.end >= extent);
              const fname = claimed ? null : (ip.known(cursor, begin, ip.lookup())?.name ?? null);
              if (!claimed && !(fname && ip.resolve(fname)?.has_flag('raw'))) {
                const tokens: { begin: number; end: number; rtl: boolean }[] = [];
                for (let i = begin; i < extent; ) {
                  const ch = text[i];
                  if (ch === ' ' || ch === '\n') { i++; continue; }
                  if (cursor.anchors.has(ch)) { const far = cursor.claim(i); if (far !== -1) { i = far + 1; continue; } }
                  const w = cursor.word(i);
                  if (w === i) { i++; continue; }
                  const m = ip.resolve(text.slice(i, w));
                  if (m?.fn && m.has_flag('right-to-left') !== m.has_flag('left-to-right')) tokens.push({ begin: i, end: w, rtl: m.has_flag('right-to-left') });
                  i = w;
                }
                const rtls = tokens.filter(t => t.rtl);
                if (rtls.length) {
                  const ltrs = tokens.filter(t => !t.rtl);
                  cursor.begin = extent;
                  if (!ltrs.length) return ip.expr(span(src, begin, extent), { sign: -1, indent, forwards });
                  const lastRtl = rtls[rtls.length - 1], firstLtr = ltrs[0];
                  if (lastRtl.end <= firstLtr.begin) {
                    const rtl = ip.expr(span(src, begin, firstLtr.begin), { sign: -1, indent, forwards });
                    const ltr = ip.expr(span(src, lastRtl.end, extent), { sign: 1, indent, forwards });
                    return ltr ?? rtl;
                  }
                  ip.error(`Cannot mix ${[...new Set(tokens.map(t => text.slice(t.begin, t.end)))].map(n => `\`${n}\``).join(', ')} in a single infix expression with mixed associativity, use parenthesis to mix them.`, span(src, begin, extent));
                  return undefined;
                }
              }
            }
          }
          const space = c === ' ';

          // speculatively resolve a leading member-access expression (before the `.` rule is a boundary). On a rule-def line a raw consumer takes the rest of the line as its argument (the decorator is the caller, the rule-def its argument). On an assignment line the leading member is resolved as an assignable slot (so `H.x = …` aliases work); other member accesses are left to the `.` rule.
          if (!space && sign === 1 && result === undefined) {
            const seg = (k: number): number => { let w = cursor.word(k); const dot = text.indexOf('.', k); if (dot >= k && dot < w) w = dot; return w; };
            const e0 = seg(head);
            let base: Node | undefined = e0 > head ? ip.resolve(text.slice(head, e0)) : undefined;
            if (base && text[e0] === '.') {
              const keys: string[] = []; let p = e0, ok = true;
              while (text[p] === '.') { const s = p + 1, me = seg(s); if (me === s) { ok = false; break; } keys.push(text.slice(s, me)); p = me; }
              let q = p; while (text[q] === ' ') q++;          // is this an assignment LHS? (a lone `=`, not `=>`/`==`)
              const assigning = text[q] === '=' && text[q + 1] !== '>' && text[q + 1] !== '=';
              let on: Node | undefined = base;
              for (let i = 0; ok && on && i < keys.length - 1; i++) on = on.resolve_on(keys[i]) ?? (on.has_flag('highlight') ? ip.group(on, keys[i]) : undefined);
              if (ok && on && keys.length) {
                const key = keys[keys.length - 1];
                const member = on.resolve_on(key);
                if (found?.rule.name === 'rule-definition') {
                  const dec = member ?? (on.has_flag('highlight') ? ip.group(on, key) : undefined);
                  if (dec?.has_flag('raw')) {                 // decoration: consumes the rest of its line
                    ip.paint(src, head, p, ip.style_of(dec) ?? 'variable');
                    cursor.cut(p); result = dec; raw_pending = dec; continue;
                  }
                } else if (assigning) {                       // assignment LHS: an assignable slot (mirrors the `[{property}]` index)
                  ip.paint(src, head, p, ip.style_of(member ?? on) ?? 'variable');
                  cursor.cut(p);
                  const r = span(src, head, p, ip.BASE);
                  r.role = { kind: 'slot', on, key };
                  result = r; continue;
                } else if (member?.has_flag('highlight')) {   // reference to a defined decorator (e.g. RHS `H.comment`): resolve to its node, not a forward
                  ip.paint(src, head, p, ip.style_of(member) ?? 'variable');
                  cursor.cut(p); result = member; continue;
                }
              }
            }
          }

          // longest match wins: a rule (at a space, or ≥ the name's length) beats the name beats a bare word
          if (found && (space || !name || found.m.end - found.m.begin >= name.name.length)) {
            const { rule, m } = found;
            const at = span(src, m.begin, m.end);
            cursor.cut(sign === 1 ? m.end : m.begin);
            const site = `${rule.pattern.id}:${src.path ?? ''}:${at.begin}`;
            if (!ip.overflowed && !ip.firing.has(site)) {
              if (ip.depth > 64) { ip.overflowed = true; ip.error(`Rule recursion exceeded at \`${rule.pattern.text}\` — refusing to evaluate deeper.`, at); }
              else {
                ip.firing.add(site); ip.depth++;
                try {
                  if (result?.role?.kind === 'forward') result.consumed = true;
                  paint_rule(m, rule);
                  if (!rule.disabled) {
                    const method = ip.node_of(rule.on)?.get(rule) ?? rule;
                    if (rule.name === 'rule-definition') define(at, undefined, m.recognized);
                    else if (method.fn) result = method.fn({ interpreter: ip, self: result, method, args: at, at, match: new Match(m, src, ip.BASE) }) ?? result;
                    else result = eval_body(rule, m, result) ?? result;
                  }
                } finally { ip.firing.delete(site); if (--ip.depth === 0) ip.overflowed = false; }
              }
            }
            const fired = result?.role?.kind === 'bound' ? result.role.method : result;
            if (sign === 1 && fired?.fn && fired.has_flag('raw')) raw_pending = result;
            continue;
          }
          if (space) { cursor.take(); continue; }   // a space with no rule: skip it

          if (name) {                          // a named method
            const m = name.owner.get(name.name)!;
            const begin = sign === 1 ? head : head - name.name.length + 1;
            const at = span(src, begin, begin + name.name.length, ip.BASE);
            cursor.cut(sign === 1 ? at.end : at.begin);
            ip.paint(src, at.begin, at.end, ip.style_of(m) ?? 'variable');
            if (!m.fn) { result = m; continue; }
            if (m.has_flag('raw')) { result = m; raw_pending = m; continue; }
            if (!directed(m, result)) {
              const dir = sign === 1 ? 'left-to-right' : 'right-to-left';
              ip.error(result ? `Found a method \`${name.name}\` on \`${result.text}\` but it wasn't flagged as ${dir}.` : `Found a method \`${name.name}\` but it wasn't flagged as ${dir}.`, at);
              continue;
            }
            const self = result ?? ip.scope();
            const args = m.has_flag('callable') ? ip.expr(cursor, { forwards, indent, sign }) : undefined;
            result = m.fn!({ interpreter: ip, self, method: m, args: args ?? span(at.src!, at.begin, at.begin, ip.BASE), at }) ?? result;
            continue;
          }

          const exit = cursor.word(head);    // a bare word → forward reference
          if (exit === head) { cursor.take(); continue; }
          const [b, e] = sign === 1 ? [head, exit] : [exit + 1, head + 1];
          const w = span(src, b, e, ip.BASE);
          if (result) {
            if (result.role?.kind === 'forward' && !result.consumed) { result.consumed = true; ip.error(`Unresolved \`${result.role.name}\` on \`${result.role.on.text}\`.`, result); }
            let cell = result.get(w.text);
            if (!cell) { cell = w; cell.role = { kind: 'forward', name: w.text, on: result }; result.set(w.text, cell); }
            if (!forwards) cell.reference(w);
            ip.paint(src, b, e, 'variable');
            result = cell;
          } else {
            w.role = { kind: 'forward', name: w.text, on: ip.scope() };
            ip.paint(src, b, e, 'variable');
            result = w;
          }
          cursor.cut(sign === 1 ? e : b);
        }
        if (result?.role?.kind === 'forward' && !result.consumed && !forwards) {
          result.consumed = true;
          ip.error(`Unresolved variable \`${result.role.name}\`.`, result);
        }
        return result;
      } finally {
        this.expression = parent;
      }
    }

    private rtl_sites = new WeakMap<Source, { names: number; sites: number[] }>();
    rtl_site_in(src: Source, begin: number, end: number): boolean {
      let entry = this.rtl_sites.get(src);
      if (!entry || entry.names !== this.rtl_names.size) {
        const sites: number[] = [];
        for (const name of this.rtl_names) {
          for (let k = src.text.indexOf(name); k !== -1; k = src.text.indexOf(name, k + 1)) sites.push(k);
        }
        sites.sort((a, b) => a - b);
        this.rtl_sites.set(src, entry = { names: this.rtl_names.size, sites });
      }
      const sites = entry.sites;
      let lo = 0, hi = sites.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (sites[mid] < begin) lo = mid + 1; else hi = mid; }
      return lo < sites.length && sites[lo] < end;
    }

    // ── firing rules ──

    private depth = 0;
    private overflowed = false;
    private firing = new Set<string>();
    // ── resolution ──

    known(cursor: Node, at: number, nodes: Iterable<Node>): { name: string; owner: Node } | null {
      let name: string | null = null, owner: Node | undefined;
      for (const node of nodes) {
        if (!node.methods) continue;
        const n = node.name_at(cursor, at, name?.length ?? -1);
        if (n) { name = n; owner = node; }
      }
      return name !== null ? { name, owner: owner! } : null;
    }

    apply(method: Node, call: { self: Node; args?: Node; at: Node; match?: Match }): Node | undefined {
      return method.fn!({ interpreter: this, self: call.self, method, args: call.args ?? span(call.at.src!, call.at.begin, call.at.begin, this.BASE), at: call.at, match: call.match });
    }

    eval_in(scope: Node, block: Node | undefined, forwards = false): Node | undefined {
      if (!block || block.empty) return undefined;
      this.enter(scope);
      const result = this.eval_block(block, forwards);
      this.leave();
      return result;
    }

    resolve(word: string): Node | undefined {
      for (const node of this.lookup()) { const found = node.get(word); if (found) return found; }
      return undefined;
    }

    private hosts = new WeakMap<Node, { on: string; name: string }>();
    hosted(m: Node): { on: string; name: string } | undefined {
      const memo = this.hosts.get(m);
      if (memo) return memo;
      for (const [name, scope] of [...this.classes, [GLOBAL_SCOPE, this.GLOBAL] as const]) {
        if (!scope.methods) continue;
        for (const [key, value] of scope.methods) {
          if (value !== m || typeof key !== 'string') continue;
          const found = { on: name, name: key };
          this.hosts.set(m, found);
          return found;
        }
      }
      return undefined;
    }

    // A method's style. TODO: when unknown but the hosting has a recorded
    // site (a decoration is definitional), it should summon like any other
    // definition — that first needs bare WORDS to summon on their misses too
    // (`class H` itself, consumed before its statement), not only resolve_on:
    // a paint-driven summon from line 1 currently evaluates statements whose
    // dependencies cannot exist yet.
    style_of(m: Node): string | undefined {
      return STYLED.get(m);
    }


    group(on: Node, name: string): Node {
      const node = new Node(this.BASE);
      node.flag('highlight'); node.flag('raw');
      STYLED.set(node, name);
      node.fn = () => node;
      on.set(name, node);
      return node;
    }

    abstract(block: Node): void {
      if (this.abstract_blocks && !block.empty) this.evaluate_program(block);
    }

    private calling = new Set<Node>();
    evaluate_program(program: Node): Node {
      if (this.calling.has(program)) return new Node();
      this.calling.add(program);
      try {
        return this.eval_in(program, program) ?? new Node();
      } finally { this.calling.delete(program); }
    }

  }


  // name buckets (`Node.names`/`Node.name_at`), rule dispatch (`Node.dispatch`), the super
  // chain (`Node.chain`/`resolve_on`/`deref`) and identity (`Node.id`) now live on Node.
  interface NameBucket { lengths: number[]; sets: Map<number, Set<string>> }
  interface Dispatch { count: number; keyed: [Map<string, Rule[]>, Map<string, Rule[]>]; unkeyed: [Rule[], Rule[]] }

  // ──────────────────────── externals + driver ────────────────────────

  function assign(ip: Interpreter, { self, args, at }: Args): Node {
    const value = args.deref();
    const role = self?.role;
    if (role?.kind !== 'slot' && role?.kind !== 'forward') {
      ip.error('Cannot assign here.', self ?? at);
      return value;
    }
    const on = role.on;
    const key = role.kind === 'slot' ? role.key : role.name;
    self.consumed = true;
    on.set(key, value);
    self.role = { kind: 'slot', on, key };
    for (const [name, cls] of ip.classes) if (cls === on) {
      ip.info(`Defined \`${typeof key === 'string' ? key : key.text}\` on \`${name}\`.`, self);
      if (typeof key === 'string') {
        const frame = [...ip.frames].reverse().find(f => f.on === on) ?? ip.frames[0];
        if (frame) ip.define_at(name, key, frame, frame.on && ip.name_of(frame.on));
      }
      break;
    }
    return value;
  }

  function call(ip: Interpreter, callee: Node | undefined, args: Node, at: Node): Node {
    const bound = callee?.role?.kind === 'bound' ? callee.role : undefined;
    const method = bound ? bound.method : callee;
    const self = bound ? bound.self : callee;
    if (method?.fn) return ip.apply(method, { self: self ?? method, args, at }) ?? new Node();
    if (method && !method.empty) return ip.evaluate_program(method);
    ip.error('Expected a function to call.', at);
    return new Node();
  }

  // ── highlighting ──
  const STYLED = new WeakMap<Node, string>();

  const EXTERNALS: External[] = [
    { name: 'external', flags: ['raw', 'declares'], fn: () => undefined },
    { name: 'static', flags: ['callable'], fn: ({ interpreter: ip, args }) => ip.eval_block(args) ?? args },
    { name: '=', flags: ['callable'], fn: call => assign(call.interpreter, call) },
    { name: '**', fn: ({ interpreter: ip, self }) => { const program = self.deref(); program.sup = ip.PROGRAM; return program; } },
    { name: 'left-to-right', flags: ['callable', 'modifier'], fn: ({ args }) => args.flag('left-to-right') },
    { name: 'left-associative', flags: ['callable', 'modifier'], fn: ({ args }) => args.flag('left-to-right') },
    { name: 'right-to-left', flags: ['callable', 'modifier'], fn: ({ args }) => args.flag('right-to-left') },
    { name: 'right-associative', flags: ['callable', 'modifier'], fn: ({ args }) => args.flag('right-to-left') },
    { name: '</', flags: ['callable', 'right-to-left'], fn: ({ args }) => args },
    { name: 'test-middle', fn: ({ at }) => at },
    { name: 'test-left', fn: ({ interpreter: ip, self, at }) => { ip.info(`test-left fired on \`${self.text}\``, at); return self; } },
    { name: 'test-right', flags: ['callable'], fn: ({ interpreter: ip, self, at }) => { ip.info(`test-right fired on \`${self.text}\``, at); return self; } },
    { name: 'test-assoc', flags: ['callable'], fn: ({ interpreter: ip, self, at }) => { ip.info(`test-assoc fired on \`${self.text}\``, at); return self; } },
    { name: 'test-bidir', fn: ({ interpreter: ip, self, at }) => { ip.info(`test-bidir fired on \`${self.text}\``, at); return self; } },
    { pattern: 'class {name}{block}', name: 'class', fn: ({ match, interpreter: ip }) => {
      const name = match.capture('name')?.text.trim();
      if (!name) return undefined;
      const node = ip.class_node(name);
      ip.scope().set(name, node);
      ip.eval_in(node, match.capture('block'));
      return node;
    } },
    { pattern: '{(String.Word | `{`, expr, `}`)[]}=>{body}', name: 'rule-definition',
      match(rule, cursor, at, start, recognize) {
        if (!start) return null;
        const r = recognize!(cursor.src!.text, at, cursor);
        return r && { begin: at, end: r.end, captures: [], recognized: r };
      },
      fn: () => undefined },
    { pattern: '[{property}]', name: 'index', fn: ({ match, at, self: receiver, interpreter: ip }) => {
      const self = receiver ?? ip.scope();
      const key_node = ip.eval_block(match.capture('property'), true);
      if (key_node?.role?.kind === 'forward') key_node.consumed = true;
      const key = key_node ? (key_node.role?.kind === 'forward' ? key_node.role.name : key_node.text) : '';
      const found = key ? self.resolve_on(key) : undefined;
      const result = span(at.src!, at.begin, at.end, ip.BASE);
      if (found?.fn) { result.sup = ip.PROGRAM; result.role = { kind: 'bound', self, method: found }; }
      else result.role = { kind: 'slot', on: self.deref(), key };
      return result;
    } },
    { pattern: '({args})', name: 'call', fn: ({ match, at, self: receiver, interpreter: ip }) => {
      const cap = match!.capture('args')!;
      const args = (cap.empty ? undefined : ip.eval_block(cap)) ?? cap;
      return call(ip, receiver, args, at);
    } },
  ];

  function externals(ip: Interpreter): void {
    for (const ext of EXTERNALS) {
      if (ext.pattern !== undefined) continue;
      const node = ip.BASE.method(ext.name, ext.fn, ...(ext.flags ?? []));
      if (node.has_flag('right-to-left') && !node.has_flag('left-to-right')) ip.rtl_names.add(ext.name);
    }
    ip.class_node('H').flag('highlight');
  }


}


namespace CLI {
  export type Args = [args: string[], kwargs: Record<string, string | true | (string | true)[]>];

  export interface Option { description?: string; value?: boolean; alias?: string; }
  export type Spec = Record<string, Option>;

  export function help(spec: Spec): string {
    const rows: [string, string][] = Object.entries(spec).map(([name, opt]) =>
      [`  ${opt.alias ? `-${opt.alias}, ` : '    '}--${name}${opt.value ? ' <value>' : ''}`, opt.description ?? '']);
    const width = Math.max(0, ... rows.map(([flags]) => flags.length));
    return [`Ether.ray ${env.version.toString()}`, 'Options:', ...rows.map(([flags, d]) => d ? `${flags.padEnd(width)}  ${d}` : flags)].join('\n');
  }
}

export interface Diagnostic {
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' | 'trace';
  node?: Text.Node;
  message: string;
}

const c = {
  reset:     '\x1b[0m',
  gray:      '\x1b[90m',
  dark_gray: '\x1b[2;90m',
}
const theme: Record<string, string> = { namespace: '\x1b[38;2;154;134;253m', type: '\x1b[38;2;154;134;253m', class: '\x1b[38;2;154;134;253m', enum: '\x1b[38;2;154;134;253m', interface: '\x1b[38;2;154;134;253m', struct: '\x1b[38;2;154;134;253m', typeParameter: '\x1b[38;2;154;134;253m', parameter: '\x1b[38;2;196;185;254m', variable: '\x1b[38;2;196;185;254m', property: '\x1b[38;2;196;185;254m', enumMember: '\x1b[38;2;255;204;153m', event: '\x1b[38;2;154;134;253m', function: '\x1b[38;2;154;134;253m', method: '\x1b[38;2;154;134;253m', macro: '\x1b[38;2;154;134;253m', keyword: '\x1b[38;2;108;103;131m', modifier: '\x1b[38;2;108;103;131m', comment: '\x1b[38;2;108;103;131m', string: '\x1b[38;2;255;204;153m', number: '\x1b[38;2;255;204;153m', regexp: '\x1b[38;2;255;204;153m', operator: '\x1b[38;2;171;179;191m', decorator: '\x1b[38;2;255;204;153m' };

export const DIAGNOSTIC_SEVERITY: Record<Diagnostic['level'], number> = { trace: 0, debug: 1, info: 2, warning: 3, error: 4, fatal: 5 };
export class Diagnostics {
  items: Map</*location:*/ Text.Source | undefined, Map<Ray.Expression | undefined, Diagnostic[]>> = new Map();

  expression?: Ray.Expression;
  expressions = new Map<string | undefined, Map<number, Ray.Expression>>();
  expression_at(src: Text.Source, begin: number, end: number, parent?: Ray.Expression): Ray.Expression {
    let map = this.expressions.get(src.path);
    if (!map) this.expressions.set(src.path, map = new Map());
    let e = map.get(begin);
    if (!e) map.set(begin, e = new Ray.Expression(src, begin, end, parent));
    return e;
  }

  program?: Ray.Program

  private start = performance.now();

  constructor(public level: Diagnostic['level'] = 'info') {}

  *all(filter?: (x: Diagnostic) => boolean): IterableIterator<Diagnostic> {
    for (const arr of this.items.values()) { for (const [, elements] of arr) { for (const element of elements) { if (filter ? filter(element) : true) yield element; } } }
  }
  *get(src: Text.Source): IterableIterator<Diagnostic> { for (const arr of this.items.get(src).values()) { yield* arr; } }

  is_visible(level: Diagnostic['level']): boolean { return DIAGNOSTIC_SEVERITY[level] >= DIAGNOSTIC_SEVERITY[this.level]; }

  get empty() { return [...this.items.keys()].length === 0 }
  get has_errors(): boolean { return [...this.errors].length > 0 }
  get errors() { return this.all(x => DIAGNOSTIC_SEVERITY[x.level] >= DIAGNOSTIC_SEVERITY['error'])}
  get warnings() { return this.all(x => x.level === 'warning')}

  forget(src: Text.Source | Iterable<Text.Source> | undefined) {
    if (src != null && Symbol.iterator in src) { for (const element of src) { this.forget(element) }; return; }
    this.items.delete(src as Text.Source | undefined);
    this.expressions.delete((src as Text.Source | undefined)?.path);
  }
  forget_all(srcs: Iterable<Text.Source>) { this.forget(srcs); }

  print() {
    if (this.empty) return;

    const exec_time = performance.now() - this.start;
    const print_start = performance.now();

    const header_of = (src?: Text.Source) => src ? (this.program?.project_header(src) ?? src.location) : undefined;
    const group = <T>(items: Iterable<T>, key: (t: T) => string | undefined): Map<string | undefined, T[]> => {
      const m = new Map<string | undefined, T[]>();
      for (const t of items) { const h = key(t); let g = m.get(h); if (!g) m.set(h, g = []); g.push(t); }
      return m;
    };

    for (const [header, srcs] of group(this.items.keys(), header_of)) {
      if (header) console.error(`${Diagnostics.levelColor.info}${header}${c.reset}`);
      for (const src of srcs) if (src !== undefined) this.print_lines_of(src);
    }

    let first = true;
    for (const [header, entries] of group(this.all(), e => header_of(e.node?.source))) {
      if (!first) console.error('');
      if (header) console.error(`${Diagnostics.levelColor.info}${header}${c.reset}`);
      first = false;
      for (const entry of entries) this.print_diagnostic(entry);
    }

    const parts: string[] = []
    const count = (level: Diagnostic['level'], entries: Iterable<Diagnostic>) => { const count = [...entries].length; if (count !== 0) parts.push(`${Diagnostics.levelColor[level]}${count} ${level}${count > 1 ? 's' : ''}${c.reset}`); }
    
    count('error', this.errors); count('warning', this.warnings)
    parts.push(`${c.gray}${exec_time.toFixed(2)}ms${c.reset} ${c.dark_gray}+ ${(performance.now() - print_start).toFixed(2)}ms print${c.reset}`)
    console.error(`\n  ${parts.join(`${c.gray}, ${c.reset}`)}`)
  }
  print_lines_of(src: Text.Source) {
    console.error(`${c.gray}${src.location ? src.location : `unknown location`}${c.reset}`);

    let entry_i = 0;
    const entries = [...this.get(src)].filter(x => x.node).sort((a, b) => a.node.cursor - b.node.cursor)

    const line_number_width = String(src.newlines.length + 1).length;
    for (const [line, i] of src.lines) {
      const visibile: Diagnostic[] = [];
      while (entry_i < entries.length && entries[entry_i].node.cursor <= line.end) {
        const entry = entries[entry_i];
        if (entry.node.cursor >= line.begin) visibile.push(entry);
        entry_i++;
      }

      if (visibile.length === 0) continue;

      const annotate = (group: { col: number; entries: Diagnostic[] }[], before: boolean) => {
        if (group.length === 0) return;
        const gutter = ' '.repeat(line_number_width + 1);
        const cols = (env.nodejs && process.stdout.columns) || 80;
        const pipe = `${c.gray}|${c.reset}`;
        const ANSI = /\x1b\[[0-9;]*m/g;
        const plain = (s: string) => s.replace(ANSI, '');

        const wrapPlain = (text: string, width: number): string[] => {
          if (width < 10 || text.length <= width) return [text];
          const out: string[] = [];
          let cur = '';
          for (const word of text.split(' ')) {
            const next = cur ? `${cur} ${word}` : word;
            if (next.length > width && cur) { out.push(cur); cur = word; } else cur = next;
          }
          if (cur) out.push(cur);
          return out;
        };
        const wrap = (s: string, width: number): { text: string; len: number }[] => {
          const chars: { ch: string; color: string }[] = [];
          let color = '', last = 0;
          for (const m of s.matchAll(ANSI)) {
            for (let k = last; k < m.index; k++) chars.push({ ch: s[k], color });
            color = m[0] === c.reset ? '' : m[0];
            last = m.index + m[0].length;
          }
          for (let k = last; k < s.length; k++) chars.push({ ch: s[k], color });
          const paint = (cs: typeof chars) => {
            let out = '', cur = '';
            for (const x of cs) { if (x.color !== cur) out += (cur = x.color) || c.reset; out += x.ch; }
            return cur ? out + c.reset : out;
          };
          let pos = 0;
          return wrapPlain(plain(s), width).map((pl, li, all) => {
            const piece = { text: paint(chars.slice(pos, pos + pl.length)), len: pl.length };
            pos += pl.length + (li < all.length - 1 && chars[pos + pl.length]?.ch === ' ' ? 1 : 0);
            return piece;
          });
        };

        const draw = (items: { col: number; text?: string; len?: number }[]): string => {
          let line = gutter, pos = 0;
          for (const it of [...items].sort((a, b) => a.col - b.col)) {
            if (it.col < pos) continue;
            line += ' '.repeat(it.col - pos);
            if (it.text === undefined) { line += pipe; pos = it.col + 1; }
            else { line += it.text; pos = it.col + (it.len ?? 0); }
          }
          return line;
        };

        const lines: string[] = [];
        group.forEach((g, i) => {
          const through = before ? group.slice(0, i) : group.slice(i + 1);
          if (!before) lines.push(draw(group.slice(i)));
          else if (through.length) lines.push(draw(through));
          const right = [...through].sort((a, b) => a.col - b.col).find(r => r.col > g.col);
          const full = cols - gutter.length - g.col;
          const gap = right ? right.col - g.col - 1 : full;
          const width = Math.max(gap >= 30 ? gap : full, 10);
          for (const e of g.entries)
            for (const ln of wrap(this.format(e), width))
              lines.push(draw([...through, { col: g.col, ...ln }]));
        });
        if (before) lines.push(draw(group));

        let prev: string | undefined;
        for (const line of lines) {
          if (prev !== undefined) {
            if (line === prev) continue;
            const p = plain(line);
            if (/^[\s|]*$/.test(p) && p.includes('|') && [...p].every((ch, k) => ch !== '|' || plain(prev!)[k] === '|')) continue;
          }
          console.error(line);
          prev = line;
        }
      }
      const highlight = (): string => {
        const segments = info.flatMap(({ entries }) => {
          const worst = entries.reduce((a, b) =>
            DIAGNOSTIC_SEVERITY[b.level] > DIAGNOSTIC_SEVERITY[a.level] ? b : a
          );
          worst.node.color = Diagnostics.levelColor[worst.level] ?? c.gray;
          return worst.node.segments;
        });
        const text = line.string;
        const chars: (string | undefined)[] = new Array(text.length).fill(undefined);
        for (const s of segments) {
          if (!s.color) continue;
          for (let k = Math.max(s.begin - line.begin, 0); k <= Math.min(s.end - line.begin, text.length - 1); k++) chars[k] = s.color;
        }
        let colored = '', current: string | undefined;
        for (let k = 0; k < text.length; k++) {
          const color = chars[k] ?? c.gray;
          if (color !== current) { colored += color; current = color; }
          colored += text[k];
        }
        return colored;
      }
      
      const info = [...Map.groupBy(visibile, entry => entry.node.cursor - line.begin)].map(([col, entries]) => ({ col, entries }));
      const above = info.filter((_, i) => i % 2 === 1).reverse().sort((a, b) => b.col - a.col);
      const below = info.filter((_, i) => i % 2 === 0);

      annotate(above, true)
      console.error(`${c.gray}${String(i + 1).padStart(line_number_width)} ${c.reset}${highlight()}${c.reset}`);
      annotate(below, false)
      console.error('')
    }
  }
  print_diagnostic(entry: Diagnostic) {
    if (entry.level === 'fatal') { console.error(''); console.error(this.format(entry)); return; }
    console.error(`${c.gray}${entry.node?.source?.location ? `${entry.node?.source?.location}:${entry.node.line}:${entry.node.col}` : `unknown location`}${c.reset}`);
    console.error(`  ${this.format(entry)}`);
  }

  format(entry: Diagnostic): string { return `${Diagnostics.levelColor[entry.level]}${entry.level}${c.reset} ${entry.message}${c.gray} [${env.version.toString()}]${c.reset}`; }

  report(entry: Diagnostic, expression?: Ray.Expression) {
    if (!this.is_visible(entry.level)) return;
    
    const source = entry.node?.source;
    let expr = this.items.get(source);
    if (!expr) { expr = new Map(); this.items.set(source, expr); }
    let expr_diagnostics = expr.get(expression)
    if (!expr_diagnostics) { expr_diagnostics = []; expr.set(expression, expr_diagnostics); }

    if (entry.level === 'error' && expr_diagnostics.filter(x => x.level === 'error').length > 0) return;

    expr_diagnostics.push(entry);
    
    if (entry.level === 'fatal') return this.exit();
  }

  exit(): never {
    this.print();
    if (env.nodejs) return process.exit(1);
    throw new Error('fatal diagnostic');
  }

  static levelColor: Record<Diagnostic['level'], string> = {
    fatal:   '\x1b[1;31m',
    error:   '\x1b[1;31m',
    warning: '\x1b[1;33m',
    info:    '\x1b[34m',
    debug:   '\x1b[32m',
    trace:   '\x1b[90m',
  }
}

export class Version {
  static readonly letter = 'E';

  static MONTH_LETTERS = 'ABCDEFGHIJKL';

  constructor(
    public readonly major: number,
    public readonly year: number,
    public readonly yearsSinceRelease: number,
    public readonly month: number,
    public readonly index: number,
  ) {}

  get monthLetter(): string { return Version.MONTH_LETTERS[this.month - 1]; }
  private get tail(): string { return `${this.year}.${this.yearsSinceRelease}${this.monthLetter}.${this.index}`; }

  toString(): string { return `${this.major}.${Version.letter}${this.tail}`; }

  toSemver(opts?: { scheme?: boolean }): string {
    const base = `${this.major}.${this.yearsSinceRelease * 12 + this.month}.${this.index}`;
    return opts?.scheme ? `${base}-${Version.letter}${this.tail}` : base;
  }

  static parse(version: string): Version {
    const m = /^(\d+)\.E(\d+)\.(\d+)([A-L])\.(\d+)$/.exec(version.trim());
    if (!m) throw new Error(`Version: cannot parse "${version}"`);
    const [, major, year, yearsSinceRelease, monthLetter, index] = m;
    return new Version(+major, +year, +yearsSinceRelease, Version.MONTH_LETTERS.indexOf(monthLetter) + 1, +index);
  }
  static tryParse(version: string): Version | null {
    try { return Version.parse(version); } catch { return null; }
  }
  static create(major: number, releaseDate: string, index: number): Version {
    const release = new Date(releaseDate);
    const now = new Date();
    const monthsTotal = Math.max(0,
      (now.getFullYear() - release.getFullYear()) * 12 + (now.getMonth() - release.getMonth()));
    return new Version(
      major,
      Math.max(now.getFullYear(), release.getFullYear()),
      Math.floor(monthsTotal / 12),
      monthsTotal % 12 + 1,
      index,
    );
  }
}

export class env {
  static get nodejs(): boolean { return typeof process !== 'undefined' && (process as any).versions?.node; }
  static get is_main_entrypoint() { return env.nodejs && process.argv[1] !== undefined && import.meta.url === env.url.pathToFileURL(process.argv[1]).href }

  static cli_args(spec: CLI.Spec = {}): CLI.Args {
    const args: string[] = [];
    const kwargs: Record<string, string | true | (string | true)[]> = {};
    const add = (key: string, value: string | true): void => {
      const existing = kwargs[key];
      kwargs[key] = existing === undefined ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
    };
    const resolve = (name: string): [string, CLI.Option | undefined] => {
      if (spec[name]) return [name, spec[name]];
      const found = Object.entries(spec).find(([, opt]) => opt.alias === name);
      return found ? [found[0], found[1]] : [name, undefined];
    };
    const tokens = env.nodejs ? process.argv.slice(2) : [];
    let operands = false;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!operands && token === '--') { operands = true; continue; }
      if (operands || token === '-' || !token.startsWith('-')) { args.push(token); continue; }
      const eq = token.indexOf('=');
      const attached = eq === -1 ? undefined : token.slice(eq + 1);
      if (token.startsWith('--')) {
        const [key, opt] = resolve(eq === -1 ? token.slice(2) : token.slice(2, eq));
        add(key, attached ?? (opt?.value ? tokens[++i] ?? true : true));
      } else {
        const names = eq === -1 ? token.slice(1) : token.slice(1, eq);
        for (let j = 0; j < names.length; j++) {
          const [key, opt] = resolve(names[j]);
          if (opt?.value) { add(key, names.slice(j + 1) || attached || tokens[++i] || true); break; }
          add(key, j === names.length - 1 ? attached ?? true : true);
        }
      }
    }
    return [args, kwargs];
  }

  private static _require: NodeRequire | undefined;
  static import<T>(name: string, cached?: T | undefined): T {
    if (cached !== undefined) return cached;
    if (!env.nodejs)
      throw new Error(`Module '${name}' is only available in a Node.js environment.`);
    try {
      if (!env._require) {
        if (typeof require === 'function') env._require = require;
        else env._require = (process as any).getBuiltinModule('module').createRequire(import.meta.url);
      }
      return env._require!(name);
    } catch (e) { throw new Error(`Failed to load Node.js module '${name}': ${(e as Error).message}`); }
  }

  private static _fs: typeof import('fs') | undefined;
  private static _path: typeof import('path') | undefined;
  private static _url: typeof import('url') | undefined;
  static get fs(): typeof import('fs') { return env._fs ??= env.import('fs', env._fs); }
  static get path(): typeof import('path') { return env._path ??= env.import('path', env._path); }
  static get url(): typeof import('url') { return env._url ??= env.import('url', env._url); }

  private static _manifest?: string[];
  static get manifest(): string[] {
    if (env._manifest) return env._manifest;
    try { 
      const manifest_file = './bundled.ts';
      const manifest = env.import<{ manifest: string[] }>(manifest_file).manifest; 
      if (!manifest.length) throw new Error(`Couldn't find any entries in the manifest (a file in '${manifest_file}'), this is an error on the side of the developer or you didn't create a bundle, see the original repository for how that is done.`);
      return env._manifest = manifest;
    }
    catch { return env._manifest = []; }
  }

  static variable(name: string): string | undefined {
    const value = env.nodejs ? process.env[name] : (globalThis as any)[name];
    return value === undefined || value === null ? undefined : String(value);
  }

  static file(location: string): Source { return new Text.Source(location); }
  static directory(location: string, options: { recursively?: boolean, filter?: (x: string) => boolean }): Source[] {
    location = location.replace(/\/$/, '')
    if (!env.nodejs) {
      const prefix = location + '/';
      return env.manifest
        .filter(entry => entry.startsWith(prefix))
        .filter(entry => options.recursively || !entry.slice(prefix.length).includes('/'))
        .filter(entry => options.filter ? options.filter(entry) : true)
        .map(env.file);
    }

    const locations: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of env.fs.readdirSync(env.path.join(env.root, dir), { withFileTypes: true })) {
        const entry_path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) { if (options.recursively) walk(entry_path); continue; }
        if (options.filter && !options.filter(entry_path)) continue;
        locations.push(entry_path);
      }
    };
    walk(location);
    return locations.map(env.file);
  }
  static at(location: string, options: { recursively?: boolean, filter?: (x: string) => boolean } = {}): Source[] {
    location = location.replace(/\/$/, '')
    const is_file = env.nodejs
      ? env.fs.statSync(env.path.join(env.root, location)).isFile()
      : env.manifest.includes(location);
    return is_file ? [env.file(location)] : env.directory(location, options);
  }

  static get version() { return Version.create(version[0], version[1], version[2]) }

  private static _root?: string;
  static get root(): string {
    if (env._root) return env._root;
    const { fs, path } = env;
    const root = ['@ether', '$', '.ray']
    const language_dir = (dir: string) => path.join(dir, ...root);
    let dir = process.cwd();
    while (!fs.existsSync(language_dir(dir)) && path.dirname(dir) !== dir) dir = path.dirname(dir);
    if (fs.existsSync(language_dir(dir))) return env._root = dir;
    dir = path.resolve(import.meta.dirname, '..'); if (fs.existsSync(language_dir(dir))) return env._root = dir;
    dir = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..'); if (fs.existsSync(language_dir(dir))) return env._root = dir;

    throw new Error(`Couldn't find a language definition on your system. Expected one in the hierarchy of your CWD, in the package (production), or in the repository (development). Signature is a '${root.join('/')}' directory.`)
  }
}

if (env.is_main_entrypoint) await main(env.cli_args(cli));