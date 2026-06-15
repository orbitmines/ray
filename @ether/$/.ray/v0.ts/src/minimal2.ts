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

class Representation {

}

class Expression {
  
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

namespace Text {
  export class Node extends Global.Node {
    constructor(public source: Text.Source) { super(); }

    cursor: number = 0;
    selection: number[] = [];

    color?: string

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
    get text(): string { return this.value; }                 // engine alias → value
    get path(): string | undefined { return this.location; }  // engine alias → location

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

export namespace Ray {
  export const EXTENSION = '.ray'

  export async function load_file(location: string): Promise<Source> { const s = new Text.Source(location); await s.load(); return s; }
  export async function load_project(location: string): Promise<Source[]> { return env.directory(location, { recursively: true, filter: x => x.endsWith(EXTENSION) }); }

  export function v0(diagnostics: Diagnostics) {
    return new Program(diagnostics, interpreter => {

    })
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

    // engine driver state
    grammar = new Grammar();
    sources: Source[] = [];
    private touched = new Map<string, string>();
    reloaded: (src: Source) => void = () => {};
    private generation = 0;
    private priority: string[] = [];
    private active = new Set<string>();
    get abstract_blocks(): boolean { return this.abstractly; }

    constructor(public diagnostics: Diagnostics, public initialize_interpreter: (interpreter: Interpreter) => void) { diagnostics.program = this; }

    project_of(src: Source): Project | undefined {
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
          const interpreter = new Interpreter(this.grammar, new Log(this.diagnostics)); this.initialize_interpreter(interpreter)
          this.projects.push(project = new Project(this, src.is_dot_project ? src : ((directory: string): Source => {
            const dot = new Text.Source();
            dot.location = `${directory}/.project${EXTENSION}`;
            dot.value = '';
            return dot;
          })(directory), interpreter));
        }
        if (src.is_dot_project) project.dot_project = src;
        if (!project.source.includes(src)) project.source.push(src);
      };
      
      for (const src of srcs) home(src);
      
      if (srcs.some(x => x.is_dot_project)) {
        // a new `.project.ray` carved inside an existing project pulls its files in
        for (const project of [...this.projects]) for (const src of [...project.source])
          if (project_directory_of(src) !== project.directory) { project.source.splice(project.source.indexOf(src), 1); home(src); }
        this.projects = this.projects.filter(project => project.source.length > 0);
      }
      return this;
    }
    
    private async pass(order: Source[], opts: { log?: Log; generation?: number; scope?: (rule: Rule) => boolean; files?: Set<string> } = {}): Promise<Interpreter | undefined> {
      if (opts.files) this.grammar.reset_files(opts.files);
      else this.grammar.reset(opts.scope);
      const ip = new Interpreter(this.grammar, opts.log);
      ip.abstract_blocks = this.abstract_blocks;
      externals(ip);
      ip.install();
      // one batched forget — the file-less bucket and every file this pass
      // reparses — instead of a quadratic per-file cache rebuild
      if (opts.log) ip.log.forget_all([{ text: '' }, ...order]);
      for (const src of order) {
        ip.parse(src);
        if (opts.log) {
          for (const issue of this.grammar.issues)
            if (src.path !== undefined && issue.at?.src?.path === src.path) ip.log.error(issue.message, issue.at);
          this.reloaded(src);
        }
        if (opts.generation !== undefined) {
          await new Promise<void>(resolve => typeof setImmediate === 'function' ? setImmediate(resolve) : setTimeout(resolve, 0));
          if (this.generation !== opts.generation) return undefined;
        }
      }
      if (opts.log) for (const issue of this.grammar.issues)
        if (issue.at?.src?.path === undefined) ip.log.error(issue.message, issue.at);
      return ip;
    }

    // fixpoint: discovery → probe (all discovered rules on, so mutual
    // suppressions collide; repeat only while new rules turn up) → final.
    // A FULL cycle re-derives the grammar from the seed alone (Grammar.clear),
    // so the outcome is deterministic for the current sources — disabled rules
    // and their issues come back only if the grammar still produces them.
    //
    // Rules are PROJECT-bound, so a grammar change in one project cannot
    // change how any other project parses — and within the suspect projects
    // the cycle is FILE-incremental: a rule can only change a file whose text
    // contains one of its edge literals. Starting from the files edited since
    // the last settled cycle, the fixpoint runs over just those (plus the
    // language, which bootstraps every fresh interpreter), the result is
    // diffed against the settled existence/bodies, and files containing a
    // drifted rule's edge join the set — until nothing more drifts. Every
    // other file keeps its sightings, its diagnostics and its frozen
    // existence: for it, nothing changed. Undefined when a live edit
    // preempted the cycle.
    private async cycle(opts: { log?: Log; generation?: number; scope?: Set<string> | 'all' } = {}): Promise<Interpreter | undefined> {
      const scoped = opts.scope instanceof Set ? opts.scope : undefined;
      const covers = (project?: string): boolean => !scoped || project === undefined || scoped.has(project);
      const inside = (src: Source): boolean => this.grammar.language(src) || covers(this.grammar.project(src));
      const rule_scope = (rule: Rule): boolean => covers(rule.project);
      const all = this.prioritized().filter(inside);

      // circularity in scope (disabled rules, grammar issues) means sighting
      // attribution is trajectory-dependent — only the from-seed derivation is
      // deterministic there. The file-incremental fast path is for the common
      // case: every rule's aliveness settled by plain live definitions.
      const tangled = (): boolean =>
        this.grammar.issues.some(i => i.at?.src !== undefined && inside(i.at.src))
        || [...this.grammar.rules.values()].some(rule => rule_scope(rule) && rule.disabled);

      const files_of = (order: Source[]): Set<string> =>
        new Set(order.map(src => src.path).filter((p): p is string => p !== undefined));

      // the fixpoint pipeline over a parse set. Probes force the dead rules
      // back on so mutual suppressions collide — but only the CONTINGENT ones:
      // a rule whose every sighting is consumed by a rule that is itself
      // settled alive (a live definition somewhere) can never exist, and
      // forcing it on would have it eat the whole pass for an analysis whose
      // verdict cannot change.
      const pipeline = async (order: Source[], reset: { files?: Set<string>; scope?: (rule: Rule) => boolean }): Promise<Interpreter | undefined> => {
        let ip = await this.pass(order, { generation: opts.generation, ...reset });
        if (!ip) return undefined;
        let moving = this.grammar.analyze(rule_scope);
        for (let i = 0; i < 3; i++) {
          let probing = false;
          for (const rule of this.grammar.rules.values()) {
            if (!rule_scope(rule) || rule.disabled || rule.exists) continue;
            const contingent = rule.definitions.some(d =>
              d.seen instanceof Rule && !d.seen.disabled && !d.seen.definitions.some(x => x.seen === 'live'));
            if (contingent) { rule.exists = true; probing = true; }
          }
          if (!probing && !moving) break;
          ip = await this.pass(order, { generation: opts.generation, ...reset });
          if (!ip) return undefined;
          moving = this.grammar.analyze(rule_scope);
        }
        return ip;
      };

      // the final pass carries the log; afterwards existence settles on its
      // own sightings (a trajectory-bistable rule re-records its definitions
      // there, and a snapshot against older sightings would read as phantom
      // drift on every later incremental cycle), then the verdicts become the
      // new settled state
      const settle = (final: Interpreter): Interpreter => {
        this.remember(covers);
        for (const [path, project] of [...this.touched]) if (covers(project)) this.touched.delete(path);
        // the cycle's interpreter is the derivation. The language project keeps
        // it; every dependent gets an isolated copy() of it (the aggregate) so
        // alterations can't cross the boundary — language2's per-project ecosystem
        if (!scoped) for (const project of this.projects)
          project.interpreters.set(project, project === this.default_language ? final : final.copy());
        return final;
      };
      const finish = async (order: Source[], reset: { files?: Set<string>; scope?: (rule: Rule) => boolean }): Promise<Interpreter | undefined> => {
        const reported = this.grammar.issues.length;
        const final = await this.pass(order, { log: opts.log, generation: opts.generation, ...reset });
        if (!final) return undefined;
        this.grammar.analyze(rule_scope);
        // the settling analysis can surface circularity issues the final pass
        // couldn't know yet (it reports per file as it parses) — they must
        // still reach the log, and their files must publish again
        if (opts.log) {
          const republish = new Set<Source>();
          for (const issue of this.grammar.issues.slice(reported)) {
            if (issue.at?.src?.path === undefined) continue;
            final.log.error(issue.message, issue.at);
            const src = order.find(s => s.path === issue.at!.src!.path);
            if (src) republish.add(src);
          }
          for (const src of republish) this.reloaded(src);
        }
        return settle(final);
      };

      // from seed: deterministic — lands exactly where a fresh boot of these
      // sources would
      const derive = async (): Promise<Interpreter | undefined> => {
        // when nothing was edited (membership shifts only), the current
        // verdicts ARE the settled fixpoint: one pass with the log is the
        // whole derivation — verify with the analysis, fall back if it moved
        if (this.settled.size && !this.touched.size) {
          const optimistic = await this.pass(all, { log: opts.log, generation: opts.generation, scope: rule_scope });
          if (!optimistic) return undefined;
          this.grammar.analyze(rule_scope);
          if (!this.drifted(covers).length) return settle(optimistic);
        }
        this.grammar.issues = this.grammar.issues.filter(i => i.at?.src !== undefined && !inside(i.at.src));
        this.grammar.clear(rule_scope);
        if (!await pipeline(all, { scope: rule_scope })) return undefined;
        return finish(all, { scope: rule_scope });
      };

      // circularity needs the from-seed derivation; so does everything wider
      // than a project scope
      if (!scoped || tangled()) return derive();

      // file-incremental: start from the edited files and grow by which rules
      // drifted from the settled state — a rule can only change a file whose
      // text contains ALL of its edge literals. When the start already covers
      // the project (a freshly loaded one), the from-seed derivation IS the
      // increment.
      let affected = all.filter(src => this.grammar.language(src) || (src.path !== undefined && this.touched.has(src.path)));
      if (affected.length >= all.length) return derive();
      for (let round = 0; ; round++) {
        if (!await pipeline(affected, { files: files_of(affected) })) return undefined;
        // a wide drift reaches everything anyway — testing thousands of edge
        // conjunctions against every file costs more than parsing them
        let edges = round < 16 ? this.drifted(covers) : null;
        if (edges !== null && edges.length > 32) edges = null;
        const have = new Set(affected.map(src => src.path));
        const expansion = all.filter(src => !have.has(src.path) && (
          edges === null
          || edges.some(need => need.every(edge => src.text.includes(edge)))
          || this.grammar.issues.some(i => i.at?.src?.path === src.path)));
        if (expansion.length) { affected = [...affected, ...expansion]; continue; }
        // the edit dragged the scope into circularity — only the from-seed
        // derivation is sound there
        if (tangled()) return derive();
        const final = await finish(affected, { files: files_of(affected) });
        if (!final) return undefined;
        // the settling analysis ran after that check — circularity surfacing
        // only now means the incremental run picked one of an ambiguous
        // fixpoint's readings: re-derive from seed so the session lands
        // exactly where a fresh start would
        if (tangled()) return derive();
        return final;
      }
    }

    // the settled grammar — existence, body and edge literals per rule key as
    // of the last completed cycle. The incremental expansion diffs against
    // this, so aborted cycles can't skew what counts as "changed".
    private settled = new Map<string, { project?: string; exists: boolean; disabled: boolean; body: string; edges: string[] }>();

    private remember(covers: (project?: string) => boolean): void {
      for (const [key, was] of [...this.settled])
        if (covers(was.project) && !this.grammar.rules.has(key)) this.settled.delete(key);
      for (const [key, rule] of this.grammar.rules) {
        if (!covers(rule.project)) continue;
        this.settled.set(key, {
          project: rule.project,
          exists: rule.exists,
          disabled: rule.disabled,
          body: rule.body?.text ?? '',
          edges: [rule.anchor, rule.tail].filter((e): e is string => e !== undefined),
        });
      }
    }

    // the edge literals of every rule whose existence, disabledness or body no
    // longer matches the settled state — including rules that vanished. One
    // entry per rule: it can only match where ALL its edge literals occur
    // (most selective first, so a reach test fails fast).
    private drifted(covers: (project?: string) => boolean): string[][] {
      const needs: string[][] = [];
      const seen = new Set<string>();
      const need = (edges: string[]): void => {
        if (!edges.length) return;
        const sorted = [...edges].sort((a, b) => b.length - a.length);
        const key = sorted.join(' ');
        if (!seen.has(key)) { seen.add(key); needs.push(sorted); }
      };
      for (const [key, rule] of this.grammar.rules) {
        if (!covers(rule.project)) continue;
        const was = this.settled.get(key);
        if (was && was.exists === rule.exists && was.disabled === rule.disabled && was.body === (rule.body?.text ?? '')) continue;
        need([rule.anchor, rule.tail].filter((e): e is string => e !== undefined));
      }
      for (const [key, was] of this.settled) {
        if (!covers(was.project) || this.grammar.rules.has(key)) continue;
        need(was.edges);
      }
      return needs;
    }

    private prioritized(): Source[] {
      const rank = (src: Source): number =>
        this.grammar.language(src) ? 0
        : src.path !== undefined && this.priority.includes(src.path) ? 1
        : src.path !== undefined && this.active.has(src.path) ? 2 : 3;
      // `.project.ray` is project metadata (its `!language` marker), not code to parse
      return [...this.sources].filter(s => !s.path?.endsWith(`/.project${EXTENSION}`)).sort((a, b) => rank(a) - rank(b));
    }

    async exec(): Promise<Node> {
      // gather and load every project's marker + files
      this.sources = [];
      for (const project of this.projects) for (const s of [project.dot_project, ...project.source])
        if (!this.sources.includes(s)) this.sources.push(s);
      await Promise.all(this.sources.map(s => s.load()));

      this.default_language = this.projects.find(project => project.is_language)!;
      if (!this.default_language) return this.diagnostics.report({ level: 'fatal', message: "Expected to have recognized the string !language (the project defining the default language) on the first line in a .project.ray file, but it wasn't provided." }) as unknown as Node;

      // grammar setup: project membership, the seeded `{pattern} => body` shape
      // scoped to the language (re-declared in-language). Rule externals are
      // looked up directly from EXTERNALS by pattern when activated.
      this.grammar.survey(this.sources);
      const seed = new Text.Source(); seed.value = '{(String.Word | `{`, expr, `}`)[]}=>{body}';
      this.grammar.rule(span(seed, 0, seed.value.length), [], 'Node', this.grammar.language_project);

      // the fixpoint; diagnostics flow into this.diagnostics through the log
      const output = new Log(this.diagnostics);
      const ip = await this.cycle({ log: output });
      if (![...this.grammar.rules.values()].some(r => r.name === 'rule-definition' && r.project === undefined))
        ip!.log.error(`'${this.grammar.language_project ?? 'language project'}' did not declare the grammar-rule definition rule.`);

      return this.default_language.interpreter!.GLOBAL;
    }

  }

  export type Key = string | Node
  export type Args = { interpreter: Interpreter; self?: Node; method: Node; args: Node; at: Node; match?: Match }
  export type Method = (args: Args) => Node | undefined;

  // What a node currently stands for, beyond its span. The core only creates
  // forwards (an unresolved name) and reports the unconsumed ones — what
  // assignment/indexing/calling DO with a role is decided by the externals.
  export type Role =
    | { kind: 'forward'; name: string; on: Node }
    | { kind: 'slot'; on: Node; key: Key }
    | { kind: 'bound'; self: Node; method: Node };

  // language2's graph node, extended with the engine's state. A node is at once
  // a span of source (its `position`, a Text.Node), an object with methods
  // (`Key = string | Node` — pattern nodes are method keys, which is how
  // grammar is type-bound), and possibly a role. `begin`/`end` (exclusive, as
  // the engine reads them) and `src` are views over `position`.
  export class Node {
    methods?: Map<Key, Node>
    fn?: Method
    flags?: Set<string>
    position?: Text.Node
    role?: Role
    consumed = false

    constructor(public _super?: Node) {}

    // register a method on this node. A Rule registers as a grammar rule — it
    // is itself the key, with its behaviour as the value, so it is type-bound:
    // interpreting a value of this type sees it (`ruleset`). Any other key
    // registers a callable as a method node.
    method(key: Key, fn?: Method, ...flags: string[]): Node {
      if (key instanceof Rule) { this.set(key, key); return key; }
      const node = new Node(this);
      node.fn = fn;
      for (const f of flags) node.flag(f);
      this.set(key, node);
      return node;
    }
    set(key: Key, value: Node): void { (this.methods ??= new Map()).set(key, value); if (key instanceof Rule) this._rules = undefined; }
    // the grammar rules on this node, derived from its Rule-keyed methods
    private _rules?: Rule[];
    get ruleset(): readonly Rule[] { return this._rules ??= this.methods ? [...this.methods.keys()].filter((k): k is Rule => k instanceof Rule) : []; }
    get(key: Key): Node | undefined { return this.methods?.get(key); }
    flag(name: string): this { (this.flags ??= new Set()).add(name); return this; }
    has_flag(name: string): boolean { return !!this.flags?.has(name); }
    get sup(): Node | undefined { return this._super; }            // engine alias → _super
    set sup(v: Node | undefined) { this._super = v; }

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

  // Adapt a span Node into the Text.Node positions the display layer reads
  // (line/col, colored selections, per-file grouping, cascade dedup).
  const tsources = new WeakMap<object, Text.Source>();
  function tsource(src: Source): Text.Source {
    if (src instanceof Text.Source) return src;
    let t = tsources.get(src);
    if (!t) tsources.set(src, t = new Text.Source((src as any).text, (src as any).path));
    return t;
  }
  function position(at?: Node): Text.Node | undefined {
    if (!at?.src) return undefined;
    const n = new Text.Node();
    n.source = tsource(at.src);
    n.cursor = at.begin;
    if (at.end > at.begin) n.selection = [at.begin, at.end - 1];
    return n;
  }

  interface Issue { phase: string; message: string; at?: Node }

  // One styled span an H group painted, as a Text.Node the display layer reads
  // like any other node (inclusive `end`, as every node). `style` is the dotted
  // path after `H.`, `of` the rule's ledger key, `color` the terminal color
  // resolved at paint time (unset when `Log.coloring` is off, or the style has no
  // theme color).
  export class Painted extends Text.Node { style!: string; of?: string }

  // One expression — a span `expr()` reads. Canonical per file (one object per
  // start position, so a re-read or a sub-read of the same span reuses it),
  // linked under the expression it was read inside, expanding downward into its
  // subexpressions via `children`. `errored` is the cascade gate:
  // `Diagnostics.report` marks it on the first error/fatal and drops later
  // errors on the same expression as that first one propagating.
  export class Expression {
    children: Expression[] = [];
    errored = false;
    constructor(public src: Source, public begin: number, public end: number, public parent?: Expression) {
      parent?.children.push(this);
    }
  }

  // The engine's diagnostic facade over a language2 Diagnostics. error/info
  // route through `report(entry, expression)` so the per-expression cascade
  // dedup applies; painted spans (LSP semantic tokens) are kept here.
  export class Log {
    painted = new Map<string, Painted[]>();
    coloring = true;
    // the expression currently being read — error/info tag their diagnostic
    // with it so Diagnostics.report can dedup cascaded errors. Canonical per
    // (file, start), dropped when the file is forgotten.
    expression?: Expression;
    private expressions = new Map<string | undefined, Map<number, Expression>>();
    expression_at(src: Source, begin: number, end: number, parent?: Expression): Expression {
      let map = this.expressions.get(src.path);
      if (!map) this.expressions.set(src.path, map = new Map());
      let e = map.get(begin);
      if (!e) map.set(begin, e = new Expression(src, begin, end, parent));
      return e;
    }
    constructor(public diagnostics: Diagnostics = new Diagnostics()) {}
    error(message: string, at?: Node): void {
      this.diagnostics.report({ level: 'error', message, node: position(at) }, this.expression as any);
    }
    info(message: string, at?: Node): void {
      this.diagnostics.report({ level: 'info', message, node: position(at) }, this.expression as any);
    }
    paint(src: Source, begin: number, end: number, style: string, of?: string): void {
      if (src.path === undefined || end <= begin) return;
      const node = new Painted(tsource(src));
      node.selection = [begin, end - 1];
      node.style = style;
      node.of = of;
      if (this.coloring) node.color = theme[style.split('.')[0]];
      let spans = this.painted.get(src.path);
      if (!spans) this.painted.set(src.path, spans = []);
      spans.push(node);
    }
    // forget everything reported against these sources — a reload re-derives
    // them, including the per-file expression objects, so a stale "this
    // expression already errored" gate can't swallow the fresh diagnostics
    forget(src: Source): void {
      if (src instanceof Text.Source) this.diagnostics.forget(src);
      this.expressions.delete(src.path);
      if (src.path !== undefined) this.painted.delete(src.path);
    }
    forget_all(srcs: Iterable<Source>): void {
      for (const src of srcs) this.forget(src);
    }
    print(): void {
      if (this.diagnostics.has_errors && env.nodejs) process.exitCode = 1;
      this.diagnostics.print();
    }
  }

  // ─────────────────────────── patterns ───────────────────────────
  // A grammar rule's pattern is literals interleaved with captures, written as
  // `{...}` groups in the source. A capture's KIND is its extent — how far it
  // consumes — decided here, once, so the matcher is a plain switch. Its NAME is
  // its meaning: when a rule fires, `expr`/`args` captures are evaluated
  // eagerly, `block` stays a lazy program (abstractly evaluated where captured),
  // and `comment`/`string`/String-typed content is shadow-scanned for
  // suppressed rule definitions.
  //
  //   {`if `}        literal      the quoted text itself (quoting isn't built
  //                               in — a quote-like rule covers the content,
  //                               see Scan.literal_of)
  //   {x}{`)`}       until        anything up to the following literal piece
  //   {comment: String}  text     raw to end of line; `String` means nothing
  //                               nests inside (with a following literal it's
  //                               an `until` that scans raw)
  //   {block}        block        rest of the line plus deeper-indented lines
  //   {expr} {args}  expression   rest of the expression — open groups continue
  //                               it across lines (so do unnamed captures)
  //   {name}         word         a single word

  type Literal = { kind: 'literal'; text: string; style?: string; at?: number };
  type Piece = Literal | Capture;

  interface Capture {
    kind: 'until' | 'text' | 'block' | 'expression' | 'word';
    name?: string;
    type?: string;
    content: string;  // the raw `{...}` content, for unnamed/complex captures
    raw: boolean;     // String-typed: scan as plain text, nothing nests inside
    style?: string;
    at?: number;      // where the content sits in the source — what decoration evaluates
  }

  function is_literal(piece: Piece): piece is Literal { return piece.kind === 'literal'; }

  // What the scanners need from the active grammar at the position being read.
  // A Scan is DIRECTED: it reads `sign === 1` left-to-right or `sign === -1`
  // right-to-left, and every scanner below is written once against it. A
  // position handed to a scanner is a HEAD — the next unread position in
  // reading order; spans always come back in source order.
  interface Scan {
    text: string;
    sign: 1 | -1;
    // The far edge (inclusive, in reading order) of the span the active grammar
    // claims at the head `j` — a string, a balanced group, ... — or -1. This
    // recursion is what replaces hardcoded syntax knowledge.
    claim: (j: number) => number;
    // The literal text of a `{...}` group whose content is itself a quoted
    // literal under the active grammar (e.g. {`//`} via the string rule) —
    // and the rule that claims it (whose style is what such content shows as).
    literal_of: (begin: number, end: number) => { text: string; by: Rule } | undefined;
    // Near characters of the active rules in reading order (first characters
    // when reading right, last when reading left) — runs of other characters
    // can be skipped in bulk, nothing starts there.
    anchors: Set<string>;
    // Indentation of the line the current expression started on (blocks extend
    // over deeper-indented lines).
    indent?: number;
    // Whether this position starts a statement — the rule-definition shape only
    // applies there.
    start?: boolean;
  }

  function parse_pattern(text: string, begin: number, end: number, scan: Scan): Piece[] | null {
    const pieces: Piece[] = [];
    let literal_start = begin;
    let i = begin;
    const flush_literal = (upto: number): void => {
      if (upto > literal_start) pieces.push({ kind: 'literal', text: text.slice(literal_start, upto) });
    };
    while (i < end) {
      if (text[i] !== '{') { i++; continue; }
      const close = group_end(scan, i);
      if (close === -1) return null;
      flush_literal(i);
      pieces.push(read_group(scan, i + 1, close - 1));
      i = close;
      literal_start = i;
    }
    flush_literal(i);
    if (!pieces.length) return null;
    classify(pieces);
    return pieces;
  }

  // One `{...}` group's content, inferred from the rules: a quoted literal
  // under the active grammar, or a capture — `name` or `name: Type`, split at
  // a top-level `:` (the grammar hides quoted ones); names are arbitrary text.
  // The kind is provisional; classify() decides it once neighbours are known.
  function read_group(scan: Scan, begin: number, end: number): Piece {
    const content = scan.text.slice(begin, end);
    const quoted = scan.literal_of(begin, end);
    if (quoted !== undefined) return { kind: 'literal', text: quoted.text, at: begin };
    const colon = scan_to(scan, begin, ':');
    const split = colon !== -1 && colon < end;
    const name = (split ? scan.text.slice(begin, colon) : content).trim();
    return { kind: 'word', name: name || undefined, type: split ? scan.text.slice(colon + 1, end).trim() : undefined, content, raw: false, at: begin };
  }

  // Decide each capture's kind from its name/type and what follows it.
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

  // A rule's identity and its `external` contract: the pieces, spelled
  // canonically — a literal is its text, a capture is `{content}`. Bare and
  // quoted spellings of the same pattern are the same rule (`//{comment}` ≡
  // `{`//`}{comment}`), and styling drops out entirely: presentation never
  // changes identity.
  function pattern_key(pattern: Node, pieces: Piece[]): string {
    if (!pieces.length) return pattern.text.trim();
    return pieces.map(p => is_literal(p) ? p.text : `{${p.content}}`).join('');
  }

  // ─────────────────────────── scanning ───────────────────────────
  // Integers over the raw text; nodes only at boundaries. Each scanner is
  // written ONCE and runs in both directions, driven by the Scan's sign:
  // positions in and out are heads (next unread, in reading order), `+ sign`
  // steps ahead, and "the near end of a literal" is its first character
  // reading right, its last reading left.

  function line_end(text: string, i: number): number {
    const nl = text.indexOf('\n', i);
    return nl === -1 ? text.length : nl;
  }

  function line_begin(text: string, i: number): number {
    return text.lastIndexOf('\n', i - 1) + 1;
  }

  function indent_at(text: string, i: number): number {
    const line = text.lastIndexOf('\n', i - 1) + 1;
    let n = 0;
    while (text[line + n] === ' ') n++;
    return n;
  }

  // The character of `lit` a directed reader meets first.
  function near(sign: 1 | -1, lit: string): string {
    return sign === 1 ? lit[0] : lit[lit.length - 1];
  }

  // Does `lit` (written in source order) sit at the head `j` — its near end on
  // the head, the rest extending away in reading order?
  function lit_at(scan: Scan, j: number, lit: string): boolean {
    if (scan.text[j] !== near(scan.sign, lit)) return false;
    if (lit.length === 1) return true;
    const begin = scan.sign === 1 ? j : j - lit.length + 1;
    return begin >= 0 && scan.text.startsWith(lit, begin);
  }

  // Head of the next occurrence of `lit` in reading order (-1 when absent).
  // Searching on behalf of a capture spans lines, and a String-typed capture
  // searches the plain text (nothing nests inside it); the bare search (used
  // while parsing `{...}` pattern groups) stays on its line, with grammar
  // claims hiding quoted delimiters and nested groups.
  function scan_to(scan: Scan, from: number, lit: string, capture?: Capture): number {
    const { text, sign } = scan;
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
    const c0 = near(scan.sign, lit);
    let j = from;
    while (j >= 0 && j < text.length) {
      const c = text[j];
      if (c === c0 && lit_at(scan, j, lit)) return j;
      if (c === '\n' && !multiline) return -1;
      if (scan.anchors.has(c)) {
        const far = scan.claim(j);
        if (far !== -1) { j = far + sign; continue; }
      }
      j += sign;
      while (j >= 0 && j < text.length && text[j] !== c0 && text[j] !== '\n' && !scan.anchors.has(text[j])) j += sign;
    }
    return -1;
  }

  // End of a `{...}` group starting at j — quoted/nested braces are hidden by
  // grammar claims, not by counting. (Pattern syntax reads left-to-right.)
  function group_end(scan: Scan, j: number): number {
    const k = scan_to(scan, j + 1, '}');
    return k === -1 ? -1 : k + 1;
  }

  // Lines indented deeper than `indent`, starting at a '\n'. Blanks are
  // tentative — committed only when a deeper line follows, so a block never
  // trails into the gap before the next statement. (Blocks hang off the line
  // below — indentation only means anything read left-to-right.)
  function indented_end(text: string, at: number, indent: number): number {
    let end = at, j = at;
    while (j < text.length && text[j] === '\n') {
      let k = j + 1, spaces = 0;
      while (text[k] === ' ') { k++; spaces++; }
      if (k >= text.length) break;
      if (text[k] === '\n') { j = k; continue; }
      if (spaces <= indent) break;
      end = line_end(text, k);
      j = end;
    }
    return end;
  }

  // Exit head past the rest of the expression: to the line's edge, except where
  // a grammar claim spans further (an open group continues the expression).
  function expression_edge(scan: Scan, from: number): number {
    const { text, sign } = scan;
    let j = from;
    while (j >= 0 && j < text.length) {
      const c = text[j];
      if (c === '\n') break;
      if (scan.anchors.has(c)) {
        const far = scan.claim(j);
        if (far !== -1) { j = far + sign; continue; }
      }
      j += sign;
      while (j >= 0 && j < text.length && text[j] !== '\n' && !scan.anchors.has(text[j])) j += sign;
    }
    return j;
  }

  // Exit head past the word at the head `from` — a word ends at whitespace or
  // wherever the grammar starts meaning something else.
  function word_edge(scan: Scan, from: number): number {
    const { text, sign } = scan;
    let j = from;
    while (j >= 0 && j < text.length) {
      const c = text[j];
      if (c === ' ' || c === '\n') break;
      if (scan.anchors.has(c) && scan.claim(j) !== -1) break;
      j += sign;
    }
    return j;
  }


  // ─────────────────────────── matching ───────────────────────────

  // A match's span and captures, in source order regardless of the direction
  // it was matched in.
  interface Matched { begin: number; end: number; captures: { piece: Capture; begin: number; end: number }[] }

  // A successful match, with named access to its captures as span Nodes.
  class Match {
    constructor(public raw: Matched, private src: Source, private sup?: Node) {}
    get end(): number { return this.raw.end; }
    capture(name: string): Node | undefined {
      const c = this.raw.captures.find(c => c.piece.name === name);
      return c && span(this.src, c.begin, c.end, this.sup);
    }
  }

  // Match a rule's pieces from the head `at` in the scan's direction. The
  // pattern is written in source order; read the other way the pieces apply
  // last-to-first, leaning on `at` as the span's final character.
  function match_rule(rule: Rule, scan: Scan, at: number): Matched | null {
    // A rule is matchable in a direction only when it has a literal edge to
    // lean on at that side. A pattern that opens with a capture could match
    // ANYWHERE — an unanchored `{x: Expression}>` vacuums everything up to
    // some far `>` — so it never matches by itself; shapes like the rule
    // definition bring their own external matcher instead.
    if (!rule.edge(scan.sign)) return null;
    const { text, sign } = scan;
    const pieces = rule.pieces;
    let i = at;
    const captures: Matched['captures'] = [];
    for (let p = 0; p < pieces.length; p++) {
      const idx = sign === 1 ? p : pieces.length - 1 - p;
      const piece = pieces[idx];
      if (is_literal(piece)) {
        if (!lit_at(scan, i, piece.text)) return null;
        i += piece.text.length * sign;
        continue;
      }
      const entry = i;
      switch (piece.kind) {
        case 'until': {
          // up to the bounding literal piece — the pattern neighbor on the
          // reading side ('until' is only assigned when one follows in source
          // order, so reading the other way it may be missing: no match)
          const bound = pieces[idx + sign];
          if (!bound || !is_literal(bound)) return null;
          const k = scan_to(scan, i, bound.text, piece);
          if (k === -1) return null;
          i = k;
          break;
        }
        case 'block':
          // a block hangs off the line below — it cannot lean backward
          if (sign === -1) return null;
          i = indented_end(text, line_end(text, i), scan.indent ?? indent_at(text, at));
          break;
        case 'text':
          i = sign === 1 ? line_end(text, i) : line_begin(text, i + 1) - 1;
          break;
        case 'expression':
          i = expression_edge(scan, i);
          break;
        case 'word':
          i = word_edge(scan, i);
          if (i === entry) return null;
          break;
      }
      captures.push(sign === 1 ? { piece, begin: entry, end: i } : { piece, begin: i + 1, end: entry + 1 });
    }
    if (i === at) return null;
    return sign === 1 ? { begin: at, end: i, captures } : { begin: i + 1, end: at + 1, captures };
  }

  interface Recognized { pattern_begin: number; pattern_end: number; pieces: Piece[]; body_begin: number; body_end: number; end: number }

  // The `{pattern} => body` shape: at least one `{...}` group before a top-level
  // `=>` on the same line; body is rest-of-line (grammar claims may extend it
  // across lines) or, when empty, the deeper-indented block.
  function recognize(text: string, at: number, scan: Scan): Recognized | null {
    let saw_group = false, j = at;
    for (;;) {
      const c = text[j];
      if (c === undefined || c === '\n') return null;
      if (c === '{') {
        const close = group_end(scan, j);
        if (close === -1) return null;
        saw_group = true;
        j = close;
        continue;
      }
      if (c === '=' && text[j + 1] === '>') break;
      j++;
    }
    if (!saw_group) return null;
    let pattern_end = j;
    while (pattern_end > at && text[pattern_end - 1] === ' ') pattern_end--;
    if (pattern_end === at) return null;
    const pieces = parse_pattern(text, at, pattern_end, scan);
    if (!pieces) return null;
    let b = j + 2;
    while (text[b] === ' ') b++;
    const body_end = (b >= text.length || text[b] === '\n')
      ? indented_end(text, b, indent_at(text, at))
      : expression_edge(scan, b);
    return { pattern_begin: at, pattern_end, pieces, body_begin: b, body_end, end: Math.max(j + 2, body_end) };
  }

  // ───────────────────────────── rules ─────────────────────────────

  // A runtime implementation, in TS. Every external is a `name` and a `fn` (a
  // `Method`, like any node's). A WORD external (`=`, `static`, …) carries
  // `flags` and becomes a method on BASE keyed by its name. A RULE external
  // (`class …`, `({args})`, …) carries the `pattern` it answers to and, when its
  // shape can't be matched generically, a `match`; it sits inert in the grammar
  // registry until a .ray file activates it with `external <pattern>`.
  interface External {
    name: string;
    fn: Method;
    flags?: string[];
    pattern?: string;
    match?: (rule: Rule, scan: Scan, at: number) => Matched | null;
  }

  // Distribute a rule external onto the parsed rule: its `fn` becomes the rule's
  // behavior, its matcher and name its own fields.
  function activate(rule: Rule, ext?: External): void {
    if (!ext) return;
    rule.name = ext.name;
    rule.matcher = ext.match;
    rule.fn = ext.fn;
  }

  // One definition site of a rule. Per pass it is either seen 'live' (parsed as
  // an actual definition), seen inside a region some rule consumed (that Rule
  // suppresses it), or not seen at all.
  interface Definition { at: Node; seen?: 'live' | Rule }

  // Where a defining statement sits — `end` is patched once the statement has
  // been read to its extent (0 while still being read) — and the name of the
  // scope it was read in: a summoned re-evaluation must run back home.
  interface Site { src: Source; begin: number; end: number; on?: Node; home?: string }

  class Rule extends Node {
    definitions: Definition[] = [];
    body?: Node;
    // A runtime-implemented rule's name and matcher (from its `External`); its
    // behavior is the inherited `fn`. Plain (`.ray`-defined) rules have none.
    name?: string;
    matcher?: (rule: Rule, scan: Scan, at: number) => Matched | null;
    // The project this rule is bound to; undefined = everywhere (the language).
    project?: string;
    // its key in the grammar's ledger — how painted spans point back at it
    key?: string;
    // The H group a leading `H.group` put on the whole rule; `styled` is
    // whether any piece carries its own. Presentation only — not identity —
    // and it may arrive late: a pending decoration styles on a later pass.
    style?: string;
    styled: boolean;
    // Whether the rule currently exists, per the analysis. A rule whose only
    // definitions are suppressed doesn't.
    exists = true;
    // Errored by the analysis (circular). Still matches, as error recovery:
    // firing is a no-op, but consuming its regions keeps the one grammar error
    // from cascading into unresolved-token noise.
    disabled = false;
    // Anchored: starts with a literal — rejectable on one character, and safe to
    // use as a grammar claim (it can't match "anywhere"). Delimited: ends with a
    // literal — its extent is closed, so scanning can skip the span it claims.
    // `anchor`/`tail` are those edge literals; `edge(sign)` is whichever of the
    // two a directed reader meets first.
    readonly anchored: boolean;
    readonly delimited: boolean;
    readonly anchor?: string;
    readonly tail?: string;
    // A line comment: anchored, ending in a raw-to-end-of-line capture. Wherever
    // it matches the line really is a comment, so it wins over the generic
    // `{...} => ...` shape even when that shape greedily reads further.
    readonly comment: boolean;
    private readonly edge_chars: [string | undefined, string | undefined];
    // The scope this rule registers on, by name — nodes live one pass, the rule
    // survives them all (see Interpreter.name_of).
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
    // the single character a directed reader rejects this rule on
    edge_char(sign: 1 | -1): string | undefined { return this.edge_chars[sign === 1 ? 0 : 1]; }
    definition(at: Node): Definition {
      let d = this.definitions.find(x => x.at.src === at.src && x.at.begin === at.begin);
      if (!d) { this.definitions.push(d = { at }); DEFINITIONS++; }
      return d;
    }
  }

  // every definition sighting ever recorded — a cheap "did this parse
  // contribute any grammar" check for files with no ledger history
  let DEFINITIONS = 0;

  // ─────────────────────────── grammar ───────────────────────────
  // The persistent half: the ledger of every rule ever sighted, and the
  // existence analysis over it. Interpreters (and their nodes) live one pass
  // each; the grammar survives them all.

  const GLOBAL_SCOPE = '~';

  class Grammar {
    rules = new Map<string, Rule>();          // key: on + file + pattern text
    issues: Issue[] = [];
    new_rules = false;
    // The project whose `.project.ray` opens with `!language` — the language
    // definition every other project depends on. Resolved by `survey`.
    language_project?: string;

    language(src: Source): boolean { return this.project(src) === this.language_project; }

    // ── definitions ──
    // Like rules, definitions on CLASSES persist as SITES — where the defining
    // statement is written, never its value — so class definitions are
    // order-independent: a resolution miss evaluates the recorded statement on
    // demand (running whatever it depends on the same way). Two generations,
    // like rule sightings: each pass re-records what it actually reads and
    // falls back to the previous pass's — a misreading fades instead of being
    // summoned forever. Pruned per file on reload.
    private defs_now = new Map<string, Site>();
    private defs_before = new Map<string, Site>();
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

    // ── projects ──
    // Grammar rules are PROJECT-bound (the language reaches everywhere). A
    // source's project is the top-level directory it was loaded under (a root —
    // the IDE's workspace folders, say), unless a `.project.ray` deeper down
    // claims its own directory as a project of its own. Without a root, a
    // file's directory is its project.

    roots: string[] = [];
    private claims: string[] = [];
    private projects = new WeakMap<Source, string>();

    // project → the projects it depends on (whose grammar it draws on). Every
    // project implicitly depends on the language project; declared edges add here
    // and may form cycles (co-dependent projects).
    dependencies = new Map<string, Set<string>>();
    private _closures = new Map<string, Set<string>>();

    // The projects whose rules a source in `project` can see: itself, its
    // transitive dependencies, and the language project. Cycle-safe and cached
    // (cleared whenever membership or the graph moves).
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

    reroot(roots: string[]): void {
      this.roots = roots;
      this.projects = new WeakMap();
      this._closures.clear();
      this.evict();
    }

    // derive the claimed project dirs from the loaded sources; on change,
    // project membership shifts wholesale — forget the per-source memberships
    survey(sources: Source[]): boolean {
      const markers = sources.filter(s => s.path !== undefined && s.path.endsWith(`/.project${EXTENSION}`));
      const dir = (s: Source) => s.path!.slice(0, s.path!.lastIndexOf('/'));
      const claims = markers.map(dir).sort();
      const language = markers.find(s => s.text.trim().replace(/`/g, '').startsWith('!language'));
      const language_project = language ? dir(language) : undefined;
      if (claims.join('\n') === this.claims.join('\n') && language_project === this.language_project) return false;
      this.claims = claims;
      this.language_project = language_project;
      this.projects = new WeakMap();
      this._closures.clear();
      this.evict();
      return true;
    }

    // Membership shifted, so project-keyed ledger entries are mis-keyed now —
    // drop them and let the next cycle re-derive every sighting under the new
    // membership. A stale entry is not inert: its leftover `exists` has it
    // installed and CONSUMING during the cycle's first pass, attributing
    // suppressions to a rule that is about to die and poisoning the analysis.
    // The seed (scoped to the language file) stays.
    private evict(): void {
      for (const [key, rule] of [...this.rules])
        if (rule.project !== undefined && rule.project !== this.language_project) this.rules.delete(key);
    }

    // A cycle starts from nothing but the seed and re-derives its scope's
    // grammar, so its outcome is a pure function of the sources — not of
    // whichever direct-feedback parses (or half-finished cycles) touched the
    // ledger since the last one. History in the ledger is the same poison as
    // mis-keyed entries: sighted-once rules enter the next discovery pass
    // existing, and consume. Out-of-scope rules stay frozen as they are.
    clear(scope: (rule: Rule) => boolean = () => true): void {
      for (const [key, rule] of [...this.rules])
        if (scope(rule) && rule.project !== this.language_project) this.rules.delete(key);
    }

    project(src: Source): string {
      const path = src.path;
      if (path === undefined) return '';
      let found = this.projects.get(src);
      if (found === undefined) {
        // the deepest claim containing the file wins
        const within = (dirs: string[]): string | undefined => {
          let best: string | undefined;
          for (const dir of dirs) if (path.startsWith(dir + '/') && (best === undefined || dir.length > best.length)) best = dir;
          return best;
        };
        found = within(this.claims) ?? within(this.roots) ?? path.slice(0, path.lastIndexOf('/'));
        this.projects.set(src, found);
      }
      return found;
    }

    rule(pattern: Node, pieces: Piece[], on: string, project?: string): Rule {
      const text = pattern_key(pattern, pieces);
      const key = `${on}::${project ?? ''}::${text}`;
      let rule = this.rules.get(key);
      if (!rule) {
        rule = new Rule(pattern, pieces, on);
        activate(rule, EXTERNALS.find(e => e.pattern === text));
        rule.project = project;
        rule.key = key;
        this.rules.set(key, rule);
        this.new_rules = true;
      } else if (pieces !== rule.pieces) {
        // presentation may arrive later than the rule (a pending decoration
        // resolves on a later pass): adopt newly styled pieces
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

    // each pass re-derives every definition sighting from scratch — within
    // the scope being cycled
    reset(scope: (rule: Rule) => boolean = () => true): void {
      this.new_rules = false;
      this.defs_before = this.defs_now;
      this.defs_now = new Map();
      for (const rule of this.rules.values()) if (scope(rule)) for (const d of rule.definitions) d.seen = undefined;
    }

    // reset only what the given files contributed — the incremental cycle
    // reparses exactly those, every other sighting stays frozen
    reset_files(paths: Set<string>): void {
      this.new_rules = false;
      // incremental: carry the current generation along, nothing fades
      for (const [k, v] of this.defs_now) this.defs_before.set(k, v);
      this.defs_now.clear();
      for (const rule of this.rules.values())
        for (const d of rule.definitions)
          if (d.at.src?.path !== undefined && paths.has(d.at.src.path)) d.seen = undefined;
    }

    // A rule exists iff some definition survives: parsed live, or inside a
    // region whose consuming rule doesn't itself exist. That's circular, so
    // iterate — simultaneously (Jacobi), because updating in place would settle
    // a mutual suppression on whichever rule is visited first instead of
    // exposing the oscillation. Non-convergence IS the circularity error.
    // Returns whether the grammar is still MOVING — this pass discovered new
    // rules, or a verdict flipped against the last pass's sightings — the
    // fixpoint driver's continue condition (a pass parsed under verdicts that
    // no longer hold must be redone).
    analyze(scope: (rule: Rule) => boolean = () => true): boolean {
      const rules = [...this.rules.values()].filter(r => scope(r) && !r.disabled && r.definitions.length);
      // out-of-scope rules don't iterate — as suppressors, the `exists`
      // fallback below reads their frozen state
      const state = new Map<Rule, boolean>(rules.map(r => [r, true]));
      const step = (): boolean => {
        const previous = new Map(state);
        // a disabled rule still consumes its regions (error recovery), so as a
        // suppressor it counts as existing
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
      return this.new_rules || moved;
    }

    // Follow each oscillating rule's suppression edge (which oscillating rule's
    // region swallows its definition) to recover the actual cycles — any length
    // — plus the tails that hang off them. Cycle members are disabled; their
    // errors are reported once, after the final pass.
    private report_cycles(oscillating: Set<Rule>, { state, step, limit }: { state: Map<Rule, boolean>; step: () => boolean; limit: number }): void {
      const issue = (message: string, ...definitions: Definition[]) => {
        for (const d of definitions) {
          if (this.issues.some(i => i.at?.src === d.at.src && i.at.begin === d.at.begin && i.message === message)) continue;
          this.issues.push({ phase: 'grammar', message, at: d.at });
        }
      };
      const suppressed_by = (r: Rule) => r.definitions.find(d => d.seen instanceof Rule && oscillating.has(d.seen));
      const reported = new Set<Rule>();
      for (const start of oscillating) {
        if (reported.has(start)) continue;
        // walk the suppression chain until it loops back (a cycle) or reaches
        // an already-reported rule (a tail into a known cycle)
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
  }

  // ─────────────────────────── interpreter ───────────────────────────

  // A directed view over a cursor Node — the expression-walking counterpart of
  // the directed Scan. sign 1 reads left-to-right, consuming `begin` upward;
  // sign -1 reads right-to-left, consuming `end` downward. `head` is the next
  // unread position; `cut(edge)` consumes through the far boundary of a span
  // (its `end` reading right, its `begin` reading left). The cursor is itself a
  // Node: it carries the source, so there is no separate "current file".
  class Walk {
    readonly text: string;
    constructor(readonly cursor: Node, readonly sign: 1 | -1) { this.text = cursor.src!.text; }
    get src(): Source { return this.cursor.src!; }
    get head(): number { return this.sign === 1 ? this.cursor.begin : this.cursor.end - 1; }
    done(): boolean { return this.cursor.begin >= this.cursor.end; }
    at(offset = 0): string | undefined { return this.text[this.head + offset * this.sign]; }
    behind(offset = 1): string | undefined { return this.text[this.head - offset * this.sign]; }
    take(n = 1): void { if (this.sign === 1) this.cursor.begin += n; else this.cursor.end -= n; }
    cut(edge: number): void { if (this.sign === 1) this.cursor.begin = edge; else this.cursor.end = edge; }
    get direction(): string { return this.sign === 1 ? 'left-to-right' : 'right-to-left'; }
  }

  // How an expression is to be read: in which direction, at what indentation,
  // and whether an unresolved result is allowed (the caller will resolve it).
  // Everything defaults; direction is decided by the expression itself when
  // not given (see Reader.flips).
  interface Reading {
    sign?: 1 | -1;
    indent?: number;         // indentation of the line the expression started on
    forwards?: boolean;      // allow an unresolved result
  }

  // What best_rule found: a rule together with where it matched.
  interface Found { rule: Rule; m: Matched }

  // A rule candidate at a position. `prefers` is the disambiguation story: the
  // longest match wins; on a tie an anchored rule beats an unanchored one; then a
  // nearer rule (smaller `rank`) wins; then the nearest node in the chain. `rank`
  // is the project distance from the reading source — 0 for a rule from the
  // source's own project, 1 for one inherited from a dependency — so a project's
  // own copy of a rule overrides the dependency's of the same shape.
  interface Candidate extends Found { level: number; rank: number }
  function prefers(a: Candidate, b: Candidate | null): boolean {
    if (!b) return true;
    // a matching line comment is a comment, not a definition that happens to
    // start inside it — it wins regardless of how far the other shape reads
    if (a.rule.comment !== b.rule.comment) return a.rule.comment;
    const la = a.m.end - a.m.begin, lb = b.m.end - b.m.begin;
    if (la !== lb) return la > lb;
    if (a.rule.anchored !== b.rule.anchored) return a.rule.anchored;
    if (a.rank !== b.rank) return a.rank < b.rank;
    return a.level < b.level;
  }

  // How an expression reads, decided by its exclusively-directional tokens
  // before anything evaluates (see Reader.directions):
  //   ltr     no right-to-left token — the default reading
  //   rtl     right-to-left tokens only — read from the right end
  //   both    a right-to-left prefix and a left-to-right suffix POINTING APART,
  //           sharing the operand between them: `rtl X ltr` reads as both
  //           (rtl X) and (X ltr)
  //   mixed   directional tokens running towards each other — there is no
  //           single reading: an error
  type Directions =
    | { read: 'ltr' }
    | { read: 'rtl'; extent: number }
    | { read: 'both'; extent: number; before: number; after: number }
    | { read: 'mixed'; extent: number; names: string[] };

  // ─── one expression, being read ───
  // A Reader is a Walk that knows the grammar: it carries the running result
  // and dispatches each head. At each head exactly one of these happens, tried
  // in order:
  //
  //   space        a rule may claim the space itself (function definitions,
  //                spaced calls); otherwise it just separates tokens
  //   declarative  a leading keyword (`external`, `static`) takes the whole
  //                line, raw (reading left-to-right only)
  //   step         the longest match wins, across grammar rules AND known
  //                method names (a tie goes to the rule); `callable` methods
  //                take the rest of the expression as their argument
  //   word         nothing known — the word becomes a forward, an unresolved
  //                name that something later may define (or an error, if there
  //                already is a result to call it on)
  class Reader extends Walk {
    readonly ip: Interpreter;
    readonly indent: number;
    readonly forwards: boolean;
    result?: Node;
    stopped = false;          // the rest of the line was abandoned

    constructor(ip: Interpreter, cursor: Node, reading: { sign: 1 | -1; indent: number; forwards: boolean }) {
      super(cursor, reading.sign);
      this.ip = ip;
      this.indent = reading.indent;
      this.forwards = reading.forwards;
    }

    read(): Node | undefined {
      let first = true;
      while (!this.done() && !this.stopped) {
        const c = this.at();
        if (c === undefined || c === '\n') break;
        if (c === ' ') { if (!this.rule_step()) this.take(); continue; }
        if (first) {
          first = false;
          if (this.sign === 1 && this.declarative()) continue;
        }
        if (this.step()) continue;
        this.word();
      }
      if (this.result?.role?.kind === 'forward' && !this.result.consumed && !this.forwards) {
        this.result.consumed = true;
        this.ip.log.error(`Unresolved variable \`${this.result.role.name}\`.`, this.result);
      }
      return this.result;
    }

    // How this expression reads, decided before anything evaluates. Tokens
    // carrying exactly one direction flag are collected (`</` is just a
    // right-to-left one); a rule claiming the whole expression from its start
    // (a comment, a string) overrides — its content is not tokens — and a
    // cheap occurrence gate keeps every other expression free of this
    // entirely. With both kinds present, source order decides: every
    // right-to-left token before every left-to-right one points them APART
    // (they share the operand between them); any interleaving has them running
    // towards each other — no single reading.
    directions(): Directions {
      const ip = this.ip;
      const along: Directions = { read: 'ltr' };
      if (!ip.rtl_names.size) return along;
      const begin = this.head;
      if (!ip.rtl_site_in(this.src, begin, line_end(this.text, begin))) return along;
      const scan = this.scan;
      const extent = expression_edge(scan, begin);
      const lead = this.best_rule();
      if (lead && lead.m.end >= extent) return along;
      const first = ip.known(scan, begin, ip.lookup());
      if (first && ip.resolve(first)?.has_flag('declarative')) return along;
      const tokens: { name: string; begin: number; end: number; rtl: boolean }[] = [];
      let i = begin;
      while (i < extent) {
        const c = this.text[i];
        if (c === ' ' || c === '\n') { i++; continue; }
        if (scan.anchors.has(c)) {
          const far = scan.claim(i);
          if (far !== -1) { i = far + 1; continue; }
        }
        const w = word_edge(scan, i);
        if (w === i) { i++; continue; }
        const name = this.text.slice(i, w);
        const m = ip.resolve(name);
        if (m?.fn && m.has_flag('right-to-left') !== m.has_flag('left-to-right'))
          tokens.push({ name, begin: i, end: w, rtl: m.has_flag('right-to-left') });
        i = w;
      }
      const rtls = tokens.filter(t => t.rtl);
      if (!rtls.length) return along;
      const ltrs = tokens.filter(t => !t.rtl);
      if (!ltrs.length) return { read: 'rtl', extent };
      const last_rtl = rtls[rtls.length - 1], first_ltr = ltrs[0];
      if (last_rtl.end <= first_ltr.begin) return { read: 'both', extent, before: first_ltr.begin, after: last_rtl.end };
      return { read: 'mixed', extent, names: [...new Set(tokens.map(t => t.name))] };
    }

    private get scan(): Scan { return this.ip.scan(this.src, this.sign); }

    private declarative(): boolean {
      const ip = this.ip;
      const lead = ip.declarative_at(this.src, this.head);
      if (!lead) return false;
      const at = span(this.src, this.head, lead.end, ip.BASE);
      if (this.src.path !== undefined)
        ip.log.paint(this.src,this.head, lead.end, ip.style_of(lead.target) ?? 'variable');
      // to the line's end, but never past this walk's own extent (a bounded
      // sub-span — a pattern piece being decorated — ends where it ends)
      const eol = Math.min(line_end(this.text, lead.args_begin), this.cursor.end);
      const value = ip.invoke(lead.target, { self: ip.scope(), args: span(this.src, Math.min(lead.args_begin, eol), eol, ip.BASE), at }) ?? undefined;
      this.result = value;
      // what the declarative consumed may extend past the line — a decorated
      // rule definition brings its indented body along
      this.cut(value?.src === this.src && value.end > eol ? value.end : eol);
      return true;
    }

    // One dispatch over everything nameable at this head: the best grammar
    // rule and the longest known method name compete on length, the rule wins
    // a tie.
    private step(): boolean {
      const found = this.best_rule();
      const name = this.known();
      if (found && name) return found.m.end - found.m.begin >= name.length ? this.rule_step(found) : this.token(name);
      if (found) return this.rule_step(found);
      if (name) return this.token(name);
      return false;
    }

    // The best rule at this head. Candidates come from the result's type chain
    // first, then the scopes — and `prefers` below is the whole disambiguation
    // story: the longest match wins; on a tie an anchored rule beats an
    // unanchored one, and then the rule from the nearest node in the chain wins
    // (the type-bound specificity that lets `({args})` on Program shadow Node's
    // function-definition rule).
    // reused across this reader's best_rule calls — a fresh Set and scan copy
    // per call is pure allocation churn on the hottest path
    private proven = new Set<Rule>();
    private probe?: Scan;

    private best_rule(): Found | null {
      const ip = this.ip;
      const at = this.head, sign = this.sign;
      const base = this.scan;
      const scan = this.probe ??= { ...base };
      scan.text = base.text; scan.sign = base.sign; scan.claim = base.claim;
      scan.literal_of = base.literal_of; scan.anchors = base.anchors;
      scan.indent = this.indent; scan.start = this.result === undefined && sign === 1;
      const c = this.text[at];
      const own = ip.grammar.project(this.src);
      let best: Candidate | null = null;
      const seen = this.proven;
      seen.clear();
      let level = 0;
      const attempt = (rule: Rule) => {
        if (!ip.visible(rule, this.src) || seen.has(rule)) return;
        seen.add(rule);
        // a rule with a literal on the reading side is rejected on a single
        // character compare; statement-shaped externals read source order only
        const edge = rule.edge(sign);
        if (edge !== undefined && (rule.edge_char(sign) !== c || (edge.length > 1 && !lit_at(scan, at, edge)))) return;
        if (rule.matcher && sign === -1) return;
        const m = rule.matcher ? rule.matcher(rule, scan, at) : match_rule(rule, scan, at);
        const rank = rule.project === own ? 0 : 1;
        if (m && prefers({ rule, m, level, rank }, best)) best = { rule, m, level, rank };
      };
      for (const nodes of this.result ? [ip.chain(this.result), ip.lookup()] : [ip.lookup()]) {
        for (const node of nodes) {
          const rules = ip.rules_on(node);
          if (rules.length) {
            const dispatch = dispatch_of(rules);
            const keyed = dispatch.keyed[sign === 1 ? 0 : 1].get(c);
            if (keyed) for (const rule of keyed) attempt(rule);
            for (const rule of dispatch.unkeyed[sign === 1 ? 0 : 1]) attempt(rule);
          }
          level++;
        }
      }
      return best;
    }

    private rule_step(found?: Found | null): boolean {
      found ??= this.best_rule();
      if (!found) return false;
      this.result = this.ip.fire(found, this.src, this.result) ?? this.result;
      this.cut(this.sign === 1 ? found.m.end : found.m.begin);
      return true;
    }

    // The longest method name at this head — from the result's type chain when
    // there is one, the scopes otherwise.
    private known(): string | null {
      const ip = this.ip;
      return ip.known(this.scan, this.head, this.result ? ip.chain(this.result) : ip.lookup());
    }

    private token(name: string): boolean {
      const ip = this.ip;
      const m = this.result ? ip.resolve_on(this.result, name)! : ip.resolve(name)!;
      const begin = this.sign === 1 ? this.head : this.head - name.length + 1;
      const at = span(this.src, begin, begin + name.length, ip.BASE);
      this.cut(this.sign === 1 ? at.end : at.begin);
      if (this.src.path !== undefined) ip.log.paint(this.src,at.begin, at.end, ip.style_of(m) ?? 'variable');
      if (!m.fn) { this.result = m; return true; }
      // a method folds onto its receiver only in a direction it reads — plain
      // methods read left-to-right; the expression's anchor (no receiver yet)
      // is direction-checked only when it carries an explicit flag
      if (!this.directed(m)) {
        ip.log.error(this.result
          ? `Found a method \`${name}\` on \`${this.result.text}\` but it wasn't flagged as ${this.direction}.`
          : `Found a method \`${name}\` but it wasn't flagged as ${this.direction}.`, at);
        return true;
      }
      const self = this.result ?? ip.scope();
      // a `callable` method takes the rest of the expression as its argument
      const args = m.has_flag('callable') ? ip.expr(this.cursor, { forwards: this.forwards, indent: this.indent, sign: this.sign }) : undefined;
      this.result = ip.invoke(m, { self, args, at }) ?? this.result;
      return true;
    }

    private directed(m: Node): boolean {
      const rtl = m.has_flag('right-to-left'), ltr = m.has_flag('left-to-right');
      if (this.sign === 1) return ltr || !rtl;
      return rtl || (!ltr && this.result === undefined);
    }

    private word(): void {
      const exit = word_edge(this.scan, this.head);
      if (exit === this.head) { this.take(); return; }
      const [b, e] = this.sign === 1 ? [this.head, exit] : [exit + 1, this.head + 1];
      const word = span(this.src, b, e, this.ip.BASE);
      if (this.result) {
        this.ip.log.error(`Unresolved \`${word.text}\` on \`${this.result.text}\`.`, word);
        this.cut(this.sign === 1 ? line_end(this.text, this.head) : line_begin(this.text, this.head + 1));
        this.stopped = true;
        return;
      }
      word.role = { kind: 'forward', name: word.text, on: this.ip.scope() };
      if (this.src.path !== undefined) this.ip.log.paint(this.src,b, e, 'variable');
      this.result = word;
      this.cut(this.sign === 1 ? e : b);
    }
  }

  // One pass over the sources. Everything here — the node graph, the scopes,
  // the diagnostics — is born fresh per pass and thrown away; only the grammar
  // it reads from and reports to persists.
  class Interpreter {
    constructor(public grammar: Grammar, public log = new Log()) {}

    // the node graph roots: `Node`/`*` is BASE, `Program` is PROGRAM, the
    // global scope chains to BASE
    BASE = new Node();
    PROGRAM = new Node(this.BASE);
    GLOBAL = new Node(this.BASE);
    classes = new Map<string, Node>([['Node', this.BASE], ['*', this.BASE], ['Program', this.PROGRAM]]);
    class_node(name: string): Node {
      let node = this.classes.get(name);
      if (!node) {
        this.classes.set(name, node = new Node(this.BASE));
        // the ledger may already carry rules scoped to this class from an
        // earlier pass — they exist as soon as their scope does
        for (const rule of this.grammar.rules.values()) if (rule.on === name) this.install(rule);
      }
      return node;
    }

    // Rules name their scope (nodes are per-pass, the ledger is not): classes
    // by their language-given name, the global scope by a marker, anything else
    // by a tag only this pass can resolve.
    private transients = new Map<string, Node>();
    name_of(node: Node): string {
      if (node === this.GLOBAL) return GLOBAL_SCOPE;
      for (const [name, cls] of this.classes) if (cls === node) return name;
      const name = `#${id(node)}`;
      this.transients.set(name, node);
      return name;
    }
    node_of(name: string): Node | undefined {
      if (name === GLOBAL_SCOPE) return this.GLOBAL;
      return this.classes.get(name) ?? this.transients.get(name);
    }

    // language2 per-project seeding: a complete, isolated copy of this
    // interpreter's settled node graph. Caches reset (they rebuild on demand);
    // the grammar ledger and log are shared. A dependent project starts from
    // copy() of its dependency aggregate, so changes can't cross the boundary.
    copy(): Interpreter { return this.clone(); }
    clone(): Interpreter {
      const seen = new Map<Node, Node>();
      const ip = new Interpreter(this.grammar, this.log);
      ip.BASE = this.BASE.clone(seen);
      ip.PROGRAM = this.PROGRAM.clone(seen);
      ip.GLOBAL = this.GLOBAL.clone(seen);
      ip.classes = new Map(); for (const [name, node] of this.classes) ip.classes.set(name, node.clone(seen));
      ip.transients = new Map(); for (const [name, node] of this.transients) ip.transients.set(name, node.clone(seen));
      ip.scopes = [ip.GLOBAL];
      ip.abstract_blocks = this.abstract_blocks;
      ip.rtl_names = new Set(this.rtl_names);
      return ip;
    }

    rules_version = 0;                        // bumped by install(); keys caches

    // interpreter state
    scopes: Node[] = [this.GLOBAL];
    abstract_blocks = false;                  // evaluate every {block} where it's captured — opted into via Program.abstract()
    // names declared right-to-left so far this pass — the quick gate for the
    // up-front direction decision in expr()
    rtl_names = new Set<string>();

    language(src: Source): boolean { return this.grammar.language(src); }
    scope(): Node { return this.scopes[this.scopes.length - 1]; }
    // the only way scopes change — the epoch keys the cached scan context
    private scope_epoch = 0;
    enter(scope: Node): void { this.scopes.push(scope); this.scope_epoch++; }
    leave(): void { this.scopes.pop(); this.scope_epoch++; }

    // Every node reachable from the scope stack, innermost first — what an
    // expression start resolves against. Cached per scope epoch: this runs for
    // every resolution of every token, and a generator + dedup set per call is
    // most of the cost of looking anything up.
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
    // A receiver's type chain — what a result resolves against.
    *chain(node: Node | undefined): Generator<Node> {
      const seen = new Set<Node>();
      for (let n = node; n && !seen.has(n); n = n.sup) { seen.add(n); yield n; }
    }
    // The grammar a node carries (kept in step with the pattern-keyed method
    // registration by install()).
    rules_on(node: Node): readonly Rule[] {
      return node.ruleset;
    }

    visible(rule: Rule, src: Source): boolean {
      if (!(rule.exists || rule.disabled)) return false;
      return rule.project === undefined || this.grammar.closure(this.grammar.project(src)).has(rule.project);
    }

    // ── the grammar ledger ──

    // How far a rule declared in this source reaches: everywhere when the
    // source is the language itself, otherwise its project — definition
    // sightings from every file of the project pool on one ledger entry.
    reach(src: Source): string | undefined {
      return this.language(src) ? undefined : this.grammar.project(src);
    }

    // `evaluate` is off for suppressed sightings (a commented-out definition
    // must key identically, but its content isn't live code)
    rule(pattern: Node, pieces: Piece[], on: Node, evaluate = true): Rule {
      return this.grammar.rule(pattern, this.decorate(pattern.src!, pieces, evaluate), this.name_of(on), this.reach(pattern.src!));
    }

    // Decorated pattern pieces: a `{H.punctuation `[`}` group leads with a
    // highlight method, dispatched against a source of just the content (every
    // scanner ends where the piece ends) through the same chain resolution
    // statements use — aliases on H count. The remainder re-reads exactly like
    // an undecorated group, now carrying the style.
    private decorate(src: Source, pieces: Piece[], evaluate = true): Piece[] {
      let out: Piece[] | undefined;
      for (let p = 0; p < pieces.length; p++) {
        const piece = pieces[p];
        if (is_literal(piece) || piece.at === undefined) continue;
        const shadow: Source = { text: piece.content };
        const lead = this.declarative_at(shadow, 0);
        const style = lead?.target.has_flag('highlight') ? STYLED.get(lead.target) : undefined;
        if (style !== undefined) {
          const decorated = read_group(this.scan(shadow), lead!.args_begin, piece.content.length);
          decorated.style = style;
          decorated.at = piece.at + lead!.args_begin;
          out ??= [...pieces];
          out[p] = decorated;
          continue;
        }
        // A chain off the highlight object whose link isn't a known NAME yet
        // still decorates: its links resolve through the definitions ledger
        // (summoning `H.punctuation = H.comment` on demand), and when even
        // that can't land yet — the alias's own statement needs the rule this
        // very piece defines — the piece reads unstyled with the identity the
        // styled reading will have.
        const rest = this.pending(shadow);
        if (rest !== undefined) {
          const decorated = read_group(this.scan(shadow), rest.at, piece.content.length);
          decorated.style = rest.style;
          decorated.at = piece.at + rest.at;
          out ??= [...pieces];
          out[p] = decorated;
          continue;
        }
        // No leading chain. A content the grammar can read on its own — it
        // opens with a claim, a parenthesized type description say — is
        // EVALUATED in place: decorations fire as the calls they are,
        // painting what they decorate, and whatever doesn't resolve (`|` and
        // `,`, until the language defines them) reports right here. Plain
        // captures (names) stay unevaluated.
        if (!evaluate || piece.at === undefined) continue;
        let head = piece.at;
        const end = piece.at + piece.content.length;
        while (head < end && src.text[head] === ' ') head++;
        const scan = this.scan(src);
        if (head >= end || !scan.anchors.has(src.text[head]) || scan.claim(head) === -1) continue;
        if (this.decorating.has(piece.at)) continue;
        this.decorating.add(piece.at);
        try { this.eval_block(span(src, head, end, this.BASE), true); }
        finally { this.decorating.delete(piece.at); }
      }
      if (!out) return pieces;
      classify(out);
      return out;
    }
    private decorating = new Set<number>();

    // A chain off the highlight object, walked by the grammar's word
    // boundaries and resolved link by link (the ledger summons out-of-order
    // definitions). Returns where the decorated remainder starts, styled when
    // the chain landed on a group, unstyled-pending when it couldn't yet.
    private pending(shadow: Source): { at: number; style?: string } | undefined {
      const scan = this.scan(shadow);
      const keyword = this.known(scan, 0, this.lookup());
      if (!keyword) return undefined;
      let target = this.resolve(keyword);
      if (!target || target.fn || !target.has_flag('highlight')) return undefined;
      const text = shadow.text;
      let end = keyword.length;
      while (text[end] === '.') {
        const w = word_edge(scan, end + 1);
        if (w === end + 1) return undefined;
        const next = target ? this.resolve_on(target, text.slice(end + 1, w)) : undefined;
        target = next?.role?.kind === 'bound' ? next.role.method : next;
        end = w;
      }
      if (end === keyword.length || text[end] !== ' ') return undefined;
      let a = end;
      while (text[a] === ' ') a++;
      if (a >= text.length) return undefined;
      const style = target?.fn && target.has_flag('highlight') ? STYLED.get(target) : undefined;
      return { at: a, style };
    }

    // A definition parsed as actual code — `at` heads the `{pattern} => body`
    // statement.
    define(at: Node, style?: string): Rule {
      const src = at.src!;
      const r = recognize(src.text, at.begin, this.scan(src))!;
      const pattern = span(src, r.pattern_begin, r.pattern_end);
      const rule = this.rule(pattern, r.pieces, this.scope());
      if (style !== undefined) rule.style = style;
      rule.definition(pattern).seen = 'live';
      if (r.body_end > r.body_begin) {
        const body = span(src, r.body_begin, r.body_end);
        if (!body.empty) rule.body = body;
      }
      this.install(rule);
      // the statement paints as the rule-definition rule itself declares —
      // whatever styles Node.ray put on its pattern-part, arrow and body
      // pieces — no matter which path consumed it (the matcher, an H
      // decorator, the bootstrap seed)
      const shape = [...this.grammar.rules.values()].find(s => s.name === 'rule-definition' && s.styled);
      if (src.path !== undefined && shape) {
        const caps = shape.pieces.filter((p): p is Capture => !is_literal(p));
        const lit = shape.pieces.find(is_literal);
        let arrow = r.pattern_end;
        while (src.text[arrow] === ' ') arrow++;
        const after = arrow + (lit?.text.length ?? 0);
        if (caps[0]?.style !== undefined) this.log.paint(src,r.pattern_begin, arrow, caps[0].style, shape.key);
        if (lit?.style !== undefined) this.log.paint(src,arrow, after, lit.style, shape.key);
        if (caps[1]?.style !== undefined && r.body_end > after) this.log.paint(src,after, r.body_end, caps[1].style, shape.key);
      }
      this.paint_definition(src, r.pattern_begin, r.pattern_end, rule.pieces, rule);
      return rule;
    }

    // A rule highlights its own definition: its bare words in its style — an
    // unstyled rule reads as defining a function. Group interiors show as what
    // they ARE under the rules: a quoted literal paints by the rule that
    // claims it (`{` `}` shows as a string), a leading highlight chain by its
    // group. The surrounding structure (braces, the arrow) is painted by the
    // rule-definition rule itself, as declared.
    private paint_definition(src: Source, begin: number, end: number, pieces: Piece[], rule: Rule): void {
      const path = src.path;
      if (path === undefined) return;
      const own = rule.style ?? 'function.definition';
      const scan = this.scan(src);
      let p = 0;
      let literal_start = begin;
      let i = begin;
      const flush = (upto: number): void => {
        if (upto > literal_start) { this.log.paint(src,literal_start, upto, own, rule.key); p++; }
      };
      while (i < end) {
        if (src.text[i] !== '{') { i++; continue; }
        const close = group_end(scan, i);
        if (close === -1) break;
        flush(i);
        const piece = pieces[p++];
        let inner = i + 1;
        if (piece?.style !== undefined) {
          const lead = this.declarative_at({ text: src.text.slice(i + 1, close - 1) }, 0);
          if (lead) {
            this.log.paint(src,i + 1, i + 1 + lead.args_begin, piece.style, rule.key);
            inner = i + 1 + lead.args_begin;
          }
        }
        const claimed = scan.literal_of(inner, close - 1);
        if (claimed?.by.style !== undefined) this.log.paint(src,inner, close - 1, claimed.by.style, claimed.by.key);
        i = close;
        literal_start = i;
      }
      flush(i);
    }

    // `external <pattern>`: activate the runtime-provided implementation under
    // the language's own pattern text.
    declare(pattern: Node, on: Node): Rule | undefined {
      const pieces = this.decorate(pattern.src!, parse_pattern(pattern.src!.text, pattern.begin, pattern.end, this.scan(pattern.src!)) ?? []);
      const key = pattern_key(pattern, pieces);
      const external = EXTERNALS.find(e => e.pattern === key);
      if (!external) return undefined;
      const rule = this.rule(pattern, pieces, on);
      activate(rule, external);
      rule.definition(pattern).seen = 'live';
      this.install(rule);
      this.paint_definition(pattern.src!, pattern.begin, pattern.end, rule.pieces, rule);
      return rule;
    }

    // Register the rule as a method on its node, keyed by the pattern node —
    // that's what makes grammar type-bound: candidates at a position are
    // whatever the chain being parsed carries.
    install(rule?: Rule): void {
      this.scans.clear();
      this.rules_version++;
      if (!rule) { for (const r of this.grammar.rules.values()) this.install(r); return; }
      if (!rule.exists && !rule.disabled) return;
      const on = this.node_of(rule.on);
      if (!on) return;  // a scope this pass hasn't created (yet)
      on.method(rule);  // a grammar rule, keyed by its pattern on the type node
    }

    // A fired rule consumed regions of raw text (comments, strings). Scan them
    // for rule definitions: those exist only if this rule doesn't — record the
    // suppression for the analysis.
    suppress_inside(rule: Rule, src: Source, m: Matched): void {
      for (const cap of m.captures) {
        const scannable = cap.piece.name === 'comment' || cap.piece.name === 'string' || cap.piece.raw;
        if (!scannable || cap.end <= cap.begin) continue;
        // a definition needs `=>` — one indexOf rules out almost everything
        const arrow = src.text.indexOf('=>', cap.begin);
        if (arrow === -1 || arrow >= cap.end) continue;
        let i = cap.begin;
        while (i < cap.end) {
          let a = i;
          while (a < cap.end && src.text[a] === ' ') a++;
          if (a < cap.end && src.text[a] !== '\n') {
            // a leading declarative (`H.comment …`) consumes its statement when
            // live — skip it here too, so the definition keys the same way
            const lead = this.declarative_at(src, a);
            if (lead) a = lead.args_begin;
            const r = recognize(src.text, a, this.scan(src));
            if (r && r.pattern_end <= cap.end) {
              const target = this.rule(span(src, r.pattern_begin, r.pattern_end), r.pieces, this.scope(), false);
              const d = target.definition(span(src, r.pattern_begin, r.pattern_end));
              if (d.seen !== 'live') d.seen = rule;
            }
          }
          i = line_end(src.text, i) + 1;
        }
      }
    }

    // ── the scanning context ──
    // The memo is load-bearing, not an optimization: overlapping scans re-walk
    // nested regions from every enclosing position — exponential on deeply
    // bracketed text. Keyed by position + the rule-bearing scopes; cleared on
    // any rule change.

    private scans = new Map<number, number>();
    private signatures = new Map<string, number>();
    private scan_depth = 0;
    private scan_cache?: { epoch: number; version: number; src: Source; scans: Map<1 | -1, Scan> };
    scan(src: Source, sign: 1 | -1 = 1): Scan {
      let cached = this.scan_cache;
      if (!cached || cached.epoch !== this.scope_epoch || cached.version !== this.rules_version || cached.src !== src)
        cached = this.scan_cache = { epoch: this.scope_epoch, version: this.rules_version, src, scans: new Map() };
      const hit = cached.scans.get(sign);
      if (hit) return hit;
      // The claimable rules (anchored + delimited + visible here) are resolved
      // ONCE per context and bucketed by the edge character a directed reader
      // meets first — a claim attempt walks the few same-char rules instead of
      // every rule on the scope chain (which is every rule of the project).
      const anchors = new Set<string>();
      const claimable = new Map<string, Rule[]>();
      // keyed by source IDENTITY, not path — a reloaded file is a new Source
      // and must not hit the old text's memo entries
      let signature = `${id(src)}${sign === 1 ? '>' : '<'}|`;
      for (const node of this.lookup()) {
        let carries_rules = false;
        for (const rule of this.rules_on(node)) {
          carries_rules = true;
          // bucketed by MEMBERSHIP only — existence flips between passes, so
          // the claim below re-checks `visible` per call; freezing it here
          // both drifted the semantics and cost more than it saved
          if (!rule.anchored || !rule.delimited || (rule.project !== undefined && rule.project !== this.grammar.project(src))) continue;
          const c = rule.edge_char(sign)!;
          anchors.add(c);
          let bucket = claimable.get(c);
          if (!bucket) claimable.set(c, bucket = []);
          if (!bucket.includes(rule)) bucket.push(rule);
        }
        if (carries_rules) signature += `${id(node)}.`;
      }
      // the memo key is numeric — context id in the high bits, position in the
      // low — because the claim below runs at nearly every character: building
      // a string key per call costs more than most claim attempts
      let sig = this.signatures.get(signature);
      if (sig === undefined) this.signatures.set(signature, sig = this.signatures.size + 1);
      const base = sig * 2 ** 32;
      const scan: Scan = {
        text: src.text,
        sign,
        anchors,
        // the recursion nests once per open group; past the cap a position
        // simply isn't claimed — unterminated junk degrades to char-wise
        // scanning instead of overflowing
        claim: (j) => {
          const candidates = claimable.get(src.text[j]);
          if (!candidates) return -1;
          // one cheap literal probe before any bookkeeping — at almost every
          // position no candidate's edge is actually there
          let viable = false;
          for (const rule of candidates) if (lit_at(scan, j, rule.edge(sign)!)) { viable = true; break; }
          if (!viable) return -1;
          if (this.scan_depth > 64) return -1;
          const key = base + j;
          const hit = this.scans.get(key);
          if (hit !== undefined) return hit;
          this.scan_depth++;
          try {
            let best = -1;
            for (const rule of candidates) {
              if (!this.visible(rule, src)) continue;
              const m = match_rule(rule, scan, j);
              if (!m) continue;
              const far = sign === 1 ? m.end - 1 : m.begin;
              if (best === -1 || far * sign > best * sign) best = far;
            }
            this.scans.set(key, best);
            return best;
          } finally { this.scan_depth--; }
        },
        // a `{...}` piece is a literal exactly when a quote-like rule (single
        // capture returned verbatim by its body) covers its whole content
        literal_of: (begin, end) => {
          const text = src.text;
          const candidates = claimable.get(text[begin]);
          if (!candidates) return undefined;
          for (const rule of candidates) {
            if (!rule.body || !this.visible(rule, src)) continue;
            const captures = rule.pieces.filter(p => !is_literal(p)) as Capture[];
            if (captures.length !== 1 || !captures[0].name || rule.body.text.trim() !== captures[0].name) continue;
            const m = match_rule(rule, scan, begin);
            if (!m || m.end !== end) continue;
            const cap = m.captures.find(c => c.piece === captures[0]);
            return { text: cap ? text.slice(cap.begin, cap.end) : '', by: rule };
          }
          return undefined;
        },
      };
      cached.scans.set(sign, scan);
      return scan;
    }

    // ── parsing ──

    parse(src: Source): void {
      const saved = this.scopes;
      this.scopes = [this.GLOBAL];
      this.scope_epoch++;
      this.statements(span(src, 0, src.text.length));
      this.scopes = saved;
      this.scope_epoch++;
    }

    // the statements currently being read, outermost first — where a
    // definition records its site (see `assign`)
    sites: Site[] = [];
    statements(cursor: Node, forwards = false): Node | undefined {
      const text = cursor.src!.text;
      let result: Node | undefined;
      while (cursor.begin < cursor.end) {
        while (cursor.begin < cursor.end && (text[cursor.begin] === ' ' || text[cursor.begin] === '\n')) cursor.begin++;
        if (cursor.begin >= cursor.end) break;
        const before = cursor.begin;
        const frame: Site = { src: cursor.src!, begin: before, end: 0, on: this.scope() };
        this.sites.push(frame);
        const r = this.expr(cursor, { forwards });
        this.sites.pop();
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
    // An expression is read by a Reader, in its DIRECTIONS — decided up front
    // by Reader.directions, so nothing evaluates twice.

    expr(cursor: Node, reading: Reading = {}): Node | undefined {
      // Point the log at this span while it reads, so anything reported lands on
      // it (cascade dedup); subexpressions nest under it through the same path,
      // and the enclosing expression is restored on the way out. Keyed by start,
      // so a re-read or sub-read of the same span reuses the one object.
      const parent = this.log.expression;
      this.log.expression = this.log.expression_at(cursor.src!, cursor.begin, cursor.end, parent);
      try {
        const indent = reading.indent ?? indent_at(cursor.src!.text, cursor.begin);
        const forwards = reading.forwards ?? false;
        if (reading.sign !== undefined)
          return new Reader(this, cursor, { sign: reading.sign, indent, forwards }).read();
        const reader = new Reader(this, cursor, { sign: 1, indent, forwards });
        const d = reader.directions();
        if (d.read === 'ltr') return reader.read();
        const src = cursor.src!;
        const begin = cursor.begin;
        cursor.begin = d.extent;
        switch (d.read) {
          case 'rtl':
            return this.expr(span(src, begin, d.extent), { sign: -1, indent, forwards });
          case 'both': {
            // the operand between the prefix and the suffix is shared: read the
            // right-to-left half through it, then the left-to-right half from it
            const rtl = this.expr(span(src, begin, d.before), { sign: -1, indent, forwards });
            const ltr = this.expr(span(src, d.after, d.extent), { sign: 1, indent, forwards });
            return ltr ?? rtl;
          }
          case 'mixed':
            this.log.error(
              `Cannot mix ${d.names.map(n => `\`${n}\``).join(', ')} in a single infix expression with mixed associativity, use parenthesis to mix them.`,
              span(src, begin, d.extent));
            return undefined;
        }
      } finally {
        this.log.expression = parent;
      }
    }

    // Where right-to-left names occur in a source, computed once per source
    // (and again when a new one is declared) — the per-expression gate is a
    // binary search instead of a text scan.
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

    // Firing is guarded by cycle detection: the same rule at the same position
    // is a guaranteed loop and returns immediately. The depth cap is a backstop;
    // when it trips, the whole current chain aborts (anything less is
    // exponential) — never the run.
    private depth = 0;
    private overflowed = false;
    private firing = new Set<string>();
    fire(found: Found, src: Source, receiver: Node | undefined): Node | undefined {
      const { rule, m } = found;
      if (this.overflowed) return undefined;
      const at = span(src, m.begin, m.end);
      const site = `${id(rule.pattern)}:${src.path ?? ''}:${at.begin}`;
      if (this.firing.has(site)) return undefined;
      if (this.depth > 64) {
        this.overflowed = true;
        this.log.error(`Rule recursion exceeded at \`${rule.pattern.text}\` — refusing to evaluate deeper.`, at);
        return undefined;
      }
      this.firing.add(site);
      this.depth++;
      try {
        if (receiver?.role?.kind === 'forward') receiver.consumed = true;
        this.suppress_inside(rule, src, m);  // even recovery matches record what they consume
        // the match itself, attributed but unstyled — what "references of this
        // rule" means
        if (src.path !== undefined) this.log.paint(src,m.begin, m.end, '', rule.key);
        if (rule.style !== undefined || rule.styled) this.paint(rule, src, m);
        if (rule.disabled) return undefined;
        if (rule.fn) return rule.fn({ interpreter: this, self: receiver, method: rule, args: at, at, match: new Match(m, src, this.BASE) });
        return this.evaluate(found, src, receiver);
      } finally {
        this.firing.delete(site);
        if (--this.depth === 0) this.overflowed = false;
      }
    }

    // A committed match paints what the rule owns: its literal pieces and its
    // raw (String-typed) captures take the rule's style; expression and word
    // captures are someone else's content, painted by whatever fires inside
    // them. A piece carrying its own `{H.group ...}` style overrides.
    private paint(rule: Rule, src: Source, m: Matched): void {
      if (src.path === undefined) return;
      let pos = m.begin;
      for (const piece of rule.pieces) {
        let begin = pos, end: number;
        if (is_literal(piece)) end = pos + piece.text.length;
        else {
          const cap = m.captures.find(c => c.piece === piece);
          if (!cap) return;  // an external matcher that doesn't tile its span
          begin = cap.begin; end = cap.end;
        }
        const style = piece.style
          ?? (rule.style !== undefined && (is_literal(piece) || (piece as Capture).raw) ? rule.style : undefined);
        if (style !== undefined && end > begin) this.log.paint(src,begin, end, style, rule.key);
        pos = end;
      }
    }

    // Evaluate a rule body with its captures bound in a fresh scope. A capture's
    // KIND is its extent; its NAME is its meaning — `expr`/`args` captures are
    // evaluated eagerly wherever they appear (bounded or trailing), `block`
    // stays a lazy program but is abstractly evaluated where it's captured.
    private evaluate({ rule, m }: Found, src: Source, receiver: Node | undefined): Node | undefined {
      if (!rule.body || rule.body.empty) return undefined;
      const ctx = new Node(this.BASE);
      for (const cap of m.captures) {
        if (!cap.piece.name) continue;
        const node = span(src, cap.begin, cap.end, this.BASE);
        const value = (cap.piece.name === 'expr' || cap.piece.name === 'args')
          ? (this.eval_block(node) ?? node)
          : node;
        if (cap.piece.name === 'block') this.abstract(value);
        ctx.set(cap.piece.name, value);
      }
      if (receiver) ctx.set('this', receiver);
      return this.eval_in(ctx, rule.body);
    }

    // ── resolution ──

    // The longest method name whose near end (in the scan's reading order)
    // sits at this head, word-boundary checked on its far side for
    // alphanumeric names. Buckets keep this a walk over the names that share
    // the near character, longest first.
    known(scan: Scan, at: number, nodes: Iterable<Node>): string | null {
      const { text, sign } = scan;
      const c = text[at];
      let best: string | null = null;
      for (const node of nodes) {
        if (!node.methods) continue;
        const bucket = names_at(node.methods, c, sign);
        if (!bucket) continue;
        for (const length of bucket.lengths) {
          if (best !== null && length <= best.length) break;
          const begin = sign === 1 ? at : at - length + 1;
          if (begin < 0 || begin + length > text.length) continue;
          const key = text.slice(begin, begin + length);
          if (!bucket.sets.get(length)!.has(key)) continue;
          const far = sign === 1 ? at + length : begin - 1;
          if (/\w/.test(near(-sign as 1 | -1, key)) && /\w/.test(text[far] ?? '')) continue;
          best = key;
        }
      }
      return best;
    }

    // The leading declarative method at `at`: a known word (`external`,
    // `static`), or a property chain hanging off one — `H.comment …` consumes
    // its statement exactly like `external …` does. Shared by the Reader and
    // the shadow scan, so a decorated definition keys the same live and
    // suppressed.
    declarative_at(src: Source, at: number): { target: Node; end: number; args_begin: number } | undefined {
      const scan = this.scan(src);
      const keyword = this.known(scan, at, this.lookup());
      if (!keyword) return undefined;
      // an assigned alias (`H.punctuation = H.comment`) stores the method
      // bound — follow it to the method itself
      const method = (node: Node | undefined): Node | undefined =>
        node?.role?.kind === 'bound' ? node.role.method : node;
      let target = method(this.resolve(keyword));
      let end = at + keyword.length;
      const text = src.text;
      while (target && !target.fn && text[end] === '.') {
        // the methods themselves separate the syntax: the longest name the
        // object knows at this position is the next link — and a link the
        // object doesn't know YET still resolves through its definition site
        // (the word, as the grammar bounds it, summoned on the miss)
        const name = this.known(scan, end + 1, this.chain(target));
        let next = name ? method(this.resolve_on(target, name)) : undefined;
        let length = name?.length ?? 0;
        if (!next) {
          const w = word_edge(scan, end + 1);
          if (w > end + 1) {
            next = method(this.resolve_on(target, text.slice(end + 1, w)));
            length = w - (end + 1);
          }
        }
        if (!next) break;
        target = next;
        end = end + 1 + length;
      }
      if (!target?.fn || !target.has_flag('declarative')) return undefined;
      let a = end;
      while (text[a] === ' ') a++;
      return { target, end, args_begin: a };
    }

    // Call a method node. The argument defaults to an empty span at the call
    // site — "no argument" still has a place in the source.
    invoke(method: Node, call: { self: Node; args?: Node; at: Node }): Node | undefined {
      return method.fn!({ interpreter: this, self: call.self, method, args: call.args ?? span(call.at.src!, call.at.begin, call.at.begin, this.BASE), at: call.at });
    }

    // Evaluate a block with `scope` entered (a class body, a rule body's
    // bindings, a program's own span).
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

    // Where a method is hosted — the class (or the global scope) whose
    // methods carry it, under which name. A method knows it's declared by
    // where it lives.
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

    resolve_on(on: Node, key: Key): Node | undefined {
      for (const node of this.chain(on)) { const found = node.get(key); if (found) return found; }
      return this.summon(on, key);
    }

    // A miss with a recorded definition site evaluates the statement on
    // demand — class definitions are order-independent — running what IT
    // depends on the same way; cycles simply stay missing.
    private summoning = new Set<string>();
    private summon(on: Node, key: Key): Node | undefined {
      if (typeof key !== 'string' || !this.grammar.defined) return undefined;
      for (const node of this.chain(on)) {
        for (const [name, cls] of this.classes) {
          if (cls !== node) continue;
          const site = this.grammar.defined_at(name, key);
          if (!site || !site.end) continue;  // none, or still being read
          // the statement currently being read IS the definition — let it
          // finish (its own left-hand side must resolve as a slot, not as
          // what it is about to define)
          if (this.sites.some(f => f.src.path === site.src.path && f.begin === site.begin)) continue;
          const guard = `${name}::${key}`;
          if (this.summoning.has(guard)) return undefined;
          this.summoning.add(guard);
          // back in the scope the statement was read in — its meaning is its
          // own, not the summoner's
          try { this.eval_in((site.home !== undefined ? this.node_of(site.home) : undefined) ?? this.GLOBAL, span(site.src, site.begin, site.end, this.BASE), true); }
          finally { this.summoning.delete(guard); }
          return node.get(key);
        }
      }
      return undefined;
    }

    // every {block} is evaluated where it's captured (abstract interpretation) —
    // errors in never-called bodies still surface
    abstract(block: Node): void {
      if (this.abstract_blocks && !block.empty) this.evaluate_program(block);
    }

    // Evaluate an in-language program: its node spans its own body, entered as
    // the local scope (it carries `args` & friends). A body already being
    // evaluated is a recursive call — abstractly opaque: return a fresh node
    // instead of unrolling. This is evaluation machinery; what *counts* as
    // callable (bound methods, externals) is the externals' business.
    private calling = new Set<Node>();
    evaluate_program(program: Node): Node {
      if (this.calling.has(program)) return new Node();
      this.calling.add(program);
      try {
        return this.eval_in(program, program) ?? new Node();
      } finally { this.calling.delete(program); }
    }

    // `external <name>` verifies a runtime-provided method exists; `external
    // <pattern>` activates a runtime-provided rule under the language's own
    // pattern text. Leading `modifier`-flagged methods (`right-to-left`,
    // `left-associative`, ...) are not the declaration — they are applied to it.
    declare_external(raw: Node, on: Node, at: Node): Node {
      const src = raw.src!;
      let begin = raw.begin, end = raw.end;
      while (begin < end && src.text[begin] === ' ') begin++;
      while (end > begin && src.text[end - 1] === ' ') end--;
      const text = src.text.slice(begin, end);
      if (!text) { this.log.error('`external` requires a declaration as its argument.', at); return raw; }
      // a declaration with a `{...}` group anywhere is a rule pattern — bare
      // spellings (`external class {name}{block}`) included
      if ('{(['.includes(text[0]) || text.includes('{')) {
        const r = recognize(src.text, begin, this.scan(src));
        const pattern = r && r.pattern_end <= end ? span(src, r.pattern_begin, r.pattern_end) : span(src, begin, end);
        if (!this.declare(pattern, on))
          this.log.error(`Expected the rule \`${pattern.text}\` to be provided by the runtime, but it wasn't.`, pattern);
        return raw;
      }
      const words = text.split(/\s+/);
      const modifiers: Node[] = [];
      while (words.length > 1) {
        const modifier = this.resolve_on(on, words[0]) ?? this.resolve(words[0]);
        if (!modifier?.fn || !modifier.has_flag('modifier')) break;
        modifiers.push(modifier);
        words.shift();
      }
      const name = words[0].split(':')[0];
      let target = this.resolve_on(on, name);
      // a `highlight`-flagged scope accepts any declaration: the name becomes
      // one of its group methods
      if (!target && on.has_flag('highlight')) on.set(name, target = highlight_method(this, on, name));
      target ??= this.resolve(name);
      if (!target) {
        this.log.error(`Expected method \`${name}\` to be externally defined by the runtime, but it wasn't.`, span(src, begin, end));
        return raw;
      }
      let declared: Node = target;
      for (const modifier of modifiers) declared = this.invoke(modifier, { self: on, args: declared, at }) ?? declared;
      if (declared.has_flag('right-to-left') && !declared.has_flag('left-to-right')) this.rtl_names.add(name);
      // a declaration is a definition: its statement is the recorded site, so
      // anything depending on it — out of order — summons it
      const site = this.sites[this.sites.length - 1];
      if (site) this.grammar.define_at(this.name_of(on), name, site, site.on && this.name_of(site.on));
      // the declaration captures the method itself — a decorator around it
      // (`H.keyword external external`) decorates the method
      return declared;
    }
  }


  // Per-method-map near-char buckets — the lookup for "longest known name
  // here" probes one small bucket instead of every key. Within a bucket the
  // names group into a SET per length (longest length first), so a thousand
  // same-prefix names cost one slice + one hash per distinct length, not a
  // startsWith each. One bucket map per reading direction (first characters
  // reading right, last reading left). Keyed by the Map object itself and
  // caught up incrementally when it grows (keys are only ever added, and
  // insertion order is stable).
  interface NameBucket { lengths: number[]; sets: Map<number, Set<string>> }
  const buckets = new WeakMap<Map<Key, Node>, { count: number; names: [Map<string, NameBucket>, Map<string, NameBucket>] }>();
  function names_at(methods: Map<Key, Node>, c: string, sign: 1 | -1): NameBucket | undefined {
    let b = buckets.get(methods);
    if (!b) buckets.set(methods, b = { count: 0, names: [new Map(), new Map()] });
    if (b.count !== methods.size) {
      let i = 0;
      for (const key of methods.keys()) {
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
      b.count = methods.size;
    }
    return b.names[sign === 1 ? 0 : 1].get(c);
  }

  // Per-rules-array dispatch buckets, by the edge character a directed reader
  // meets first — the candidates at a position are the few same-char rules
  // plus the edge-less ones bringing their own matcher (the rule-definition
  // shape), instead of every rule the scope carries. Keyed by the array itself
  // and rebuilt when it grows (install only ever pushes).
  interface Dispatch { count: number; keyed: [Map<string, Rule[]>, Map<string, Rule[]>]; unkeyed: [Rule[], Rule[]] }
  const dispatches = new WeakMap<readonly Rule[], Dispatch>();
  function dispatch_of(rules: readonly Rule[]): Dispatch {
    let d = dispatches.get(rules);
    if (!d || d.count !== rules.length) {
      d = { count: rules.length, keyed: [new Map(), new Map()], unkeyed: [[], []] };
      for (const rule of rules) {
        for (const s of [1, -1] as const) {
          const edge = rule.edge_char(s);
          if (edge !== undefined) {
            const map = d.keyed[s === 1 ? 0 : 1];
            let list = map.get(edge);
            if (!list) map.set(edge, list = []);
            list.push(rule);
          } else if (s === 1 && rule.matcher) d.unkeyed[0].push(rule);
        }
      }
      dispatches.set(rules, d);
    }
    return d;
  }

  let IDS = 0;
  const ids = new WeakMap<object, number>();
  function id(node: object): number { let n = ids.get(node); if (n === undefined) ids.set(node, n = ++IDS); return n; }

  // ──────────────────────── externals + driver ────────────────────────

  // The interpreter only records what a node *is* (its `role`); what a role
  // *means* is decided here, by the externals that use it.

  // iterative — slot values can be cyclic (`a = b; b = a`)
  function deref(ip: Interpreter, node: Node | undefined): Node | undefined {
    const seen = new Set<Node>();
    let n = node;
    while (n?.role?.kind === 'slot' && !seen.has(n)) {
      seen.add(n);
      const found = ip.resolve_on(n.role.on, n.role.key);
      if (!found || found === n) break;
      n = found;
    }
    return n;
  }

  // `self = args`: a forward defines its name where it was created (class
  // bodies define methods on the class); a slot assigns its location.
  function assign(ip: Interpreter, { self, args, at }: Args): Node {
    const value = deref(ip, args) ?? args;
    const role = self?.role;
    if (role?.kind !== 'slot' && role?.kind !== 'forward') {
      ip.log.error('Cannot assign here.', self ?? at);
      return value;
    }
    const on = role.on;
    const key = role.kind === 'slot' ? role.key : role.name;
    if (role.kind === 'forward') self.consumed = true;
    on.set(key, value);
    for (const [name, cls] of ip.classes) if (cls === on) {
      ip.log.info(`Defined \`${typeof key === 'string' ? key : key.text}\` on \`${name}\`.`, self);
      // a definition on a class records WHERE it was written — the statement
      // inside the class's body when there is one, the outermost otherwise —
      // so a miss can evaluate it out of order
      if (typeof key === 'string') {
        const frame = [...ip.sites].reverse().find(f => f.on === on) ?? ip.sites[0];
        if (frame) ip.grammar.define_at(name, key, frame, frame.on && ip.name_of(frame.on));
      }
      break;
    }
    return value;
  }

  // `callee(args)`: a bound role carries its receiver, an external runs its
  // fn, anything else with a body is an in-language program.
  function call(ip: Interpreter, callee: Node | undefined, args: Node, at: Node): Node {
    const bound = callee?.role?.kind === 'bound' ? callee.role : undefined;
    const method = bound ? bound.method : callee;
    const self = bound ? bound.self : callee;
    if (method?.fn) return ip.invoke(method, { self: self ?? method, args, at }) ?? new Node();
    if (method && !method.empty) return ip.evaluate_program(method);
    ip.log.error('Expected a function to call.', at);
    return new Node();
  }

  // ── highlighting ──
  // What a group method returned, and under which group — how pattern-piece
  // decoration reads the style back off an evaluated value.
  const STYLED = new WeakMap<Node, string>();

  // A highlighting group's method, materialized when the language declares it
  // (`class H` + `external comment` — see declare_external's catch-all). The
  // runtime enumerates no group names: the spec does. As a decorator it
  // consumes its statement the way `external …` does — a rule definition gets
  // defined and styled; anything else is evaluated, painted and returned.
  function highlight_method(ip: Interpreter, owner: Node, group: string): Node {
    const node = new Node(ip.BASE);
    node.flag('declarative');
    node.flag('highlight');   // what pattern decoration dispatches on
    STYLED.set(node, group);  // the group method shows its own color
    node.fn = ({ self, args }) => {
      // referenced bare — nothing to decorate — the group itself is the value
      // (`H.punctuation = H.comment` stores the method)
      if (args.empty) return node;
      const src = args.src;
      // leading a statement (self is the surrounding scope, args still raw):
      // a rule definition to decorate
      if (self !== owner && src) {
        const r = recognize(src.text, args.begin, ip.scan(src));
        if (r && r.pattern_end <= args.end) {
          ip.define(span(src, args.begin, args.end, ip.BASE), group);
          // the definition's extent — its body may span lines past the args
          return span(src, args.begin, r.end, ip.BASE);
        }
      }
      // identity over what it decorates — forwards stay quiet here, their
      // own definition sites report them
      const value = (self === owner ? args : ip.eval_block(args, true)) ?? args;
      if (value.src?.path !== undefined && value.end > value.begin) ip.log.paint(value.src, value.begin, value.end, group);
      STYLED.set(value, group);
      // decorating a hosted method is DEFINITIONAL: it lives on Node (or the
      // global scope) under its name — that hosting is how it's known — and
      // this statement becomes its recorded site, summoned by consumptions
      // anywhere, including before this line
      const host = ip.hosted(value);
      const site = ip.sites[ip.sites.length - 1];
      if (host && site) ip.grammar.define_at(host.on, host.name, site, site.on && ip.name_of(site.on));
      return value;
    };
    return node;
  }

  // The runtime externals. Word externals (no `pattern`) and rule externals (a
  // `pattern`) share one `fn` protocol — each takes its interpreter from the
  // `Call`, so the table is static and `externals()` is the only installer.
  const EXTERNALS: External[] = [
    { name: 'external', flags: ['declarative'], fn: ({ interpreter: ip, self, args, at }) => ip.declare_external(args, self, at) },
    { name: 'static', flags: ['declarative'], fn: ({ interpreter: ip, args }) => ip.eval_block(args) ?? args },
    { name: '=', flags: ['callable'], fn: call => assign(call.interpreter, call) },
    // `external **: Program` — the result is a Program, so Program's rules apply to it
    { name: '**', fn: ({ interpreter: ip, self }) => { const program = deref(ip, self) ?? self; program.sup = ip.PROGRAM; return program; } },
    // direction modifiers stamp which side of its receiver a method's call site
    // sits on; associativity is the same axis for now
    { name: 'left-to-right', flags: ['callable', 'modifier'], fn: ({ args }) => args.flag('left-to-right') },
    { name: 'left-associative', flags: ['callable', 'modifier'], fn: ({ args }) => args.flag('left-to-right') },
    { name: 'right-to-left', flags: ['callable', 'modifier'], fn: ({ args }) => args.flag('right-to-left') },
    { name: 'right-associative', flags: ['callable', 'modifier'], fn: ({ args }) => args.flag('right-to-left') },
    // the bare marker: right-to-left with nothing on its right — it ends an
    // expression, flips it, and transparently returns what the flipped walk read
    { name: '</', flags: ['callable', 'right-to-left'], fn: ({ args }) => args },
    // the direction-fixture stand-ins emit the trace infos the fixtures expect
    { name: 'test-middle', fn: ({ at }) => at },
    { name: 'test-left', fn: ({ interpreter: ip, self, at }) => { ip.log.info(`test-left fired on \`${self.text}\``, at); return self; } },
    { name: 'test-right', flags: ['callable'], fn: ({ interpreter: ip, self, at }) => { ip.log.info(`test-right fired on \`${self.text}\``, at); return self; } },
    { name: 'test-assoc', flags: ['callable'], fn: ({ interpreter: ip, self, at }) => { ip.log.info(`test-assoc fired on \`${self.text}\``, at); return self; } },
    { name: 'test-bidir', fn: ({ interpreter: ip, self, at }) => { ip.log.info(`test-bidir fired on \`${self.text}\``, at); return self; } },
    { pattern: 'class {name}{block}', name: 'class', fn: ({ match, interpreter: ip }) => {
      const name = match.capture('name')?.text.trim();
      if (!name) return undefined;
      const node = ip.class_node(name);
      ip.scope().set(name, node);
      ip.eval_in(node, match.capture('block'));
      return node;
    } },
    // its shape opens and closes on a capture, so the generic matcher can't lean
    // on an edge — it brings its own, delimiting via `recognize`; captures are
    // tiled later, in `define`
    { pattern: '{(String.Word | `{`, expr, `}`)[]}=>{body}', name: 'rule-definition',
      match(rule, scan, at) {
        if (!scan.start) return null;  // a statement shape, not mid-expression
        const r = recognize(scan.text, at, scan);
        return r && { begin: at, end: r.end, captures: [] };
      },
      fn: ({ at, interpreter: ip }) => { ip.define(at); return undefined; } },
    { pattern: '[{property}]', name: 'index', fn: ({ match, at, self: receiver, interpreter: ip }) => {
      const self = receiver ?? ip.scope();
      const key_node = ip.eval_block(match.capture('property'), true);
      if (key_node?.role?.kind === 'forward') key_node.consumed = true;
      const key = key_node ? (key_node.role?.kind === 'forward' ? key_node.role.name : key_node.text) : '';
      const found = key ? ip.resolve_on(self, key) : undefined;
      const result = span(at.src!, at.begin, at.end, ip.BASE);
      if (found?.fn) { result.sup = ip.PROGRAM; result.role = { kind: 'bound', self, method: found }; }
      else result.role = { kind: 'slot', on: deref(ip, self) ?? self, key };
      return result;
    } },
    { pattern: '({args})', name: 'call', fn: ({ match, at, self: receiver, interpreter: ip }) => {
      const cap = match!.capture('args')!;
      const args = (cap.empty ? undefined : ip.eval_block(cap)) ?? cap;
      return call(ip, receiver, args, at);
    } },
  ];

  // Install the word externals onto a pass's fresh interpreter, as methods on
  // BASE keyed by name. The rule externals (those with a `pattern`) live in the
  // grammar registry, populated once when the Program is built.
  function externals(ip: Interpreter): void {
    for (const ext of EXTERNALS) {
      if (ext.pattern !== undefined) continue;
      const node = ip.BASE.method(ext.name, ext.fn, ...(ext.flags ?? []));
      if (node.has_flag('right-to-left') && !node.has_flag('left-to-right')) ip.rtl_names.add(ext.name);
    }
    // the highlighting namespace is a catch-all: `external <group>` on it always
    // succeeds, materializing the group's method — the groups themselves are
    // declared in the language, never enumerated here
    ip.class_node('H').flag('highlight');
  }

  // A project's derived state: the interpreter from its scoped cycle (over
  // [the project + its dependency closure]) and the sources that belong to it.

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
  items: Map</*location:*/ Text.Source | undefined, Map<Expression | undefined, Diagnostic[]>> = new Map();

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

  forget(src: Text.Source | Iterable<Text.Source>) {
    if (Symbol.iterator in src) { for (const element of src) { this.forget(element) }; return; }
    this.items.delete(src)
  }

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

        // Word-wrap plain text at spaces to fit `width` columns.
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
        // Word-wrap a coloured string by *visible* width, re-opening colour per line.
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

        // One line: items placed left-to-right at their columns. A bare item is
        // a gray pipe; a {text} item is its coloured run. Anything a run already
        // covered is dropped — that's how a message hides the pipes behind it.
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

        // Each group draws a connector then its wrapped message(s). `through` are
        // the groups whose pipes pass through this block — the already-rendered
        // ones above the source, the not-yet-rendered ones below.
        const lines: string[] = [];
        group.forEach((g, i) => {
          const through = before ? group.slice(0, i) : group.slice(i + 1);
          if (!before) lines.push(draw(group.slice(i)));
          else if (through.length) lines.push(draw(through));
          // wrap to the gap before the next pipe on the right if it's roomy (≥30), else full width
          const right = [...through].sort((a, b) => a.col - b.col).find(r => r.col > g.col);
          const full = cols - gutter.length - g.col;
          const gap = right ? right.col - g.col - 1 : full;
          const width = Math.max(gap >= 30 ? gap : full, 10);
          for (const e of g.entries)
            for (const ln of wrap(this.format(e), width))
              lines.push(draw([...through, { col: g.col, ...ln }]));
        });
        if (before) lines.push(draw(group));

        // Print, dropping a pipes-only line whose pipes already show above, and
        // collapsing exact repeats.
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

  report(entry: Diagnostic, expression?: Expression) {
    if (!this.is_visible(entry.level)) return;
    
    const source = entry.node?.source;
    let expr = this.items.get(source);
    if (!expr) { expr = new Map(); this.items.set(source, expr); }
    let expr_diagnostics = expr.get(expression)
    if (!expr_diagnostics) { expr_diagnostics = []; expr.set(expression, expr_diagnostics); }

    // Only error once per expression
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
    public readonly month: number, // 1–12
    public readonly index: number,
  ) {}

  get monthLetter(): string { return Version.MONTH_LETTERS[this.month - 1]; }
  private get tail(): string { return `${this.year}.${this.yearsSinceRelease}${this.monthLetter}.${this.index}`; }

  /** `<major>.E<tail>` — the form `parse` reads back. */
  toString(): string { return `${this.major}.${Version.letter}${this.tail}`; }

  /** Semver `<major>.<minor>.<patch>`; with `scheme`, re-suffixed `-E<tail>`. */
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
    // A checkout enclosing the working directory: walk up to the marker.
    let dir = process.cwd();
    while (!fs.existsSync(language_dir(dir)) && path.dirname(dir) !== dir) dir = path.dirname(dir);
    if (fs.existsSync(language_dir(dir))) return env._root = dir;
    // Production: package ships @ether/$/.ray inside its tarball — root sits one dir up from src/.
    dir = path.resolve(import.meta.dirname, '..'); if (fs.existsSync(language_dir(dir))) return env._root = dir;
    // Development: src lives at <repo>/@ether/$/.ray/v0.ts/src — repo root is five dirs up.
    dir = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..'); if (fs.existsSync(language_dir(dir))) return env._root = dir;

    throw new Error(`Couldn't find a language definition on your system. Expected one in the hierarchy of your CWD, in the package (production), or in the repository (development). Signature is a '${root.join('/')}' directory.`)
  }
}

if (env.is_main_entrypoint) await main(env.cli_args(cli));