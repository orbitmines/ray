// Capture methods up to precedence
// Info message if a method on @ is used as a direct .; Mute with X.
// Bundle all the .ray files in a single .ray file.
// Support older versions of Node
// Dependency which alters Language workings; prompt: Do you want to apply those language changes too.
// support relative paths
// What dewcides what returns (last passed file) or entrypoint.
// Starting a {, one appearing at the end of the line }

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

namespace Global {
  export abstract class Node {
    abstract source: Source
  }
  export abstract class Source {
    location: string
    constructor(public relative_location?: string) { if (relative_location !== undefined) this.location = env.nodejs ? env.path.join(env.root, relative_location) : new URL('../' + relative_location, import.meta.url).href }
    abstract load(): Promise<void>
    abstract reload(): Promise<void>

    get dir() { return this.location.slice(0, this.location.lastIndexOf('/')); }
    get path() { return this.location; }
    get name() { return this.location?.slice(this.location.lastIndexOf('/') + 1) ?? ''; }
    get is_dot_project() { return this.location?.endsWith(`/.project${Ray.EXTENSION}`) ?? false; }
    get is_entrypoint() { return this.location?.endsWith(`.entrypoint${Ray.EXTENSION}`) ?? false; }
  }
}
export type Node = Global.Node;
export type Source = Text.Source;
export type Painted = Text.Node;

export namespace Ray {
  export const EXTENSION = '.ray'

  export function v0(diagnostics: Diagnostics) {
    return new Program(diagnostics)
      .add(env.directory(`@ether/$/${EXTENSION}/v0`, { recursively: true, filter: x => x.endsWith(EXTENSION) }))
      .add(env.directory(`@ether/$/${EXTENSION}/tests`, { recursively: true, filter: x => x.endsWith(EXTENSION) }));
  }

  export function lsp(diagnostics: Diagnostics) {
    return new Program(diagnostics)
      .add(env.directory(`@ether/$/${EXTENSION}/v0`, { recursively: true, filter: x => x.endsWith(EXTENSION) }));
  }

  export function source(location: string, value: string): Text.Source {
    const src = new Text.Source();
    src.location = location; src.value = value;
    return src;
  }

  export class Project {
    source: Text.Source[] = []
    dependencies: Project[] = []

    interpreters: Map<Project, Interpreter> = new Map();

    constructor(private program: Program, public dot_project: Text.Source, interpreter: Interpreter) { this.interpreters.set(this, interpreter); }
    get directory(): string { return this.dot_project.dir; }

    get is_language() { return this.dot_project.line(0).string.includes('!language'); }
    
    get interpreter() { return this.interpreters.get(this); }

    get entrypoints(): Text.Source[] { return this.source.filter(x => x.dir === this.directory && this.program.entrypoint(x)); }
    get order(): Text.Source[] {
      const entrypoints = this.entrypoints;
      return [...entrypoints, ...this.source.filter(x => !x.is_dot_project && !x.is_entrypoint && !entrypoints.includes(x))];
    }

    private claim_sources() {
      const mine = new Set<string>([this.dot_project, ...this.source].map(src => src.location));
      this.interpreter.owns = src => mine.has(src.location);
    }
    interpret() { this.claim_sources(); this.interpreter.interpret(this.order) }
    interpret_async(alive: () => boolean) { this.claim_sources(); return this.interpreter.interpret_async(this.order, alive); }
    feedback(src: Text.Source) { this.claim_sources(); this.interpreter.feedback(src); }

    depend_on(project: Project) {
      if (this === project) return;
      this.dependencies.push(project);
      this.interpreters.set(this, project.interpreter.copy());
      project.interpreters.set(this, this.interpreter);
    }

    load(): Promise<void>[] { return [this.dot_project, ...this.source].map(x => x.load()) }
  }

  export class Program {

    projects: Project[] = []
    default_language: Project

    constructor(public diagnostics: Diagnostics) { diagnostics.program = this; }

    entrypoints: Set<string> = new Set();
    entrypoint(src: Text.Source): boolean { return src.name === `.entrypoint${EXTENSION}` || this.entrypoints.has(src.location) || this.entrypoints.has(src.name); }

    get ordered(): Project[] {
      const out: Project[] = [];
      const visit = (project: Project) => { if (out.includes(project)) return; project.dependencies.forEach(visit); out.push(project); };
      this.projects.forEach(visit);
      return out;
    }

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

    add(srcs: Text.Source[]): this {
      this.revision++;
      const claims = [...this.projects.flatMap(project => project.source), ...srcs].filter(x => x.is_dot_project).map(x => x.dir);
      const project_directory_of = (src: Source): string => {
        let best: string | undefined;
        for (const c of claims) if (src.location.startsWith(`${c}/`) && (best === undefined || c.length > best.length)) best = c;
        return best ?? src.dir;
      };
      
      const home = (src: Text.Source): void => {
        const directory = project_directory_of(src);
        let project = this.projects.find(project => project.directory === directory);
        if (!project) {
          const interpreter = new Interpreter(this.diagnostics);
          this.projects.push(project = new Project(this, src.is_dot_project ? src : ((directory: string): Text.Source => {
            const dot = new Text.Source();
            dot.location = `${directory}/.project${EXTENSION}`;
            dot.value = '';
            return dot;
          })(directory), interpreter));
        }
        if (src.is_dot_project) project.dot_project = src;

        const existing = project.source.findIndex(s => s.location === src.location);
        if (existing >= 0) project.source[existing] = src; else project.source.push(src);
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
    
    async exec(): Promise<Node> {
      await Promise.all(this.projects.flatMap(project => project.load()));
      this.fill_default_dependencies();

      this.ordered.forEach(project => project.interpret())

      return this.default_language?.interpreter.GLOBAL!;
    }
    async reload(next: Text.Source | Node | Iterable<Text.Source | Node>): Promise<Node> {
      const srcs: Text.Source[] = (next instanceof Node || !((next as any)?.[Symbol.iterator])) ? [next as Text.Source] : [...(next as Iterable<Text.Source | Node>)].map(item => item instanceof Node ? item.position.source : item);
      await Promise.all(srcs.map(x => x.loaded ? undefined : x.load()));
      this.add(srcs);
      this.fill_default_dependencies();
      for (const src of srcs) {
        const project = this.project_of(src);
        if (!project) continue;
        this.pending.add(project);
        if (srcs.length > 1 && !this.active.has(src.location)) continue;
        project.feedback(src);
        this.reloaded(src);
      }
      this.schedule();
      return this.default_language?.interpreter.GLOBAL!;
    }

    private generation = 0;
    private timer?: ReturnType<typeof setTimeout>;
    private pending = new Set<Project>();
    private running = false;
    private rerun = false;
    settled: () => void = () => {};
    schedule(delay: number = 300) {
      this.generation++;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.derive(), delay);
    }
    private async derive() {
      if (this.running) { this.rerun = true; return; }
      this.running = true;
      const generation = this.generation;
      const alive = () => this.generation === generation;
      const touched = new Set<Project | undefined>(this.pending);
      this.pending.clear();
      try {
        for (const project of this.ordered) {
          if (!touched.has(project) && !project.dependencies.some(x => touched.has(x))) continue;
          if (!await project.interpret_async(alive)) { touched.forEach(x => x && this.pending.add(x)); return; }
          touched.add(project);
          project.source.forEach(src => this.reloaded(src));
        }
        if (this.pending.size === 0) this.settled();
      } finally {
        this.running = false;
        if (this.rerun) { this.rerun = false; this.timer = setTimeout(() => void this.derive(), 0); }
      }
    }

    reloaded: (src: Text.Source) => void = () => {};
    active: Set<string> = new Set();
    roots: string[] = [];
    reroot(roots: string[]) { this.roots = roots; }
    get sources(): Text.Source[] { return [...new Set(this.projects.flatMap(project => [project.dot_project, ...project.source]))]; }
    get groups(): string[] { return SEMANTIC_TOKEN_TYPES; }

    remove(path: string) {
      for (const project of this.projects) {
        const at = project.source.findIndex(s => s.location === path);
        if (at < 0) continue;
        const [removed] = project.source.splice(at, 1);
        this.diagnostics.forget(removed);
        this.reloaded(removed);
        this.pending.add(project);
        this.schedule();
        return;
      }
    }

    get engine() {
      const program = this;
      return {
        get rules(): Map<string, RuleInfo> {
          const out = new Map<string, RuleInfo>();
          for (const project of program.projects) for (const [rule, impl] of project.interpreter?.definitions_of() ?? []) {
            if (impl.forward || out.has(rule.key!)) continue;
            const at = rule.position!;
            out.set(rule.key!, {
              key: rule.key!, exists: true, disabled: false, pieces: rule.pattern!,
              pattern: { text: at.string }, style: impl.decorators?.map(x => x.string).join(' '),
              body: impl.body ? { empty: impl.body.empty(), text: impl.body.string } : undefined,
              definitions: [{ at: { src: at.source, begin: at.begin, end: at.end + 1 }, seen: 'live' }],
            });
          }
          return out;
        },
        *sites(): Generator<[string, { src: Text.Source; begin: number; end: number }]> {
          for (const project of program.projects) for (const [key, at] of project.interpreter?.sites ?? [])
            yield [key, { src: at.source, begin: at.begin, end: at.end + 1 }];
        },
        site(key: string): { src: Text.Source; begin: number; end: number } | undefined {
          for (const project of program.projects) {
            const at = project.interpreter?.sites.get(key);
            if (at) return { src: at.source, begin: at.begin, end: at.end + 1 };
          }
        },
      };
    }

    EXTERNALS: { [method: string]: Native } = Natives;

    revision = 0;
    private highlights?: { stamp: string; map: Map<string, Text.Node[]> };
    get highlighting(): Map<string, Text.Node[]> {
      const stamp = `${this.revision}:${this.projects.map(project => project.interpreter?.painted ?? 0).join(',')}`;
      if (this.highlights?.stamp === stamp) return this.highlights.map;
      const out = new Map<string, Text.Node[]>();
      const current = new Map(this.sources.map(src => [src.location, src]));
      const shifts = new Map<Text.Source, ((begin: number, end: number) => Text.Node | undefined) | undefined>();
      const rebase = (paint: Text.Node): Text.Node | undefined => {
        const now = current.get(paint.source.location);
        if (now === paint.source) return paint.span(paint.begin, paint.end);
        if (!shifts.has(paint.source)) {
          const before = paint.source.value, after = now?.value;
          let shift: ((begin: number, end: number) => Text.Node | undefined) | undefined;
          if (now && after !== undefined) {
            const { prefix, suffix, delta } = Text.shift(before, after), anchor = new Text.Node(now);
            shift = (begin, end) => end < prefix ? anchor.span(begin, end) : begin >= before.length - suffix ? anchor.span(begin + delta, end + delta) : undefined;
          }
          shifts.set(paint.source, shift);
        }
        return shifts.get(paint.source)?.(paint.begin, paint.end);
      };
      for (const project of this.projects) {
        const interpreter = project.interpreter;
        if (!interpreter) continue;
        for (const paint of [...interpreter.paints]) {
          if (!paint.source?.location) continue;
          const style = typeof paint.style === 'function' ? paint.style() : paint.style;
          if (style === undefined) continue;
          const resolved = rebase(paint);
          if (!resolved) continue;
          resolved.style = style;
          resolved.of = paint.of;
          resolved.head = paint.head;
          const defines = typeof paint.defines === 'function' ? paint.defines() : paint.defines;
          resolved.defines = defines ?? (interpreter.sites.has(`theme::${style}`) && resolved.string === style ? `theme::${style}` : undefined);
          resolved.color = interpreter.color(style);
          let list = out.get(paint.source.location);
          if (!list) out.set(paint.source.location, list = []);
          list.push(resolved);
        }
      }
      this.highlights = { stamp, map: out };
      return out;
    }
    painted(src: Text.Source): Text.Node[] { return this.highlighting.get(src.location) ?? []; }
    palette(): Map<string, string> { return this.default_language?.interpreter?.colors() ?? new Map(); }
    color(style: string): string | undefined { return this.default_language?.interpreter?.color(style); }

    fill_default_dependencies() {
      this.default_language = this.projects.find(project => project.is_language);
      if (!this.default_language) return this.diagnostics.report({ level: 'fatal', message: "Expected to have recognized the string !language (the project defining the default language) on the first line in a .project.ray file, but it wasn't provided." });

      // All projects depend on the default language.
      this.projects.filter(x => x.dependencies.length === 0).forEach(x => x.depend_on(this.default_language));
      for (const project of this.projects) project.interpreter.program = this;
    }

  }

  export const SEMANTIC_TOKEN_TYPES = ['namespace', 'type', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'parameter', 'variable', 'property', 'enumMember', 'event', 'function', 'method', 'macro', 'keyword', 'modifier', 'comment', 'string', 'number', 'regexp', 'operator', 'decorator'];

  export type RuleInfo = {
    key: string; exists: boolean; disabled: boolean; pieces: Piece[];
    pattern: { text: string }; style?: string; body?: { empty: boolean; text: string };
    definitions: { at: { src: Text.Source; begin: number; end: number }; seen: 'live' }[];
  }

  export type Key = string | Node
  export type Args = { interpreter: Interpreter; frame: Node; self?: Node; method: Node; args: Node[]; at: Text.Node }
  export type Method = (args: Args) => Node | undefined;
  export type Native = { arity: number; fn: Method; pure?: boolean }

  export type Piece =
    | { kind: 'literal'; text: string; styles?: Text.Node[] }
    | { kind: 'space' }
    | { kind: 'newline'; group?: Text.Node }
    | { kind: 'capture'; name: string; raw: boolean; optional?: boolean; modifiers: string[]; styles: Text.Node[]; type?: string; group: Text.Node }
    | { kind: 'operator'; name: string; filter?: string; group: Text.Node }

  export class Node {
    methods?: Map<Key, Node>

    fn?: Method
    arity?: number
    pure?: boolean
    applied?: Node[]
    reads?: 'token' | 'rest'

    pattern?: Piece[]
    params?: string[]
    body?: Text.Node
    closure?: Node
    inlined?: Node[]
    // What a scope can *see* is not what it is *made of*: a frame whose names
    // are reachable from here is listed apart from the values composed into it,
    // or inlining a block would compose in whatever that block could see.
    sees?: Node[]
    links?: Map<string, Node>
    declared?: Node
    subject?: Node
    modifiers?: Node[]
    styles?: Node[]
    decorators?: Text.Node[]
    param_styles?: Text.Node[][]
    param_types?: Text.Node[]
    forward?: Text.Node

    parent?: Node
    ref?: { scope: Node; key: string; own?: boolean; member?: boolean; self?: Node; through?: Node; literal?: boolean }
    lazy?: { span: Text.Node; frame: Node; raw: boolean; probe?: boolean; thunk?: boolean; consumed?: boolean }
    value?: Node
    literal?: boolean
    unknown?: boolean
    none?: boolean
    marks?: Node[]

    style?: string
    theme?: Map<string, string>
    key?: string
    children?: Map<string, Node>
    owner?: Node
    site?: string
    members?: Map<string, Node>
    given?: Set<string>

    // get references(): Node[] {}

    constructor(public diagnostics: Diagnostics, public position?: Text.Node) {}

    get callable(): boolean { return this.fn !== undefined || this.params !== undefined; }
    ruled?: boolean
    get rules(): Node[] { return this.methods ? [...this.methods.keys()].filter((x): x is Node => x instanceof Node) : []; }

    // A name is what it is bound to, or the function defined under that name.
    own(key: string): Node | undefined { return this.methods?.get(key) ?? this.named?.get(key); }
    outermost?: boolean
    named?: Map<string, Node>
    member(key: string): Node | undefined {
      const own = this.members?.get(key) ?? this.methods?.get(key);
      if (own !== undefined || (this.inlined === undefined && this.made_of === undefined)) return own;
      const seen = new Set<Node>();
      for (const scope of this.composed(seen)) {
        const found = scope.members?.get(key) ?? scope.methods?.get(key);
        if (found !== undefined) return found;
      }
    }
    // What a node is made of, as against text inlined into it: a class
    // composing another is made of it, and does not read the frame that one
    // was written in.
    made_of?: Node[]
    *composed(seen: Set<Node>): Generator<Node> {
      const stack: Node[] = [this];
      while (stack.length > 0) {
        const scope = stack.pop()!;
        if (seen.has(scope)) continue;
        seen.add(scope);
        yield scope;
        for (let k = (scope.made_of?.length ?? 0) - 1; k >= 0; k--) stack.push(scope.made_of![k]);
        for (let k = (scope.inlined?.length ?? 0) - 1; k >= 0; k--) stack.push(scope.inlined![k]);
      }
    }
    // A name is looked up in each scope, then in what that scope is made of
    // and what it sees, before the scope it sits in: text inlined here finds
    // the names of where it was written before those around where it runs.
    lookup(key: string): Node | undefined {
      let links = false;
      for (let scope: Node | undefined = this; scope && !links; scope = scope.parent) links = scope.inlined !== undefined || scope.made_of !== undefined || scope.sees !== undefined;
      if (!links) {
        for (let scope: Node | undefined = this; scope; scope = scope.parent) { const found = scope.own(key) ?? scope.members?.get(key); if (found !== undefined) return found; }
        return undefined;
      }
      const chain = new Set<Node>();
      for (let scope: Node | undefined = this; scope; scope = scope.parent) chain.add(scope);
      for (const scope of this.reading(new Set())) { const found = scope.own(key) ?? (chain.has(scope) ? scope.members?.get(key) : undefined); if (found !== undefined) return found; }
    }
    // Depth-first over the parent chain, entering what each scope is made of
    // and what it sees before its parent, without recursing on the call stack.
    // The outermost scope is where the language itself is written, so it
    // answers last: anything nearer, by any route, is nearer.
    *reading(seen: Set<Node>): Generator<Node> {
      const stack: { scope: Node | undefined; start: Node; k: number; rooted?: boolean }[] = [];
      let outermost: Node | undefined;
      if (!seen.has(this)) { seen.add(this); stack.push({ scope: this, start: this, k: -1 }); }
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.scope === undefined) { stack.pop(); continue; }
        if (top.k === -1) {
          if (top.scope !== top.start) { if (seen.has(top.scope)) { stack.pop(); continue; } seen.add(top.scope); }
          if (top.scope.outermost && top.scope !== this) { outermost = top.scope; stack.pop(); continue; }
          yield top.scope;
          top.k = 0;
        }
        const inlined = top.scope.inlined, made = top.scope.made_of, sees = top.rooted ? undefined : top.scope.sees;
        const composed = inlined?.length ?? 0, of = made?.length ?? 0, seeing = sees?.length ?? 0;
        if (top.k < composed + of + seeing) {
          const k = top.k++;
          const start = k < composed ? inlined![k] : k < composed + of ? made![k - composed] : sees![k - composed - of];
          // What a scope is made of answers with its own names and with what
          // it is itself made of, never with the frames it was written in or
          // reads from: a class does not see another's locals.
          const rooted = top.rooted === true || (k >= composed && k < composed + of);
          if (!seen.has(start)) { seen.add(start); stack.push({ scope: start, start, k: -1, rooted }); }
          continue;
        }
        top.scope = top.scope.parent; top.k = -1;
      }
      if (outermost !== undefined) yield outermost;
    }
    static heads = new Set<string>();
    set(key: Key, value: Node): Node {
      (this.methods ??= new Map()).set(key, value);
      if (key instanceof Node) this.ruled = true;
      if (key instanceof Node && !value.forward && key.pattern?.length === 1 && key.pattern[0].kind === 'literal') (this.named ??= new Map()).set(key.pattern[0].text.trim(), value);
      if (key instanceof Node) for (const piece of key.pattern ?? []) if (piece.kind === 'literal') for (const part of piece.text.trim().split(/\s+/)) if (part) Node.heads.add(part);
      return value;
    }

    method(string: string | Text.Node, fn: Method, arity: number = 1) {
      if (!(string instanceof Text.Node) && string.includes('{')) string = Text.Node.string(string);
      const node = new Node(this.diagnostics, string instanceof Text.Node ? string : undefined);
      node.fn = fn; node.arity = arity;
      return this.set(string instanceof Text.Node ? new Node(this.diagnostics, string) : string, node);
    }

    fatal(message: string) { return this.diagnostics.report({ level: 'fatal', message, node: this.position }) }
    error(message: string) { return this.diagnostics.report({ level: 'error', message, node: this.position }) }
    warning(message: string) { return this.diagnostics.report({ level: 'warning', message, node: this.position }) }
    info(message: string) { return this.diagnostics.report({ level: 'info', message, node: this.position }) }
    debug(message: string) { return this.diagnostics.report({ level: 'debug', message, node: this.position }) }
    trace(message: string) { return this.diagnostics.report({ level: 'trace', message, node: this.position }) }

    clone(seen: Map<Node, Node> = new Map()): Node {
      const existing = seen.get(this); if (existing) return existing;
      const copy: Node = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
      seen.set(this, copy);
      const all = (nodes?: Node[]) => nodes?.map(x => x.clone(seen));
      copy.parent = this.parent?.clone(seen);
      copy.closure = this.closure?.clone(seen);
      copy.inlined = this.inlined?.map(x => x.clone(seen));
      copy.made_of = this.made_of?.map(x => x.clone(seen));
      copy.sees = this.sees?.map(x => x.clone(seen));
      copy.value = this.value?.clone(seen);
      copy.applied = all(this.applied);
      copy.modifiers = all(this.modifiers);
      copy.styles = all(this.styles);
      if (this.ref) copy.ref = { ...this.ref, scope: this.ref.scope.clone(seen), self: this.ref.self?.clone(seen), through: undefined };
      if (this.lazy) copy.lazy = { ...this.lazy, frame: this.lazy.frame.clone(seen) };
      if (this.theme) copy.theme = new Map(this.theme);
      if (this.children) copy.children = new Map([...this.children].map(([key, child]) => [key, child.clone(seen)]));
      if (this.members) copy.members = new Map([...this.members].map(([key, child]) => [key, child.clone(seen)]));
      if (this.ruled) copy.ruled = true;
      if (this.methods) {
        copy.methods = new Map();
        for (const [key, value] of this.methods)
          copy.methods.set(key instanceof Node ? key.clone(seen) : key, value.clone(seen));
      }
      if (this.named) copy.named = new Map([...this.named].map(([key, value]) => [key, value.clone(seen)]));
      return copy;
    }
  }

  export type Match = { begin: number; end: number; pattern: number; spanned: boolean; literals: [number, number, number][]; captures: Map<string, Text.Node>; operators: Map<string, Text.Node>; args: Text.Node[]; receiver?: Node; tight: boolean; read?: Map<string, Node>; given?: Node[] }
  export type Found = { rule: Node; impl: Node; match: Match }

  export class Interpreter {
    static PASSES = 8;
    static DEPTH = 512;

    program?: Program
    // Whether this interpreter began the language rather than continuing one:
    // what it may read in its first pass follows from that, not from whether
    // the one before it is still held.
    readonly began: boolean;
    constructor(public diagnostics: Diagnostics, public copy_of?: Interpreter) {
      this.began = copy_of === undefined;
      this.GLOBAL = this.kernel();
    }

    GLOBAL: Node
    BASE?: Node
    theme?: Node
    building?: Node

    EXTERNAL: Node
    NONE: Node
    RETURN: Node
    RECUR: Node
    FORWARD: Node

    frames: Map<string, Node> = new Map();
    forwards: Node[] = [];
    deferred: Node[] = [];
    paints: Text.Node[] = [];
    painted = 0;
    definitions: string[] = [];

    private kernel(): Node {
      const GLOBAL = new Node(this.diagnostics);
      GLOBAL.key = 'GLOBAL';
      GLOBAL.outermost = true;
      this.EXTERNAL = GLOBAL.method('external', ({ interpreter, args: [name], at, frame }) => interpreter.external(name.position!, at, frame), 1);
      this.EXTERNAL.pure = true;
      this.NONE = Object.assign(new Node(this.diagnostics), { none: true, key: 'None' });
      this.RETURN = Object.assign(new Node(this.diagnostics, Text.Node.string('return\\')), { literal: true, key: 'return\\' });
      this.RECUR = Object.assign(new Node(this.diagnostics, Text.Node.string('recur\\')), { literal: true, key: 'recur\\' });
      this.EXTERNAL.reads = 'token';
      this.FORWARD = GLOBAL.method('forward', ({ interpreter, args: [pattern], frame }) => interpreter.forward(pattern.position!, frame), 1);
      this.FORWARD.reads = 'rest';
      return GLOBAL;
    }

    private seen = new Map<Node, Node>();
    refresh() {
      if (!this.copy_of) return;
      const seen = this.seen = new Map<Node, Node>();
      this.GLOBAL = this.copy_of.GLOBAL.clone(seen);
      this.BASE = this.copy_of.BASE?.clone(seen);
      this.theme = this.copy_of.theme?.clone(seen);
      this.EXTERNAL = this.copy_of.EXTERNAL.clone(seen);
      this.NONE = this.copy_of.NONE.clone(seen);
      this.RETURN = this.copy_of.RETURN.clone(seen);
      this.RECUR = this.copy_of.RECUR.clone(seen);
      this.FORWARD = this.copy_of.FORWARD.clone(seen);
      this.frames = new Map([...this.copy_of.frames].map(([key, frame]) => [key, frame.clone(seen)]));
      this.ids = this.copy_of.ids;
    }

    copy(): Interpreter { return new Interpreter(this.diagnostics, this); }

    interpret(srcs: Text.Source[]) {
      const run = this.derive(srcs);
      for (let step = run.next(); !step.done; step = run.next());
    }
    async interpret_async(srcs: Text.Source[], alive: () => boolean): Promise<boolean> {
      const run = this.derive(srcs);
      for (let step = run.next(); !step.done; step = run.next()) {
        await new Promise<void>(resolve => typeof setImmediate === 'function' ? setImmediate(resolve) : setTimeout(resolve, 0));
        if (!alive()) { this.painting = this.paints; this.marking = this.marks; return false; }
      }
      return true;
    }
    *derive(srcs: Text.Source[]): Generator<void> {
      this.refresh();
      const inherited = new Map([this.GLOBAL, ...this.frames.values()].map(frame => [frame, new Set(frame.methods?.keys() ?? [])]));
      let previous: string | undefined;
      for (let pass = 0; pass < Interpreter.PASSES; pass++) {
        this.passing = pass;
        this.forwards = []; this.deferred = []; this.ran = new Set(); this.typings = new Map(); this.painting = []; this.definitions = []; this.touched = new WeakMap(); this.spelled = new Set(); this.claims.clear(); this.sites = new Map(); this.pending_rewrites = [];
        this.marking = this.copy_of !== undefined ? this.inherited() : pass === 0 && !this.began ? this.marking : Interpreter.marks(); this.referenced = new Map(); this.sited = new Map(); this.verbatim = new Map();
        srcs.forEach(src => this.diagnostics.forget(src));
        for (const src of srcs) { this._interpret(src); yield; }
        this.prune(inherited);
        // Frames are fresh per application, so their numbers say nothing about
        // what was defined; the spelling does.
        const signature = [this.BASE?.key, ...this.definitions].join('\n').replace(/#\d+/g, '#');
        // A pass is read again so that what was written after it was read can
        // be read once more. Where nothing was left unread, reading it again
        // answers the same, so once is enough. Only a project derived from
        // another is settled this way: the language writes itself forwards,
        // and settles by its signature repeating.
        if (this.copy_of !== undefined && !this.unread(srcs)) break;
        if (signature === previous) break;
        previous = signature;
      }
      this.analyze();
      // What was cloned from is done with: holding it would hold every pass
      // the language has been through.
      this.copy_of = undefined;
      this.seen = new Map();
      this.painted++;
      this.paints = this.painting;
      this.marks = this.marking;
      this.stale = new Map();
      for (const src of srcs) {
        const before = this.derived.get(src.location);
        if (before !== undefined && before !== src.value) this.reanchor(src.location, before, src.value);
        this.derived.set(src.location, src.value);
      }
    }
    // Whether anything in these sources was read before it was written: a
    // name with nothing behind it, or a `forward` nobody implemented.
    private unread(srcs: Text.Source[]): boolean {
      const here = new Set(srcs.map(src => src.location));
      for (const src of srcs)
        for (const entry of this.diagnostics.of(src)) {
          if (entry.level !== 'error' || !/^Unresolved |declared with `forward`/.test(entry.message)) continue;
          // A name left unread somewhere else is not read by reading these
          // again: what is filed here but written there says nothing about
          // whether this is settled.
          if (entry.at !== undefined && !here.has(entry.at.source.location)) continue;
          return true;
        }
      return false;
    }
    feedback(src: Text.Source) {
      this.diagnostics.forget(src);
      const keep = (paint: Text.Node) => paint.by !== undefined ? paint.by !== src.location : paint.source.location !== src.location;
      this.paints = this.painting = this.paints.filter(keep);
      this.marking = this.marks;
      this.stale.set(src.location, ++this.epoch);
      this.referenced = new Map([...this.referenced].filter(([, painted]) => keep(painted)));
      this.sited = new Map([...this.sited].filter(([, by]) => by !== src.location));
      for (const source of [...this.claims.keys()]) if (source.location === src.location) this.claims.delete(source);
      this.pending_rewrites = this.pending_rewrites.filter(([rule]) => rule.position?.source.location !== src.location);
      this.forwards = this.forwards.filter(rule => rule.position?.source.location !== src.location);
      this.deferred = this.deferred.filter(node => node.lazy!.span.source.location !== src.location);
      this._interpret(src);
      this.analyze(src.location);
      this.painted++;
    }

    attach(owner: Node, key: string, value: Node): Node {
      let keys = this.touched.get(owner);
      if (!keys) this.touched.set(owner, keys = new Set());
      keys.add(key);
      (owner.members ??= new Map()).set(key, value);
      return value;
    }
    touched: WeakMap<Node, Set<Key>> = new WeakMap();
    private spelled = new Set<string>();
    // Whether a definition is new this pass: a body already defined, defined
    // again on another frame (an instance running its class), is not.
    spelled_before(value: Node): boolean { return value.body === undefined || !this.spelled.has(`${value.body.source.location}:${value.body.begin}`); }
    fresh(key: Key, value: Node): boolean {
      if (!(key instanceof Node) || value.body === undefined) return true;
      const spelled = `${value.body.source.location}:${value.body.begin}`;
      if (this.spelled.has(spelled)) return false;
      this.spelled.add(spelled);
      return true;
    }
    bind(frame: Node, key: Key, value: Node): Node {
      let keys = this.touched.get(frame);
      if (!keys) this.touched.set(frame, keys = new Set());
      keys.add(key);
      // A body already defined this pass, defined again on another frame (an
      // instance running its class), changes no cache: only a new one does.
      const fresh = this.fresh(key, value);
      // A frame whose rules were already looked up gains one: what was looked up is stale.
      const stale = key instanceof Node && !frame.methods?.has(key) && (this.rulesets.has(frame) || this.dispatch.has(frame) || this.asked.has(frame));
      if ((fresh || stale) && (key instanceof Node || frame.methods?.get(key)?.forward || value.forward)) this.version++;
      if (key instanceof Node && value.body !== undefined && !value.forward) this.body_of(value.body);
      if (typeof key === 'string' && !frame.methods?.has(key)) this.name_of(frame, key);
      // The registry, and a site's memory of its frame, are of where rules live.
      if (fresh && key instanceof Node && frame.key !== undefined) { this.frames.set(frame.key, frame); if (frame.owner !== undefined && frame.site !== undefined) (frame.owner.children ??= new Map()).set(frame.site, frame); }
      return frame.set(key, value);
    }
    version = 0;
    prune(inherited: Map<Node, Set<Key>>) {
      for (const [key, frame] of [...this.frames]) if (!this.touched.has(frame) && !inherited.has(frame)) this.frames.delete(key);
      const alive = new Set(this.frames.values());
      for (const frame of [this.GLOBAL, ...this.frames.values()]) {
        for (const [local, child] of [...(frame.children ?? [])]) if (!alive.has(child)) frame.children!.delete(local);
        const keep = this.touched.get(frame), base = inherited.get(frame);
        for (const [key, value] of [...(frame.methods ?? [])])
          if (!keep?.has(key) && !base?.has(key) && value !== this.EXTERNAL && value !== this.FORWARD) {
            frame.methods!.delete(key);
            if (key instanceof Node) this.version++;
            else { const names = this.naming.get(frame)?.get(key[0]); const at = names?.indexOf(key) ?? -1; if (names !== undefined && at >= 0) names.splice(at, 1); }
          }
      }
    }
    private _interpret(src: Text.Source) {
      return this.safely(() => this.array(new Text.Node(src), this.GLOBAL, true, true));
    }

    seeking?: { label: string; source: Text.Source; begin: number; end: number };
    jump(label: Node, condition: Node, frame: Node): Node | undefined {
      if (this.seeking !== undefined) return undefined;
      const met = this.diagnostics.muted(() => this.safely(() => this.deref(condition, false)));
      if (met === undefined || met.none) return undefined;
      const name = this.text(label);
      const found = frame.lookup(name);
      const target = found && (this.diagnostics.muted(() => this.safely(() => this.deref(found, false))) ?? found);
      if (target === this.RETURN || name === this.text(this.RETURN)) throw new Jump(name, undefined, 'end');
      if (target === this.RECUR || name === this.text(this.RECUR)) throw new Jump(name, undefined, 'begin');
      throw new Jump(name);
    }
    // A label answers the seek of the body it is written in: the same name in
    // another body run along the way (a nested loop) is that body's label.
    labelled(name: Node): Node | undefined {
      const seek = this.seeking;
      if (seek === undefined || seek.label !== this.text(name)) return undefined;
      let held: Node = name;
      for (let depth = 0; depth < 64; depth++) {
        const next = held.lazy ? held.value ?? this.reference_of(held) : held.ref ? this.bound(held) : undefined;
        if (next === undefined || next === held) break;
        held = next;
      }
      const at = held.lazy?.span ?? held.position;
      if (at === undefined || (at.source === seek.source && at.begin >= seek.begin && at.end < seek.end)) { this.seeking = undefined; this.landed = at?.begin; }
      return undefined;
    }
    again(frame: Node) { for (const value of frame.methods?.values() ?? []) if (value.lazy) value.value = undefined; }
    private landed?: number;
    private landings = new WeakMap<Text.Source, { value: string; at: Map<string, number> }>();
    landing(source: Text.Source): Map<string, number> {
      const known = this.landings.get(source);
      if (known !== undefined && known.value === source.value) return known.at;
      const at = new Map<string, number>();
      this.landings.set(source, { value: source.value, at });
      return at;
    }
    array(cursor: Text.Node, frame: Node, report: boolean = false, functional: boolean = false): Node | undefined {
      let last: Node | undefined;
      const begin = cursor.cursor;
      // A body that jumps back to an earlier point runs again, so whatever it
      // read lazily has to be read again rather than reused.
      while (true) {
        this.spaces(cursor, true);
        if (cursor.done()) return last;
        const start = cursor.cursor;
        let value: Node | undefined;
        try { value = this.expr(cursor, frame); }
        catch (jump) {
          if (jump instanceof Jump && jump.kind === 'end' && jump.value === undefined) jump.value = last;
          if (!(jump instanceof Jump) || this.seeking !== undefined) throw jump;
          if (jump.kind === 'end') {
            if (process.env.RAY_DBG) console.error(`end-jump at ${cursor.source.location?.split('/').pop()} functional=${functional} value=${jump.value ? (jump.value.position?.string ?? jump.value.key ?? '?') : 'none'} last=${last ? (last.position?.string ?? last.key ?? '?') : 'none'}`);
            const own = jump.site === undefined || Interpreter.within(jump.site, cursor.span(begin, cursor.limit - 1));
            if (!functional || !own) { jump.value ??= last; throw jump; }
            return jump.value ?? last;
          }
          if (jump.kind === 'begin') { this.again(frame); cursor.cursor = begin; continue; }
          this.again(frame);
          const place = `${begin}:${cursor.limit}:${jump.label}`;
          const known = this.landing(cursor.source).get(place);
          if (known !== undefined) { cursor.cursor = known; continue; }
          this.landed = undefined;
          this.seeking = { label: jump.label, source: cursor.source, begin, end: cursor.limit };
          if (process.env.RAY_DBG) console.error(`seek ${jump.label} in ${cursor.source.location?.split('/').pop()} at ${this.statements[0]?.source.location?.split("/").pop()}:${this.statements[0]?.line} ${this.statements[0]?.string.slice(0, 40).replace(/\n/g, " ")}`);
          this.diagnostics.muted(() => {
            cursor.cursor = begin;
            while (this.seeking !== undefined && !cursor.done()) {
              this.spaces(cursor, true); if (cursor.done()) break;
              const at = cursor.cursor;
              this.safely(() => { const seen = this.expr(cursor, frame); if (seen !== undefined) this.settle(seen, false); });
              if (cursor.cursor === at) cursor.advance();
              if (this.seeking === undefined && this.landed === at) this.landing(cursor.source).set(place, cursor.cursor);
            }
          });
          if (this.seeking !== undefined) {
            this.seeking = undefined;
            if (!report) throw jump;
            this.error(`No \`${jump.label}\` to jump to.`, cursor.span(start, Math.max(start, cursor.cursor - 1)));
            return last;
          }
          continue;
        }
        if (value !== undefined) {
          this.statements.push(cursor.expression);
          try { last = this.settle(value, report); } finally { this.statements.pop(); }
        }
        if (cursor.cursor === start) cursor.advance();
      }
    }
    settle(value: Node | undefined, report: boolean): Node | undefined {
      if (value?.ref && value.marks?.length) {
        const bound = this.resolved(value);
        if (bound && !bound.ref) this.mark_value(bound, value.marks, [value]);
        const at = value.position;
        if (at && !this.in_body(at)) this.paint_reference(this.reference(value.ref.scope, value.ref.key, at), true, true);
      }
      let node = value;
      for (let depth = 0; node?.ref && depth < 64; depth++) node = this.bound(node);
      if (node?.lazy) return this.force(node);
      if (node === undefined && value?.ref && report) this.deref(value);
      return value;
    }

    spaces(cursor: Text.Node, newlines: boolean = false): number {
      const start = cursor.cursor;
      for (let c = cursor.peek(); c === ' ' || c === '\t' || c === '\r' || (newlines && c === '\n'); c = cursor.peek()) cursor.advance();
      return cursor.cursor - start;
    }

    sites: Map<string, Text.Node> = new Map();
    statements: Text.Node[] = [];
    *definitions_of(): Generator<[Node, Node]> {
      for (const frame of [this.GLOBAL, ...this.frames.values()]) for (const rule of frame.rules) yield [rule, frame.methods!.get(rule)!];
    }

    expr(cursor: Text.Node, frame: Node): Node | undefined {
      cursor.begin_expression();
      this.statements.push(cursor.expression);
      try { return this.statement(cursor, frame); }
      catch (e) {
        if (e instanceof RangeError && this.statements.length === 1) { this.error(`This statement nests deeper than the runtime can follow.`, cursor.expression); return undefined; }
        if (!(e instanceof Recursion) || this.statements.length > 1) throw e;
        this.error(`\`${e.rule.position!.string}\` keeps applying itself (stopped after ${Interpreter.DEPTH} nested applications).`, e.at);
        cursor.cursor = Math.max(cursor.cursor, this.line_end(cursor, cursor.expression.begin, frame, true));
        return undefined;
      }
      finally { this.statements.pop(); }
    }
    safely<T>(fn: () => T): T | undefined {
      try { return fn(); }
      catch (e) { if (e instanceof Recursion) return undefined; throw e; }
    }
    statement(cursor: Text.Node, frame: Node): Node | undefined {
      const comment = this.line_rule(cursor, cursor.cursor, frame, cursor.cursor);
      if (comment) { this.fire(comment, cursor, frame); return undefined; }
      const rule = this.grammar_rule(cursor, frame);
      if (rule !== undefined) { cursor.end_expression(); return rule; }

      const value = this.expression(cursor, frame, false);
      this.spaces(cursor);
      if (!cursor.done() && cursor.peek() !== '\n') {
        const line = this.line_rule(cursor, cursor.cursor, frame);
        if (line) this.fire(line, cursor, frame);
        else {
          const end = this.line_end(cursor, cursor.cursor, frame, false, true);
          this.error(`Unexpected \`${cursor.source.value.slice(cursor.cursor, end)}\`.`, cursor.span(cursor.cursor, Math.max(cursor.cursor, end - 1)));
          cursor.cursor = Math.max(end, cursor.cursor + 1);
        }
      }
      cursor.end_expression();
      return value;
    }

    expression(cursor: Text.Node, frame: Node, operand: boolean, receiver?: Node): Node | undefined {
      let value: Node | undefined = receiver;
      let started = receiver !== undefined;

      while (true) {
        // LTR/RTL: Done through Program pattern matching
        // Precedence: Done through Program pattern matching
        // Resolve expr up to precedence level: Done through a Program Cursor expansion.
          //   if a then b else c
          //   report TRACE var comment
          //   test () => ReturnType, ReturnType{} => {}
          //   enum A | B | C {}
        // Error handling, external report.
        // Highlighting: external theme + ^[*]

        // Grammar rules - Type resolving. Allow arbitary whitespace in between pieces. { }

        // Expression[] if surrounded by literals.

        const before = cursor.cursor;
        const previous = cursor.source.value[before - 1];
        const spaced = this.spaces(cursor) > 0 || (started && (previous === ' ' || previous === '\t'));
        if (cursor.done()) break;

        if (cursor.peek() === '\n') {
          const found = started ? this.best(value, cursor, frame, { newline: true, spaced, operand }) : undefined;
          if (!found) { cursor.cursor = before; break; }
          value = this.fire(found, cursor, frame);
          continue;
        }
        if (started && operand && spaced) { cursor.cursor = before; break; }
        if (started && this.line_rule(cursor, cursor.cursor, frame)) { cursor.cursor = before; break; }

        if (!started) {
          const found = this.best(undefined, cursor, frame, { spaced, operand });
          const name = this.name(cursor, frame);
          if (found && (!name || found.match.end - found.match.begin >= name.length) && !(name && !operand && this.applies(name, found, cursor, frame))) {
            value = this.fire(found, cursor, frame);
            started = true;
            continue;
          }
          // What `.x` is read on is whatever `this` names here.
          let applied: Node | undefined = frame.lookup('this') !== undefined ? this.reference(frame, 'this', cursor.span(cursor.cursor, cursor.cursor)) : undefined;
          for (let scope: Node | undefined = frame; scope && applied === undefined; scope = scope.parent) applied = scope.subject;
          for (let k = this.applying.length - 1; k >= 0 && applied === undefined; k--) {
            const body = this.applying[k].impl?.body;
            if (this.applying[k].receiver === undefined || body === undefined) continue;
            if (body.source.location === cursor.source.location && cursor.cursor >= body.begin && cursor.cursor <= body.end) applied = this.applying[k].receiver;
          }
          const method = this.best(applied ?? frame, cursor, frame, { spaced, operand, self: applied === undefined });
          if (name && !(method && frame.lookup(name) === undefined && method.match.end - method.match.begin >= name.length)) { value = this.reference(frame, name, cursor.span(cursor.cursor, cursor.cursor + name.length - 1)); this.paint_reference(value); cursor.advance(name.length); started = true; continue; }
          // A word naming a method of what `this` is, where nothing else is
          // named so, is a name that falls back to it: declared, it is a new
          // name here; read, it is `this`'s.
          const plain = method?.rule.pattern!.length === 1 ? method.rule.pattern![0] : undefined;
          const word = plain?.kind === 'literal' ? plain.text.trim() : undefined;
          if (method && applied !== undefined && word !== undefined && /^[\p{L}_][\p{L}\p{N}_-]*$/u.test(word) && method.match.end - method.match.begin === word.length) {
            value = this.reference(frame, word, cursor.span(cursor.cursor, cursor.cursor + word.length - 1));
            value.ref!.self = applied;
            this.paint_reference(value);
            cursor.advance(word.length);
            started = true;
            continue;
          }
          if (method) { value = this.fire(method, cursor, frame); started = true; continue; }
          const leading = this.best(undefined, cursor, frame, { spaced, operand, leading: true });
          if (leading) { value = this.fire(leading, cursor, frame); started = true; continue; }
          const token = this.token(cursor, frame);
          if (!token) { cursor.cursor = before; break; }
          value = this.reference(frame, token, cursor.span(cursor.cursor, cursor.cursor + token.length - 1));
          value.ref!.literal = true;
          this.paint_reference(value);
          cursor.advance(token.length);
          started = true;
          continue;
        }

        const reads = value?.ref && !value.marks?.length ? this.bound(value)?.reads : undefined;
        let found = this.best(value, cursor, frame, { spaced, operand, forwards: reads !== undefined });
        const head = found?.match.literals[0];
        const shorter = head !== undefined && this.longest(cursor, head[1], frame) > head[2] + 1;
        if ((!found || shorter) && value?.ref?.literal && this.seeking === undefined && this.bound(value) === undefined && this.diagnostics.muted(() => this.safely(() => this.deref(value, false))) !== undefined)
          found = this.best(value, cursor, frame, { spaced, operand, forwards: reads !== undefined }) ?? found;
        if (found && (this.declares(value, found.rule) || (!(found.match.spanned && this.resolved(value)?.callable) && !(this.resolved(value)?.fn !== undefined && this.opens_call(found.rule))))) { value = this.fire(found, cursor, frame); continue; }

        if (reads) { const at = cursor.cursor; value = this.call(value!, this.raw(cursor, reads), cursor.span(at, Math.max(at, cursor.cursor - 1)), frame); continue; }

        const target = this.deref(value);
        if (this.callable_of(target)) {
          const at = cursor.cursor;
          const grouped = this.claim(cursor, at, frame);
          const end = grouped > at ? grouped : this.operand_end(cursor, at, frame);
          if (end <= at) { cursor.cursor = before; break; }
          const span = cursor.span(at, end - 1);
          cursor.cursor = end;
          value = this.call(value!, this.lazy(span, frame, false), span, frame);
          continue;
        }

        if (spaced) {
          const claimed = this.claim(cursor, cursor.cursor, frame);
          if (claimed > cursor.cursor) {
            if (target !== undefined) this.error(`Unexpected \`${cursor.source.value.slice(cursor.cursor, claimed)}\` after \`${this.text(value)}\`.`, cursor.span(cursor.cursor, claimed - 1));
            cursor.cursor = claimed;
            continue;
          }
          const token = this.token(cursor, frame);
          // A token that heads a rule is not a member name. If one turns up
          // here the rule was out of reach only because nobody had read the
          // value yet, so read it and look once more before giving up — that
          // is what keeps `a <= b` from becoming `a.<`, `=`, `b`.
          if (token !== undefined && Node.heads.has(token) && value?.ref !== undefined && !this.probing) {
            const held = this.bound(value);
            if (held?.lazy !== undefined && held.value === undefined) {
              this.diagnostics.muted(() => this.safely(() => this.deref(value, false)));
              const again = this.best(value, cursor, frame, { spaced, operand, forwards: reads !== undefined });
              if (again) { value = this.fire(again, cursor, frame); continue; }
            }
          }
          if (token) {
            // What heads a rule is not a member name. If the rule could not be
            // reached because the value is not there to reach it with, what is
            // written is left unread and said so, rather than asked of nothing.
            if (Node.heads.has(token) && !this.probing) break;
            const at = cursor.span(cursor.cursor, cursor.cursor + token.length - 1);
            cursor.advance(token.length);
            value = this.member(value!, token, at);
            this.paint_reference(value);
            continue;
          }
        }

        cursor.cursor = before;
        break;
      }
      return value;
    }

    applies(name: string, found: Found, cursor: Text.Node, frame: Node): boolean {
      const [p, begin, end] = found.match.literals[0] ?? [];
      if (p === undefined || begin !== cursor.cursor || end !== cursor.cursor + name.length - 1 || found.rule.pattern![p + 1]?.kind !== 'space') return false;
      if (!this.resolved(this.reference(frame, name, cursor.span(begin, end)))?.callable) return false;
      const at = this.skip(cursor, end + 1);
      if (at === end + 1) return false;
      const operand = this.name(cursor.bounded(at, cursor.limit), frame);
      return operand !== undefined && this.operand_end(cursor, at, frame) === at + operand.length;
    }

    error(message: string, node?: Text.Node) {
      if (this.seeking !== undefined) return;
      this.complain('error', message, node);
    }
    complain(level: Diagnostic['level'], message: string, node?: Text.Node) {
      const statement = this.statements[0];
      if (statement && node && node.source.location !== statement.source.location) return this.diagnostics.report({ level, message, node: statement, at: node });
      this.diagnostics.report({ level, message, node });
    }

    private rulesets = new WeakMap<Node, { version: number; base?: Node; operand: [Node, Node][]; receiver: [Node, Node][] }>();
    // What is composed of what changes without a rule being written, so what
    // a receiver dispatches on is remembered against how often it has.
    composing = 0;
    private dispatch = new WeakMap<Node, { version: number; composing: number; chain: [Node, Node][]; rules: [Node, Node][] }>();
    ruleset(scope: Node): { operand: [Node, Node][]; receiver: [Node, Node][] } {
      const cached = this.rulesets.get(scope);
      if (cached && cached.version === this.version) return cached;
      const operand: [Node, Node][] = [], receiver: [Node, Node][] = [];
      for (const rule of scope.rules.reverse()) {
        const impl = scope.methods!.get(rule)!;
        const leading = rule.pattern![0]?.kind === 'capture';
        const is_operand = impl.forward !== undefined || (scope === this.GLOBAL && !leading);
        if (is_operand && !(impl.forward && impl.params)) operand.push([rule, impl]);
        if (!is_operand || impl.forward) receiver.push([rule, impl]);
      }
      const set = { version: this.version, operand, receiver };
      this.rulesets.set(scope, set);
      return set;
    }
    // Frames whose rules were asked for without being read: they had none.
    private asked = new WeakSet<Node>();
    private chains = new WeakMap<Node, { version: number; base?: Node; operand: [Node, Node][]; receiver: [Node, Node][] }>();
    // A frame that writes no rules of its own sees exactly what the frame
    // above it sees. Frames are made fresh for every application, so asking
    // the one that actually holds rules is what makes any answer reusable.
    rooted(frame: Node): Node {
      let held = frame, seen: Set<Node> | undefined;
      while (held.ruled !== true && held.parent !== undefined) {
        this.asked.add(held);
        if (seen === undefined) seen = new Set([held]);
        if (seen.has(held.parent)) break;
        held = held.parent; seen.add(held);
      }
      return held;
    }
    chain(frame: Node): { operand: [Node, Node][]; receiver: [Node, Node][] } {
      const held = this.rooted(frame);
      if (held !== frame) return this.chain(held);
      const cached = this.chains.get(frame);
      if (cached && cached.version === this.version && cached.base === this.BASE) return cached;
      const scopes = new Set<Node>();
      for (let scope: Node | undefined = frame; scope; scope = scope.parent) scopes.add(scope);
      if (this.BASE) scopes.add(this.BASE);
      const operand: [Node, Node][] = [], receiver: [Node, Node][] = [];
      for (const scope of scopes) {
        const set = this.ruleset(scope);
        operand.push(...set.operand);
        if (scope === this.GLOBAL || scope === this.BASE) receiver.push(...set.receiver);
        else receiver.push(...set.receiver.filter(([, impl]) => impl.forward !== undefined));
      }
      const chain = { version: this.version, base: this.BASE, operand, receiver };
      this.chains.set(frame, chain);
      return chain;
    }
    private declarations = new WeakMap<Node, { version: number; rules: Set<Node> }>();
    private static nothing = new Set<Node>();
    declared(receiver: Node | undefined): Set<Node> {
      const own = receiver && this.resolved(receiver);
      if (!own || own.lazy) return Interpreter.nothing;
      const cached = this.declarations.get(own);
      if (cached && cached.version === this.version) return cached.rules;
      const rules = new Set<Node>();
      const sources = own.inlined === undefined && own.made_of === undefined ? [own] : [...own.composed(new Set())];
      for (const from of sources) if (!this.ambient(from) && from.methods) for (const key of from.methods.keys()) if (key instanceof Node) rules.add(key);
      this.declarations.set(own, { version: this.version, rules });
      return rules;
    }
    ambient(node: Node): boolean {
      for (let scope: Node | undefined = this.GLOBAL; scope; scope = scope.parent) if (scope === node) return true;
      return node === this.BASE;
    }
    declares(receiver: Node | undefined, rule: Node): boolean {
      const own = receiver && this.resolved(receiver);
      if (!own || own.lazy) return false;
      if (own.inlined === undefined && own.made_of === undefined) return !this.ambient(own) && (own.methods?.has(rule) ?? false);
      for (const from of own.composed(new Set())) if (!this.ambient(from) && from.methods?.has(rule)) return true;
      return false;
    }
    private reads = new WeakMap<Node, number>();
    candidates(receiver: Node | undefined, frame: Node, opts: { self?: boolean } = {}): [Node, Node][] {
      if (receiver === undefined) return this.chain(frame).operand;
      let own = this.resolved(receiver);
      const chain = this.chain(frame).receiver;
      if (own === undefined && receiver.ref !== undefined) {
        // A parameter is a value: read it before looking for the rules of what it holds.
        const held = this.bound(receiver);
        if (held?.lazy !== undefined && held.value === undefined && !held.lazy.raw && !this.probing) { this.diagnostics.muted(() => this.safely(() => this.deref(receiver, false))); own = this.resolved(receiver); }
        if (own === undefined) own = held?.declared;
      }
      if (own !== undefined && own.declared !== undefined && own.methods === undefined && own.inlined === undefined && own.made_of === undefined) own = own.declared;
      if (!own || own.lazy) return chain;
      const itself = own === frame && !opts.self;
      if (own.inlined === undefined && own.made_of === undefined) {
        if (!own.methods || itself) return chain;
        const cached = this.dispatch.get(own);
        if (cached && cached.version === this.version && cached.composing === this.composing && cached.chain === chain) return cached.rules;
        const rules = [...this.ruleset(own).receiver, ...chain];
        this.dispatch.set(own, { version: this.version, composing: this.composing, chain, rules });
        return rules;
      }
      if (!itself) {
        const held = this.dispatch.get(own);
        if (held && held.version === this.version && held.composing === this.composing && held.chain === chain) return held.rules;
      }
      const rules: [Node, Node][] = [];
      const seen = new Set<Node>();
      for (const from of own.composed(seen)) if (from.methods && !(itself && from === own)) rules.push(...this.ruleset(from).receiver);
      const dispatched = rules.length > 0 ? [...rules, ...chain] : chain;
      if (!itself) this.dispatch.set(own, { version: this.version, composing: this.composing, chain, rules: dispatched });
      return dispatched;
    }

    analyzing = false;
    private typing = false;
    private rewriting = new Set<Node>();
    private readiness = new WeakMap<Node, { version: number; missing: Text.Node[] }>();
    private handed = new WeakMap<Node, Set<string>>();
    // What every rule hands the text written for it, by the word it is spelled
    // with: gathered once a pass, where the definitions are all there.
    private hands = new Map<string, Set<string>>();
    missing(rule: Node, impl: Node, scope?: Node): Text.Node[] {
      const cached = this.readiness.get(impl);
      if (scope === undefined && cached && cached.version === this.version) return cached.missing;
      // What the body declares, wherever it declares it, is the body's own —
      // which is about what is reported; readiness is answered as before.
      const bound = new Set<string>(['this', ...(impl.params ?? []), ...(scope === undefined ? [] : this.handed.get(rule) ?? []), ...rule.pattern!.flatMap(piece => piece.kind === 'capture' || piece.kind === 'operator' ? [piece.name] : [])]);
      const frame = scope ?? impl.closure ?? this.GLOBAL;
      const heads = new Set<string>([this.RETURN, this.RECUR].flatMap(node => [node.key!, node.key!.replace(/\\$/, '')]));
      const scopes = new Set<Node>();
      for (let scope: Node | undefined = frame; scope; scope = scope.parent) scopes.add(scope);
      if (this.BASE) scopes.add(this.BASE);
      for (const scope of scopes)
        for (const other of scope.rules)
          for (const piece of other.pattern ?? []) if (piece.kind === 'literal') for (const part of piece.text.trim().split(/\s+/)) if (part) heads.add(part);
      for (const part of Node.heads) heads.add(part);
      const missing: Text.Node[] = [], seen = new Set<string>();
      const handed = (span: Text.Node): [number, number, Set<string>][] => {
        const out: [number, number, Set<string>][] = [];
        const text = span.source.value;
        const cursor = this.cursor_of(span);
        for (const found of span.string.matchAll(/[\p{L}_][\p{L}\p{N}_-]*/gu)) {
          const at = span.begin + found.index!;
          const names = this.hands.get(found[0]);
          if (names === undefined || names.size === 0) continue;
          // The text that follows the word is what the rule is handed.
          for (const [bracket] of this.brackets(frame)) {
            let j = at + found[0].length;
            while (j <= span.end && /\s/.test(text[j])) j++;
            const match = this.safely(() => this.match(bracket.pattern!, cursor.bounded(j, span.end + 1), frame, { leading: false, tight: true, params: 0 }));
            if (match) { out.push([j, match.end - 1, names]); break; }
          }
        }
        return out;
      };
      const check = (span: Text.Node) => {
        // Only what is reported cares; readiness is answered as before.
        const given = scope === undefined ? [] : handed(span);
        const text = span.source.value;
        const whole = new Text.Node(span.source);
        const skip = this.safely(() => this.excluded(span, frame)) ?? [];
        const pattern = /[\p{L}_][\p{L}\p{N}_-]*|[^\s\p{L}\p{N}_(){}\[\]`,.:]+/gu;
        let previous: string | undefined;
        for (const found of span.string.matchAll(pattern)) {
          const word = found[0], at = span.begin + found.index!;
          const head = previous !== undefined ? this.rule_head(previous, frame) : undefined;
          const raw = (previous !== undefined && frame.lookup(previous)?.reads !== undefined) || (head !== undefined && head.pattern!.some(piece => piece.kind === 'capture' && piece.raw));
          previous = word;
          if (raw || this.prefixes.has(text[at - 1]) || bound.has(word) || seen.has(word)) continue;
          if (given.some(([begin, end, names]) => at >= begin && at <= end && names.has(word))) continue;
          if (at > 0 && this.starts_rule(whole, at - 1, frame)) continue;
          if (skip.some(([begin, end]) => at >= begin && at <= end)) continue;
          if (frame.lookup(word) !== undefined || heads.has(word)) continue;
          seen.add(word);
          missing.push(span.span(at, at + word.length - 1));
        }
      };
      if (impl.body) check(impl.body);
      for (const piece of rule.pattern!) if (piece.kind === 'operator' && piece.filter) {
        const group = piece.group, offset = group.string.indexOf(piece.filter);
        if (offset >= 0) check(group.span(group.begin + offset, group.begin + offset + piece.filter.length - 1));
      }
      if (scope === undefined) this.readiness.set(impl, { version: this.version, missing });
      return missing;
    }

    best(receiver: Node | undefined, cursor: Text.Node, frame: Node, opts: { newline?: boolean; spaced: boolean; operand: boolean; forwards?: boolean; self?: boolean; leading?: boolean }): Found | undefined {
      let best: Found | undefined;
      const set = opts.leading
        ? this.only(this.chain(frame).receiver, true)
        : opts.self
          ? this.only(this.candidates(receiver, frame, { self: true }), false)
          : this.candidates(receiver, frame);
      const ahead = cursor.source.value[this.skip(cursor, cursor.cursor)];
      for (const [rule, impl] of set) {
        const shape = this.shaped(rule);
        if (shape.literal) continue;
        if (shape.head !== undefined && ahead !== undefined && shape.head !== ahead) continue;
        if (opts.forwards && !impl.forward) continue;
        if (!!opts.newline !== shape.newline) continue;
        if (shape.operator && (this.rewriting.has(rule) || this.missing(rule, impl).length > 0)) continue;
        const pieces = rule.pattern!;
        const leading = shape.leading;
        const match = this.match(pieces, cursor, frame, { receiver, leading, spaced: opts.spaced, operand: opts.operand, tight: opts.operand || (receiver !== undefined && !opts.spaced), params: impl.params?.length ?? 0, owned: pieces[0]?.kind === 'space' && this.declares(receiver, rule), closure: impl.closure });
          if (!match) continue;
        const loose = shape.loose;
        const own = match.pattern - match.begin, current = best ? best.match.pattern - best.match.begin : -1;
        const length = match.end - match.begin, total = best ? best.match.end - best.match.begin : -1;
        // A rule that only asks for a space where one already is stays behind
        // a rule that spells the same ground out, but never ahead of a longer
        // reading of it.
        const tie = best !== undefined && (best.rule.pattern![0]?.kind === 'space') !== loose ? (loose ? -1 : 1) : 0;
        if (best && best.match.spanned !== match.spanned) { if (match.spanned) continue; best = { rule, impl, match }; continue; }
        if (own > current || (own === current && (length > total || (length === total && (tie > 0 || (tie === 0 && best!.impl.forward && !impl.forward)))))) best = { rule, impl, match };
      }
      return best;
    }

    private onlys = new WeakMap<[Node, Node][], [Node, Node][]>();
    only(set: [Node, Node][], leading: boolean): [Node, Node][] {
      let kept = this.onlys.get(set);
      if (kept !== undefined) return kept;
      kept = leading
        ? set.filter(([rule]) => rule.pattern![0]?.kind === 'capture')
        : set.filter(([rule]) => { const first = rule.pattern![0]; return first?.kind !== 'capture' || first.raw; });
      this.onlys.set(set, kept);
      return kept;
    }
    // Which brackets hold parameters is not the engine's to know: the rule that
    // defines a method says so by styling that capture `^parameter`, and the
    // entrypoint declares its shape up front with `forward`.
    private grouping(frame: Node): [string, string] | undefined {
      return this.answered(frame, 'grouping', scopes => this.grouped_by(scopes));
    }
    private grouped_by(scopes: Node[]): [string, string] | undefined {
      for (const scope of scopes)
        for (const rule of scope.rules) {
          const pieces = rule.pattern;
          if (!pieces || pieces.length < 3) continue;
          const open = pieces[0], inner = pieces[1], close = pieces[2];
          if (open.kind !== 'literal' || close.kind !== 'literal' || inner.kind !== 'capture') continue;
          if (!inner.styles.some(style => style.string.replace(/^\^/, '').trim() === 'parameter')) continue;
          const from = open.text.trim(), to = close.text.trim();
          if (from.length > 0 && to.length > 0) return [from, to];
        }
      return undefined;
    }
    // What opens a block is whatever bracket rule holds a capture marked
    // `^block`: a block is one thing, never a list of them, so an argument
    // written as one is not split.
    private scoped(frame: Node): string | undefined {
      return this.answered(frame, 'block', scopes => this.scoping(scopes));
    }
    private scoping(scopes: Node[]): string | undefined {
      for (const scope of scopes)
        for (const rule of scope.rules) {
          const pieces = rule.pattern;
          if (!pieces || pieces.length < 3) continue;
          const open = pieces[0], inner = pieces[1];
          if (open.kind !== 'literal' || inner.kind !== 'capture') continue;
          if (!inner.styles.some(style => style.string.replace(/^\^/, '').trim() === 'block')) continue;
          const from = open.text.trim();
          if (from.length > 0) return from;
        }
      return undefined;
    }
    // The rest of a parameter list the same way: which literal separates one
    // parameter from the next, and which one puts a type on it, is whatever the
    // rules marked `^separator` and `^annotation` say. Rule styles are read off
    // the definition head before any parameter list is parsed, so this holds
    // while the entrypoint is still defining itself.
    // What the rules say about a spelling depends only on which rules are
    // visible, so it is asked once of the frame that holds them.
    private answers = new WeakMap<Node, { version: number; of: Map<string, string | [string, string] | undefined> }>();
    private answered<T extends string | [string, string] | undefined>(frame: Node, key: string, ask: (scopes: Node[]) => T): T {
      const root = this.rooted(frame);
      let held = this.answers.get(root);
      if (held === undefined || held.version !== this.version) this.answers.set(root, held = { version: this.version, of: new Map() });
      if (held.of.has(key)) return held.of.get(key) as T;
      const scopes: Node[] = [];
      for (let scope: Node | undefined = root; scope; scope = scope.parent) scopes.push(scope);
      if (this.BASE) scopes.push(this.BASE);
      const answer = ask(scopes);
      held.of.set(key, answer);
      return answer;
    }
    private marked(frame: Node, style: string): string | undefined {
      return this.answered(frame, `marked ${style}`, scopes => this.marks_style(scopes, style));
    }
    private marks_style(scopes: Node[], style: string): string | undefined {
      for (const scope of scopes)
        for (const rule of scope.rules) {
          const pieces = rule.pattern;
          if (!pieces || pieces.length !== 1 || pieces[0].kind !== 'literal') continue;
          const impl = scope.methods?.get(rule);
          if (!impl?.decorators?.some(each => each.string.replace(/^\^/, '').trim() === style)) continue;
          const text = pieces[0].text.trim();
          // A literal with a space in it is a rule whose own parameter list has
          // not been taken apart yet; it cannot be what marks the spelling.
          if (text.length > 0 && !/\s/.test(text)) return text;
        }
      return undefined;
    }
    private words = new Map<string, string[]>();
    literal(cursor: Text.Node, j: number, literal: string): number {
      const text = cursor.source.value, limit = cursor.limit;
      let parts = this.words.get(literal);
      if (!parts) this.words.set(literal, parts = literal.split(/\s+/).filter(Boolean));
      for (let k = 0; k < parts.length; k++) {
        const part = parts[k];
        if (k > 0) while (j < limit && (text[j] === ' ' || text[j] === '\t')) j++;
        if (j + part.length > limit || !text.startsWith(part, j)) return -1;
        j += part.length;
      }
      return j;
    }
    skip(cursor: Text.Node, j: number): number {
      const text = cursor.source.value;
      while (j < cursor.limit && (text[j] === ' ' || text[j] === '\t' || text[j] === '\r')) j++;
      return j;
    }

    optional(pieces: Piece[], p: number): number {
      if (pieces[p]?.kind !== 'literal') return -1;
      let k = p + 1;
      while (pieces[k]?.kind === 'space') k++;
      const inner = pieces[k];
      if (inner?.kind !== 'capture' || !inner.optional) return -1;
      let close = k + 1;
      while (pieces[close]?.kind === 'space') close++;
      return pieces[close]?.kind === 'literal' ? close : k;
    }
    typed_end(piece: Piece & { kind: 'capture' }, cursor: Text.Node, from: number, end: number, frame: Node, closure: Node): { end: number; value?: Node } | undefined {
      for (const until of [end, this.token_end(cursor, from, frame)]) {
        if (until <= from || until > end) continue;
        const value = this.typed(piece.type!, cursor.span(from, until - 1), closure);
        if (value === null) continue;
        return { end: until, value: value ?? undefined };
      }
      return undefined;
    }
    match(pieces: Piece[], cursor: Text.Node, frame: Node, opts: { receiver?: Node; leading: boolean; tight: boolean; params: number; spaced?: boolean; owned?: boolean; operand?: boolean; closure?: Node }): Match | undefined {
      const text = cursor.source.value, limit = cursor.limit;
      let i = cursor.cursor;
      const captures = new Map<string, Text.Node>(), operators = new Map<string, Text.Node>();
      let read: Map<string, Node> | undefined;
      const literals: [number, number, number][] = [];
      const juxtaposition = pieces[opts.leading ? 1 : 0]?.kind === 'space';
      let spanned = false, skipped = false;
      for (let p = 0; p < pieces.length; p++) {
        const piece = pieces[p];
        // What a capture gave back is not a gap in the pattern: a capture that
        // stops before the literal closing it leaves that space behind itself.
        const gave = skipped;
        if (piece.kind !== 'space') skipped = false;
        // What is taken as written is taken from where it starts: a raw capture
        // neither skips the space before it nor gives back the space it ends
        // on, so a written text that is only a space is that space.
        const as_written = piece.kind === 'capture' && piece.raw && pieces[p - 1]?.kind === 'literal';
        const from = p === 0 || (p === 1 && opts.leading) || as_written ? i : this.skip(cursor, i);
        if (from > i && !gave && piece.kind !== 'space' && pieces[p - 1]?.kind !== 'space') spanned = true;
        switch (piece.kind) {
          case 'literal': {
            const word = /[\p{L}\p{N}_]/u;
            let j = this.literal(cursor, from, piece.text);
            const edge = piece.text.trim();
            const hugged = pieces[p + 1]?.kind === 'capture' && (pieces[p + 1] as { type?: string }).type !== undefined;
            if (j >= 0 && edge.length > 0 && ((word.test(edge[0]) && from > 0 && word.test(text[from - 1])) || (!hugged && word.test(edge[edge.length - 1]) && text[j] !== undefined && word.test(text[j])))) j = -1;
            if (j < 0) {
              const close = this.optional(pieces, p);
              if (close < 0) return;
              for (let k = p + 1; k <= close; k++) { const inner = pieces[k]; if (inner.kind === 'capture') captures.set(inner.name, cursor.span(i, i - 1)); }
              p = close;
              skipped = true;
              break;
            }
            literals.push([p, from, j - 1]); i = j; break;
          }
          case 'space': { const j = this.skip(cursor, i); if (j === i && i < limit && text[i] !== '\n' && !skipped && !(p === 0 && opts.owned && opts.spaced)) return; i = j; break; }
          case 'newline': { if (text[from] !== '\n') return; i = from + 1; break; }
          case 'operator': { const j = this.operator_end(cursor, from, frame); if (j <= from) return; operators.set(piece.name, cursor.span(from, j - 1)); i = j; break; }
          case 'capture': {
            // A capture that stands for the receiver, spelled right against
            // what follows, admits no space between them.
            if (p === 0 && opts.leading && opts.receiver !== undefined) { if (opts.spaced && pieces[1]?.kind !== 'space') return; break; }
            let next_at = -1, upcoming_at = -1, literal_at = -1;
            for (let k = p + 1; k < pieces.length; k++) {
              const kind = pieces[k].kind;
              if (next_at < 0 && kind !== 'capture') next_at = k;
              if (upcoming_at < 0 && kind !== 'space') upcoming_at = k;
              if (literal_at < 0 && kind === 'literal') literal_at = k;
              if (next_at >= 0 && upcoming_at >= 0 && literal_at >= 0) break;
            }
            const next = next_at < 0 ? undefined : pieces[next_at];
            let end: number;
            if (p === 0 && opts.leading) {
              end = this.word_end(cursor, from, frame);
              if (end <= from) return;
              if (piece.type !== undefined) {
                const typed = this.typed_end(piece, cursor, from, end, frame, opts.closure ?? this.GLOBAL);
                if (typed === undefined) return;
                end = typed.end;
                if (typed.value !== undefined) (read ??= new Map()).set(piece.name, typed.value);
              }
              captures.set(piece.name, cursor.span(from, end - 1));
              i = end;
              break;
            }
            const upcoming = upcoming_at < 0 ? undefined : pieces[upcoming_at];
            const terminator = piece.optional && upcoming?.kind !== 'capture' && literal_at >= 0 ? pieces[literal_at] : undefined;
            if (upcoming?.kind === 'capture') end = piece.raw ? this.word_end(cursor, from, frame) : piece.optional ? this.claim(cursor, from, frame) : this.operand_end(cursor, from, frame);
            else if (terminator?.kind === 'literal' && this.optional(pieces, literal_at) >= 0) {
              end = this.until(cursor, from, terminator.text, frame, piece.raw);
              if (end < 0) end = this.line_end(cursor, from, frame, piece.raw);
              while (!as_written && end > from && /[ \t]/.test(text[end - 1])) { end--; skipped = true; }
            }
            else if (next?.kind === 'literal') {
              end = this.until(cursor, from, next.text, frame, piece.raw);
              if (end < 0 && this.optional(pieces, next_at) >= 0) end = this.line_end(cursor, from, frame, piece.raw);
              while (!as_written && end > from && /[ \t]/.test(text[end - 1])) { end--; skipped = true; }
            }
            else if (next?.kind === 'newline') end = this.line_end(cursor, from, frame, piece.raw);
            else if (next?.kind === 'space') end = this.word_end(cursor, from, frame);
            else if (next?.kind === 'operator') end = this.operand_end(cursor, from, frame);
            else if (next === undefined && p === pieces.length - 1) end = (piece.raw && opts.receiver !== undefined) || juxtaposition || opts.tight || opts.params > 0 || pieces[p - 1]?.kind === 'space' ? this.operand_end(cursor, from, frame, piece.raw) : this.line_end(cursor, from, frame, piece.raw);
            else return;
            if (end === from && piece.optional) { captures.set(piece.name, cursor.span(from, from - 1)); skipped = true; break; }
            if (!piece.raw && end > from) { const seen = text.slice(from, end).trim(); if (seen.length > 0 && !/[\p{L}\p{N}_]/u.test(seen[0]) && Node.heads.has(seen)) return; }
            if (end < from || (end === from && next?.kind !== 'literal')) return;
            if (!piece.raw && next === undefined && end === from + 1 && !/[\p{L}\p{N}_]/u.test(text[from])) return;
            if (piece.type !== undefined && end > from) {
              const typed = this.typed_end(piece, cursor, from, end, frame, opts.closure ?? this.GLOBAL);
              if (typed === undefined) return;
              end = typed.end;
              if (typed.value !== undefined) (read ??= new Map()).set(piece.name, typed.value);
            }
            captures.set(piece.name, cursor.span(from, end - 1));
            i = end;
            break;
          }
        }
      }
      const pattern = i;
      const args: Text.Node[] = [];
      if (opts.params > 1) {
        const from = this.skip(cursor, i);
        const group = from < cursor.limit ? this.claim(cursor, from, frame) : from;
        const listed = group > from ? this.listed(cursor.span(from, group - 1), frame) : undefined;
        if (listed !== undefined && listed.length === opts.params) { args.push(...listed); i = group; }
      }
      if (args.length === 0) for (let k = 0; k < opts.params; k++) {
        const from = this.skip(cursor, i);
        if (from >= limit || text[from] === '\n') return;
        // An argument written against what takes it is only that argument:
        // `f(x) == y` hands `f` the `(x)`. Written after a space it is the
        // whole of what follows: `name: a - b` reads all of `a - b`.
        const hugged = opts.operand || from === i;
        // An argument written against what takes it is only what it is written
        // as: `f(x).y` hands `f` the `(x)`, and asks `.y` of the answer.
        const claimed = from === i ? this.claim(cursor, from, frame) : from;
        const end = claimed > from ? claimed : k < opts.params - 1 || hugged ? this.operand_end(cursor, from, frame) : this.line_end(cursor, from, frame);
        if (end <= from) return;
        // As with a capture, an argument is not a bare operator: `joined := x`
        // declares `joined`, it does not call a method of that name with `:=`.
        const seen = text.slice(from, end).trim();
        if (seen.length > 0 && !/[\p{L}\p{N}_]/u.test(seen[0]) && Node.heads.has(seen)) return;
        args.push(cursor.span(from, end - 1));
        i = end;
      }
      if (i === cursor.cursor) return;
      return { begin: cursor.cursor, end: i, pattern, spanned, literals, captures, operators, args, receiver: opts.receiver, tight: opts.tight, read };
    }

    private claims = new Map<Text.Source, { version: number; memo: Map<number, number> }>();
    private nesting = 0;
    private lexical?: { version: number; brackets: [Node, Node][]; lines: [Node, Node][]; signature: string };
    private bracketing = 0;
    get layers(): { version: number; brackets: [Node, Node][]; lines: [Node, Node][]; signature: string } {
      if (this.lexical?.version === this.version) return this.lexical;
      const brackets: [Node, Node][] = [], lines: [Node, Node][] = [];
      for (const [rule, impl] of this.ruleset(this.GLOBAL).operand) {
        const pieces = rule.pattern!;
        if (impl.forward || pieces[0]?.kind !== 'literal') continue;
        const opening = pieces[0].text.trim();
        if (pieces.length >= 3 && pieces[pieces.length - 1].kind === 'literal' && opening.length > 0 && !/[\p{L}\p{N}_]/u.test(opening[0])) brackets.push([rule, impl]);
        // A line is taken verbatim by a rule whose one capture is text (a
        // comment); a capture that is an expression makes a prefix operator.
        if (pieces.length === 2 && pieces[1].kind === 'capture' && pieces[1].raw) lines.push([rule, impl]);
      }
      const signature = brackets.map(([rule]) => rule.key).join('\n');
      if (signature !== this.lexical?.signature) this.bracketing++;
      return this.lexical = { version: this.version, brackets, lines, signature };
    }
    brackets(frame: Node): [Node, Node][] { return this.layers.brackets; }
    claim(cursor: Text.Node, j: number, frame: Node): number {
      const brackets = this.layers.brackets;
      let entry = this.claims.get(cursor.source);
      if (!entry || entry.version !== this.bracketing) this.claims.set(cursor.source, entry = { version: this.bracketing, memo: new Map() });
      let end = entry.memo.get(j);
      if (end === undefined) {
        if (this.nesting >= Interpreter.DEPTH) return j;
        entry.memo.set(j, j);
        end = j;
        this.nesting++;
        try {
          const text = cursor.source.value;
          const probe = new Text.Node(cursor.source);
          probe.cursor = j;
          for (const [rule] of brackets) {
            const first = rule.pattern![0] as { text: string };
            if (text[j] !== first.text[0]) continue;
            const match = this.match(rule.pattern!, probe, this.GLOBAL, { leading: false, tight: true, params: 0 });
            if (match && match.end > end) end = match.end;
          }
        } finally { this.nesting--; }
        entry.memo.set(j, end);
      }
      return end <= cursor.limit ? end : j;
    }
    line_rule(cursor: Text.Node, j: number, frame: Node, statement?: number): Found | undefined {
      const text = cursor.source.value;
      let probe: Text.Node | undefined;
      for (const [rule, impl] of this.layers.lines) {
        const pieces = rule.pattern!;
        if (text[j] !== (pieces[0] as { text: string }).text[0]) continue;
        if (statement !== undefined && rule.position?.source.location === cursor.source.location && text.startsWith(rule.position.string, statement)) continue;
        probe ??= cursor.bounded(j, cursor.limit);
        const match = this.match(pieces, probe, frame, { leading: false, tight: false, params: 0, closure: impl.closure });
        if (match) return { rule, impl, match };
      }
    }

    until(cursor: Text.Node, j: number, literal: string, frame: Node, raw: boolean): number {
      const limit = cursor.limit;
      while (j < limit) {
        if (this.literal(cursor, j, literal) >= 0) return j;
        const claimed = raw ? j : this.claim(cursor, j, frame);
        j = claimed > j ? claimed : j + 1;
      }
      return -1;
    }
    line_end(cursor: Text.Node, j: number, frame: Node, raw: boolean = false, lines: boolean = false): number {
      const text = cursor.source.value, limit = cursor.limit, start = j;
      while (j < limit && text[j] !== '\n') {
        if (lines && !raw && j > start && this.line_rule(cursor, j, frame)) break;
        const claimed = raw ? j : this.claim(cursor, j, frame);
        j = claimed > j ? claimed : j + 1;
      }
      while (j > start && (text[j - 1] === ' ' || text[j - 1] === '\t' || text[j - 1] === '\r')) j--;
      return j;
    }
    private boundaries = new WeakMap<Node, { version: number; base?: Node; edges: Set<string> }>();
    edges(frame: Node): Set<string> {
      const cached = this.boundaries.get(frame);
      if (cached && cached.version === this.version && cached.base === this.BASE) return cached.edges;
      const edges = new Set<string>();
      const add = (rule: Node) => { const first = rule.pattern!.find(x => x.kind !== 'capture'); if (first?.kind === 'literal' && !/[\p{L}\p{N}_]/u.test(first.text[0])) edges.add(first.text[0]); };
      for (let scope: Node | undefined = frame; scope; scope = scope.parent) scope.rules.forEach(add);
      this.BASE?.rules.forEach(add);
      this.boundaries.set(frame, { version: this.version, base: this.BASE, edges });
      return edges;
    }
    token_end(cursor: Text.Node, j: number, frame: Node): number {
      const text = cursor.source.value, limit = cursor.limit, start = j, edges = this.edges(frame);
      while (j < limit && !/\s/.test(text[j]) && (j === start || !edges.has(text[j]))) j++;
      return j;
    }
    raw_end(cursor: Text.Node, j: number, frame: Node): number {
      const text = cursor.source.value, limit = cursor.limit, start = j;
      // A rule that could start further along does not cut this short while a
      // longer rule still spells the same ground: `.<=` reads `<=`, not `<`,
      // and only a space breaks the two apart.
      const longest = this.longest(cursor, start, frame);
      while (j < limit && !/\s/.test(text[j]) && (j === start || j < longest || !this.starts_rule(cursor, j, frame))) j++;
      return j;
    }
    private spellings?: { size: number; heads: string[] };
    longest(cursor: Text.Node, j: number, frame: Node): number {
      // Every literal any rule spells, longest first — a rule on a type the
      // receiver has is not in this frame's chain, but `.<=` still has to read
      // `<=` rather than stop at the `=` that starts another rule.
      if (this.spellings?.size !== Node.heads.size) this.spellings = { size: Node.heads.size, heads: [...Node.heads].filter(head => head.length > 1).sort((a, b) => b.length - a.length) };
      const text = cursor.source.value, limit = cursor.limit;
      for (const head of this.spellings.heads) {
        if (j + head.length > limit || !text.startsWith(head, j)) continue;
        return j + head.length;
      }
      return j;
    }
    private static word = /[\p{L}\p{N}_]/u;
    begins(cursor: Text.Node, j: number, literal: string): boolean {
      const text = cursor.source.value, word = Interpreter.word;
      if (word.test(literal[0]) && j > 0 && word.test(text[j - 1])) return false;
      const end = this.literal(cursor, j, literal);
      if (end <= j) return false;
      const after = text[end];
      return !(word.test(literal[literal.length - 1]) && after !== undefined && word.test(after));
    }
    starts_rule(cursor: Text.Node, j: number, frame: Node): boolean {
      const chain = this.chain(frame);
      for (const set of [chain.receiver, chain.operand])
        for (const [rule, impl] of set) {
          const first = rule.pattern![0];
          if (impl.forward || first?.kind !== 'literal') continue;
          if (this.begins(cursor, j, first.text)) return true;
        }
      for (const [rule] of this.brackets(frame)) {
        const last = rule.pattern![rule.pattern!.length - 1];
        if (last?.kind === 'literal' && this.begins(cursor, j, last.text)) return true;
      }
      return false;
    }
    operator_end(cursor: Text.Node, j: number, frame: Node): number {
      let end = j;
      for (const [rule, impl] of this.chain(frame).receiver) {
        const first = rule.pattern![0];
        if (impl.forward || first?.kind !== 'literal' || rule.pattern!.some(piece => piece.kind === 'operator')) continue;
        const k = this.literal(cursor, j, first.text);
        if (k > end) end = k;
      }
      return end;
    }
    word_end(cursor: Text.Node, j: number, frame: Node): number {
      const text = cursor.source.value, limit = cursor.limit;
      const claimed = this.claim(cursor, j, frame);
      if (claimed > j) return claimed;
      if (this.edges(frame).has(text[j])) return j;
      while (j < limit && !/\s/.test(text[j]) && this.claim(cursor, j, frame) === j) j++;
      return j;
    }
    operand_end(cursor: Text.Node, j: number, frame: Node, raw: boolean = false): number {
      const text = cursor.source.value, limit = cursor.limit;
      if (raw) return this.raw_end(cursor, j, frame);
      while (j < limit && !/\s/.test(text[j])) {
        const claimed = this.claim(cursor, j, frame);
        j = claimed > j ? claimed : this.token_end(cursor, j, frame);
      }
      return j;
    }

    private naming = new WeakMap<Node, Map<string, string[]>>();
    name_of(scope: Node, key: string) {
      const index = this.naming.get(scope);
      if (index === undefined || key.length === 0) return;
      let names = index.get(key[0]);
      if (names === undefined) index.set(key[0], names = []);
      let at = 0;
      while (at < names.length && names[at].length > key.length) at++;
      names.splice(at, 0, key);
    }
    private named(scope: Node): Map<string, string[]> | undefined {
      if ((scope.methods?.size ?? 0) < 24) return undefined;
      let index = this.naming.get(scope);
      if (index !== undefined) return index;
      index = new Map<string, string[]>();
      this.naming.set(scope, index);
      for (const key of scope.methods!.keys()) if (typeof key === 'string' && key.length > 0) {
        let names = index.get(key[0]);
        if (names === undefined) index.set(key[0], names = []);
        names.push(key);
      }
      for (const names of index.values()) names.sort((a, b) => b.length - a.length);
      return index;
    }
    name(cursor: Text.Node, frame: Node): string | undefined {
      const text = cursor.source.value, word = Interpreter.word;
      let best: string | undefined;
      for (let scope: Node | undefined = frame; scope; scope = scope.parent) {
        const index = this.named(scope);
        const keys = index === undefined ? scope.methods?.keys() : index.get(text[cursor.cursor]);
        for (const key of keys ?? []) {
          if (typeof key !== 'string' || key.length === 0 || (best && key.length <= best.length) || !cursor.at(key)) continue;
          const after = text[cursor.cursor + key.length];
          if (word.test(key[key.length - 1]) && after !== undefined && word.test(after)) continue;
          best = key;
        }
      }
      return best;
    }
    token(cursor: Text.Node, frame: Node): string | undefined {
      const end = this.token_end(cursor, cursor.cursor, frame);
      return end > cursor.cursor ? cursor.source.value.slice(cursor.cursor, end) : undefined;
    }
    raw(cursor: Text.Node, reads: 'token' | 'rest'): Node {
      this.spaces(cursor);
      const text = cursor.source.value, start = cursor.cursor;
      let end = start;
      if (reads === 'token') while (end < cursor.limit && !/\s/.test(text[end])) end++;
      else { while (end < cursor.limit && text[end] !== '\n') end++; while (end > start && /\s/.test(text[end - 1])) end--; }
      cursor.cursor = end;
      const node = new Node(this.diagnostics, cursor.span(start, end - 1));
      node.literal = true;
      return node;
    }

    cursor_of(span: Text.Node): Text.Node {
      const cursor = new Text.Node(span.source);
      cursor.cursor = span.begin; cursor.until = span.end + 1;
      return cursor;
    }
    lazy(span: Text.Node, frame: Node, raw: boolean): Node {
      const node = new Node(this.diagnostics, span);
      node.lazy = { span, frame, raw, probe: this.probing > 0 };
      return node;
    }
    reference(frame: Node, key: string, at: Text.Node): Node {
      const node = new Node(this.diagnostics, at);
      node.ref = { scope: frame, key };
      return node;
    }
    bound(node: Node): Node | undefined {
      const ref = node.ref!;
      const found = ref.member ? ref.scope.member(ref.key) : ref.own ? ref.scope.own(ref.key) : ref.scope.lookup(ref.key);
      if (found !== undefined) return found;
      if (ref.self === undefined) return ref.through;
      return ref.through ??= this.get(ref.self, Object.assign(new Node(this.diagnostics, node.position), { literal: true }));
    }
    // What a node stands for once read: through references, and through what
    // a read lazy already holds, until a value.
    resolved(node: Node | undefined): Node | undefined {
      for (let depth = 0; node !== undefined && depth < 64; depth++) {
        if (node.ref) node = this.bound(node);
        else if (node.lazy) node = node.value;
        else break;
      }
      return node;
    }
    deref(node: Node | undefined, report: boolean = true, read: boolean = true): Node | undefined {
      const marks: Node[] = [], sources: Node[] = [];
      for (let depth = 0; node && (node.ref || node.lazy) && depth < 64; depth++) {
        if (node.marks) { marks.push(...node.marks); sources.push(node); }
        if (node.lazy) { node = this.force(node); continue; }
        const bound = this.bound(node) ?? (read && node.ref!.literal && this.seeking === undefined ? this.literally(node) : undefined);
        if (bound === undefined) {
          if (report && !node.ref!.scope.unknown && !this.analyzing && !(node.ref!.member && this.probing)) this.error(`Unresolved \`${node.ref!.key}\`.`, node.position); return undefined;
        }
        node = bound;
      }
      if (node && marks.length) this.mark_value(node, marks, sources);
      return node;
    }
    force(node: Node): Node | undefined {
      if (node.value !== undefined || !node.lazy) return node.value;
      const { span, frame, raw } = node.lazy;
      if (this.probing && !node.lazy.probe) return new Node(this.diagnostics, span);
      if (raw) { const literal = new Node(this.diagnostics, span); literal.literal = true; return node.value = literal; }
      node.value = new Node(this.diagnostics, span);
      return node.value = this.array(this.cursor_of(span), frame);
    }
    private texts = new WeakMap<Node, { version: number; text: string }>();
    text(node: Node | undefined, depth: number = 0): string {
      if (!node) return '';
      const cached = this.texts.get(node);
      if (cached?.version === this.version) return cached.text;
      const text = this.texted(node, depth);
      this.texts.set(node, { version: this.version, text });
      return text;
    }
    private texted(node: Node, depth: number): string {
      const peeled = this.peel(node);
      const deep = peeled === undefined || peeled === node ? this.deepest(node) : undefined;
      const value = this.diagnostics.muted(() => this.safely(() => this.deref(node, false, false)));
      if (value?.literal) return value.position!.string;
      const target = deep ?? peeled ?? node;
      if (target.lazy) return target.lazy.span.string;
      if (target.ref) {
        const bound = this.bound(target);
        if (bound !== undefined && bound !== target && depth < Interpreter.DEPTH) return this.text(bound, depth + 1);
        return target.position?.string ?? target.ref.key;
      }
      return (value ?? target).position?.string ?? '';
    }
    deepest(node: Node): Node | undefined {
      let current: Node | undefined = node, last: Node | undefined;
      for (let depth = 0; current && depth < Interpreter.DEPTH; depth++) {
        let next: Node | undefined;
        if (current.ref) { last = current; next = this.bound(current); }
        else if (current.lazy) next = this.diagnostics.muted(() => this.safely(() => this.reference_of(current!)));
        if (next === undefined || next === current) break;
        current = next;
      }
      return last;
    }

    member(value: Node, key: string, at: Text.Node): Node {
      const node = new Node(this.diagnostics, at);
      node.ref = { scope: this.deref(value) ?? this.unknown(at), key, own: true };
      return node;
    }
    unknown(at?: Text.Node): Node { return Object.assign(new Node(this.diagnostics, at), { unknown: true }); }
    get(node: Node, key: Node | undefined): Node {
      if (key === undefined) return this.unknown(node?.position);
      const target = this.deref(node);
      const forced = this.deref(key, false);
      const name = forced?.literal ? forced.position!.string : this.text(key);
      if (target?.style !== undefined) return this.style(`${target.style}.${name}`);
      const method = target && this.method_of(target, name);
      if (method) return this.apply({ rule: method[0], impl: method[1], match: this.trivial(target, key.position ?? node.position!) }, this.cursor_of(key.position ?? node.position!), target, key.position ?? node.position!);
      const parameterised = target && this.method_of(target, name, { parameterised: true });
      if (parameterised) {
        const [rule, impl] = parameterised;
        const at = key.position ?? node.position!;
        const bound = new Node(this.diagnostics, at);
        bound.arity = impl.params!.length;
        bound.fn = ({ interpreter, frame, args }) => {
              const spans = args.map(argument => argument.lazy?.span ?? argument.position).filter((span): span is Text.Node => span !== undefined);
          if (spans.length < impl.params!.length) return undefined;
          const match = { ...interpreter.trivial(target, at), args: spans };
          return interpreter.apply({ rule, impl, match }, interpreter.cursor_of(at), frame, at);
        };
        return bound;
      }
      const slot = new Node(this.diagnostics, key.position);
      slot.ref = { scope: target ?? this.unknown(key.position), key: name, own: true, member: true };
      if (forced?.literal && forced.position && target) this.paint_reference(Object.assign(new Node(this.diagnostics, forced.position), { ref: slot.ref }));
      return slot;
    }
    opens_call(rule: Node): boolean {
      const pieces = rule.pattern!;
      const open = pieces[0];
      if (pieces.length < 3 || open?.kind !== 'literal') return false;
      const text = open.text.trim();
      if (text.length === 0 || /[\p{L}\p{N}_]/u.test(text[0])) return false;
      return pieces.slice(1).some(piece => piece.kind === 'literal');
    }
    calls(rule: Node): boolean {
      return this.opens_call(rule) && rule.pattern![rule.pattern!.length - 1].kind === 'literal';
    }
    call_rule(target: Node | undefined): [Node, Node] | undefined {
      if (!target) return undefined;
      const seen = new Set<Node>();
      for (const from of target.composed(seen)) {
        for (const rule of from.rules) {
          if (!this.calls(rule)) continue;
          const impl = from.methods!.get(rule)!;
          if (impl.forward) continue;
          return [rule, impl];
        }
      }
    }
    callable_of(target: Node | undefined): boolean {
      return target !== undefined && (target.callable || this.call_rule(target) !== undefined);
    }
    method_of(target: Node, name: string, opts: { parameterised?: boolean } = {}): [Node, Node] | undefined {
      const seen = new Set<Node>();
      // What every node has is on the base after what this one is made of.
      for (const from of [...target.composed(seen), ...(this.BASE !== undefined && !seen.has(this.BASE) ? [this.BASE] : [])]) {
        for (const rule of from.rules) {
          const pieces = rule.pattern!;
          if (pieces.length !== 1 || pieces[0].kind !== 'literal' || pieces[0].text.trim() !== name) continue;
          const impl = from.methods!.get(rule)!;
          if (impl.forward || (opts.parameterised ? !impl.params?.length : impl.params?.length)) continue;
          return [rule, impl];
        }
      }
    }
    trivial(receiver: Node, at: Text.Node): Match {
      return { begin: at.begin, end: at.end + 1, pattern: at.end + 1, spanned: false, literals: [], captures: new Map(), operators: new Map(), args: [], receiver, tight: true };
    }
    reference_of(node: Node): Node {
      if (!node.lazy || node.lazy.raw || node.value !== undefined) return node;
      node.lazy.consumed = true;
      const cursor = this.cursor_of(node.lazy.span);
      const value = this.expression(cursor, node.lazy.frame, false);
      this.spaces(cursor);
      return value && cursor.done() ? value : node;
    }
    assign(slot: Node, value: Node | undefined, at: Text.Node, opts: { declare?: boolean } = {}): Node | undefined {
      let node = this.reference_of(slot);
      const marks: Node[] = [...(node.marks ?? [])];
      for (let depth = 0; node.ref && !node.marks?.length && depth < 64; depth++) {
        // A declaration binds the name as written: it looks only through what
        // the rule was given to find that name, never into a binding elsewhere.
        if (opts.declare && !node.ref.scope.given?.has(node.ref.key)) break;
        const bound = this.bound(node);
        const next = bound && this.reference_of(bound);
        if (next?.ref) { node = next; marks.push(...(next.marks ?? [])); } else break;
      }
      const thunk = value?.lazy !== undefined && value.value === undefined && !value.lazy.raw ? value : value !== undefined ? this.unforced(value) : undefined;
      const grouped = thunk?.lazy !== undefined && thunk.value === undefined && this.inner(thunk.lazy.span, thunk.lazy.frame) !== undefined;
      const result = grouped ? thunk : this.deref(value);
      if (node.ref) {
        const bound = this.bound(node);
        if (bound?.style !== undefined) { this.alias(bound.style, result); return result; }
        let scope = node.ref.scope;
        if (scope === this.NONE) { this.error('Cannot assign into nothing.', at); return result; }
          // A declaration binds where it is written; an assignment finds what it names.
        if (!node.ref.own && !opts.declare) {
          let owner: Node | undefined;
          for (const s of scope.reading(new Set())) if (s.own(node.ref.key) !== undefined) { owner = s; break; }
          if (owner) scope = owner;
        }
        if (result && !result.unknown && this.seeking === undefined) node.ref.member && scope.own(node.ref.key) === undefined ? this.attach(scope, node.ref.key, result) : this.bind(scope, node.ref.key, result);

        for (let k = this.applying.length - 1; k >= 0; k--) {
          const applied = this.applying[k].receiver?.ref;
          if (applied?.key !== node.ref.key || applied.scope !== node.ref.scope) continue;
          this.binders.add(this.binder_of(this.applying[k].rule));
          break;
        }
        // A name mark colours what is painted, and bodies are only painted while probing.
        if (marks.length && (this.probing > 0 || !this.in_body(at))) this.mark_name(scope, node.ref.key, marks);
        // Definitions are what the source says, not what a body did at runtime.
        if (this.probing > 0 || !this.in_body(at)) {
          this.definitions.push(`${scope.key}.${node.ref.key}`);
          const statement = this.site_of();
          if (statement) this.sites.set(`${scope === this.GLOBAL ? 'GLOBAL' : scope.key}::${node.ref.key}`, statement);
        }
        return result;
      }
      const target = this.deref(node);
      if (target?.style !== undefined) { this.alias(target.style, result); return result; }
      this.error('Cannot assign here.', at);
      return result;
    }

    call(value: Node, arg: Node, at: Text.Node, frame: Node): Node | undefined {
      if (this.probing) {
        this.force(arg);
        const known = this.diagnostics.muted(() => this.safely(() => this.deref(value, false)));
        if (!known?.pure) return new Node(this.diagnostics, at);
      }
      const target = this.deref(value);
      if (!target) return undefined;
      if (target.forward) {
        const name = target.forward.string;
        let real: Node | undefined;
        for (let scope: Node | undefined = frame; scope && !real; scope = scope.parent) { const own = scope.own(name); if (own && !own.forward) real = own; }
        return real ? this.call(real, arg, at, frame) : arg;
      }
      if (!target.fn && target.params === undefined) {
        const found = this.call_rule(target);
        const span = arg.lazy?.span ?? arg.position;
        if (found && span) {
          const capture = found[0].pattern!.find(piece => piece.kind === 'capture');
          if (capture) {
            const match: Match = { begin: at.begin, end: at.end + 1, pattern: at.end + 1, spanned: false, literals: [], captures: new Map([[capture.name, span]]), operators: new Map(), args: [], receiver: target, tight: true };
            return this.apply({ rule: found[0], impl: found[1], match }, this.cursor_of(at), frame, at);
          }
        }
      }
      const arity = target.fn ? (target.arity ?? 1) : Math.max(target.params?.length ?? 1, 1);
      const expected = arity - (target.applied?.length ?? 0);
      const listed = expected > 1 && arg.lazy !== undefined ? this.listed(arg.lazy.span, arg.lazy.frame) : undefined;
      const given = listed !== undefined && listed.length > 1 ? listed.map(part => this.lazy(part, arg.lazy!.frame, false)) : [arg];
      const applied = [...(target.applied ?? []), ...given];
      if (applied.length < arity) { const partial: Node = Object.assign(Object.create(Node.prototype), target); partial.applied = applied; return partial; }
      if (target.fn) return this.seeking !== undefined && !target.pure ? undefined : target.fn({ interpreter: this, frame, self: value, method: target, args: applied, at });
      if (!target.params) { this.error(`\`${this.text(value)}\` cannot be called.`, at); return undefined; }
      const local = this.frame(frame, `call@${this.anchor(at)}`, target.closure ?? this.GLOBAL);
      local.given = new Set(target.params);
      target.params.forEach((param, k) => this.bind(local, param, applied[k]));
      return target.body ? this.unalias(this.array(this.cursor_of(target.body), local, false, true), local) : undefined;
    }

    ids = 0;
    private derived = new Map<string, string>();
    private edits = new WeakMap<Text.Source, { prefix: number; suffix: number; delta: number } | null>();
    reanchor(location: string, before: string, after: string) {
      const { prefix, suffix, delta } = Text.shift(before, after);
      if (delta === 0) return;
      const pattern = new RegExp(`(${location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:)(\\d+)$`);
      for (const owner of [this.GLOBAL, ...this.frames.values()]) {
        if (!owner.children) continue;
        const moved = new Map<string, Node>();
        for (const [key, frame] of owner.children) {
          const found = key.match(pattern);
          const offset = found ? Number(found[2]) : undefined;
          const shifted = offset === undefined ? undefined : offset < prefix ? offset : offset >= before.length - suffix ? offset + delta : undefined;
          moved.set(shifted === undefined ? key : key.replace(pattern, `$1${shifted}`), frame);
        }
        owner.children = moved;
      }
    }
    anchor(at: Text.Node): string {
      const source = at.source, base = this.derived.get(source.location);
      let edit = this.edits.get(source);
      if (edit === undefined) {
        const now = source.value;
        edit = null;
        if (base !== undefined && base !== now) edit = Text.shift(base, now);
        this.edits.set(source, edit);
      }
      if (!edit || at.begin < edit.prefix) return `${source.location}:${at.begin}`;
      if (at.begin >= source.value.length - edit.suffix) return `${source.location}:${at.begin - edit.delta}`;
      return `${source.location}:~${at.begin}`;
    }
    frame(owner: Node, local: string, parent: Node): Node {
      // Every application is its own frame; a site remembers only the frames rules live on.
      const frame = new Node(this.diagnostics);
      frame.key = `#${++this.ids}`;
      frame.owner = owner; frame.site = local;
      frame.parent = parent;
      return frame;
    }

    private depth = 0;
    fire(found: Found, cursor: Text.Node, frame: Node): Node | undefined {
      const { rule, impl, match } = found;
      const at = cursor.span(match.begin, match.end - 1);
      cursor.cursor = match.end;
      if (this.depth > Interpreter.DEPTH) throw new Recursion(rule, at);
      this.depth++;
      try { return this.apply(found, cursor, frame, at); }
      finally { this.depth--; }
    }
    apply({ rule, impl, match }: Found, cursor: Text.Node, frame: Node, at: Text.Node): Node | undefined {
      const found = { rule, impl, match };
      const captures = new Map<string, Node>();
      rule.pattern!.forEach((piece, p) => {
        // What stands between two operands is bound the way what stands
        // inside a group is: `[x]` names what is written there, as `{x}` does.
        if (piece.kind === 'operator') {
          const written = match.operators.get(piece.name);
          if (written === undefined) return;
          const node = this.lazy(written, frame, false);
          captures.set(piece.name, node);
          if (!this.probing && !this.in_body(written)) this.deferred.push(node);
          return;
        }
        if (piece.kind !== 'capture') return;
        const span = match.captures.get(piece.name);
        const read = piece.raw || impl.forward ? undefined : match.read?.get(piece.name);
        if (read !== undefined) captures.set(piece.name, read);
        else if (span) { const node = this.lazy(span, frame, piece.raw); captures.set(piece.name, node); if (!piece.raw && !this.probing && !this.in_body(span)) this.deferred.push(node); }
        else if (p === 0 && match.receiver !== undefined) captures.set(piece.name, match.receiver);
      });
      this.paint(at, undefined, frame, rule.key);
      this.paint_head(rule, match, cursor, frame);
      const styling = new Node(this.diagnostics);
      styling.parent = impl.closure ?? frame;
      styling.given = new Set(captures.keys());
      for (const [name, node] of captures) styling.set(name, node);
      const heads = match.literals.map(([, b, e]) => cursor.span(b, e));
      const owned = [...heads, ...rule.pattern!.flatMap(piece => piece.kind === 'capture' && piece.raw && match.captures.has(piece.name) ? [match.captures.get(piece.name)!] : [])];
      for (const piece of rule.pattern!) {
        if (piece.kind !== 'capture' || !piece.raw) continue;
        const span = match.captures.get(piece.name);
        if (!span || span.empty()) continue;
        const location = span.source.location ?? '';
        let spans = this.verbatim.get(location);
        if (!spans) this.verbatim.set(location, spans = []);
        spans.push([span.begin, span.end]);
      }
      const current = () => (impl.closure ?? this.GLOBAL).methods?.get(rule) ?? impl;
      const styles = (p: number) => { const piece = rule.pattern![p]; return piece?.kind === 'capture' ? piece.styles : piece?.kind === 'literal' ? piece.styles ?? [] : []; };
      for (const span of owned) this.paint(span, () => current().decorators ?? [], styling, rule.key, { head: heads.includes(span) });
      for (const [p, b, e] of match.literals) this.paint(cursor.span(b, e), () => styles(p), styling, rule.key, { head: true });
      rule.pattern!.forEach((piece, p) => {
        if (piece.kind !== 'capture') return;
        const span = match.captures.get(piece.name) ?? (p === 0 ? match.receiver?.position : undefined);
        if (span) this.paint(span, () => styles(p), styling, rule.key);
      });
      match.args.forEach((span, k) => this.paint(span, () => current().param_styles?.[k] ?? [], styling, rule.key));
      // Parameters are values, not blocks: reading them here is what lets a
      // method be called with its argument beside it rather than in brackets.
      const args = match.args.map((span, k) => { const given = match.given?.[k]; if (given !== undefined) return given; const node = this.lazy(span, frame, false); if (!this.probing && !this.in_body(span)) this.deferred.push(node); return node; });
      if (!impl.forward) this.receives(rule, impl, match.receiver);
      if (this.probing) {
        captures.forEach(node => { if (!node.lazy?.raw) this.force(node); });
        args.forEach(node => this.force(node));
        return impl.forward && match.receiver !== undefined ? match.receiver : new Node(this.diagnostics, at);
      }
      if (impl.forward) return this.pass(found, captures, args, cursor, frame, at);

      // A call site keeps one frame, so a rule that reaches itself would share
      // that frame with the reading still in progress. Each re-entry gets its
      // own instead.
      const site = `${rule.key}@${this.anchor(at)}`;
      const depth = this.entered.get(site) ?? 0;
      this.entered.set(site, depth + 1);
      const local = this.frame(frame, depth > 0 ? `${site}#${depth}` : site, impl.closure ?? this.GLOBAL);
      // A frame is written where what made it is written.
      local.position = at;
      local.given = new Set([...captures.keys(), ...(impl.params ?? []), ...(match.receiver !== undefined ? ['this'] : [])]);
      for (const [name, node] of captures) this.bind(local, name, node);
      impl.params?.forEach((param, k) => {
        // What a parameter was declared to be is what its rules are, before
        // anyone reads the argument itself.
        const written = impl.param_types?.[k];
        if (written !== undefined && args[k] !== undefined) {
          const named = this.diagnostics.muted(() => this.safely(() => this.deref(this.reference(impl.closure ?? frame, written.string.trim(), written), false)));
          if (named !== undefined) args[k].declared = named;
        }
        this.bind(local, param, args[k]);
      });
      for (const piece of rule.pattern!) {
        if (piece.kind !== 'capture' || piece.modifiers.length === 0) continue;
        const span = match.captures.get(piece.name);
        // The caller is in reach while the arguments are read, and no longer:
        // what is built here is not made of where it was built.
        const linked = span !== undefined && !(local.sees?.includes(frame) ?? false);
        if (span !== undefined) this.sees(local, frame);
        // An argument list is one argument per part: what the separator rule
        // spells splits it, outside any brackets. A block is not a list.
        const opens = this.scoped(local);
        const between = span !== undefined && (opens === undefined || !span.string.trimStart().startsWith(opens)) ? this.marked(local, 'separator') : undefined;
        const nodes = span !== undefined ? (between !== undefined ? this.split(span, between) : [span]).map(part => this.lazy(part, local, piece.raw)) : [captures.get(piece.name)];
        for (const node of nodes) {
          if (node === undefined) continue;
          for (const word of piece.modifiers) {
            const modifier = this.resolved(this.reference(local, word, piece.group));
            if (!modifier?.fn) continue;
            const before = new Set<Key>(local.methods?.keys() ?? []);
            this.safely(() => modifier.fn!({ interpreter: this, frame: local, args: [node], method: modifier, at: piece.group }));
            for (const [key, value] of local.methods ?? []) if (typeof key === 'string' && !before.has(key)) this.attach(local, key, value);
          }
        }
        if (linked && local.sees !== undefined) local.sees = local.sees.filter(x => x !== frame);
      }
      // Text inlined from the call site has seen the call site's receiver; only
      // now does the rule's own take its place.
      if (match.receiver !== undefined) { this.bind(local, 'this', match.receiver); local.subject = match.receiver; }
      {
      }
      this.ran.add(rule.key!);
      this.applying.push({ rule, impl, receiver: match.receiver, local });
      try {
        if (impl.fn) return impl.fn({ interpreter: this, frame: local, self: match.receiver, method: impl, args: [...captures.values(), ...args], at });
        if (!impl.body) return undefined;
        const rewrites = rule.pattern!.some(piece => piece.kind === 'operator');
        if (rewrites) this.rewriting.add(rule);
        try { return this.unalias(this.array(this.cursor_of(impl.body), local, false, impl.params !== undefined), local); }
        catch (jump) { if (impl.params === undefined && jump instanceof Jump && jump.kind === 'end' && (jump.site === undefined || Interpreter.within(jump.site, at) || Interpreter.within(jump.site, impl.body))) jump.site = at; throw jump; }
        finally { if (rewrites) this.rewriting.delete(rule); }
      } finally { this.applying.pop(); const held = this.entered.get(site) ?? 1; if (held <= 1) this.entered.delete(site); else this.entered.set(site, held - 1); }
    }
    static within(inner: Text.Node, outer: Text.Node): boolean { return inner.source === outer.source && inner.begin >= outer.begin && inner.end <= outer.end; }
    unalias(result: Node | undefined, local: Node): Node | undefined {
      if (!result?.ref || result.ref.scope !== local || !local.given?.has(result.ref.key)) return result;
      const bound = local.own(result.ref.key);
      if (!bound || !result.marks?.length) return bound;
      return this.decorate(bound, result.marks[result.marks.length - 1]);
    }

    head(rule: Node): string | undefined { const first = rule.pattern!.find(x => x.kind === 'literal'); return first?.kind === 'literal' ? first.text.trim().split(/\s+/)[0] : undefined; }

    pass(found: Found, captures: Map<string, Node>, args: Node[], cursor: Text.Node, frame: Node, at: Text.Node): Node | undefined {
      const { rule, match } = found;
      const head = this.head(rule);
      const real = head !== undefined ? this.resolved(this.reference(frame, head, at)) : undefined;
      let decorator: Node | undefined;
      if (real?.callable && real !== found.impl) {
        decorator = real;
        for (const node of captures.values()) if (node !== match.receiver && decorator) decorator = this.call(decorator, this.lazy(node.lazy!.span, frame, true), at, frame);
      }
      if (args.length > 0) {
        const argument = args[args.length - 1];
        if (match.receiver !== undefined) this.provisional(match.receiver, argument);
        return argument;
      }
      if (match.receiver !== undefined) return decorator?.style !== undefined ? this.decorate(match.receiver, decorator) : match.receiver;
      const next = this.skip(cursor, cursor.cursor);
      if (decorator !== undefined && (next >= cursor.limit || cursor.source.value[next] === '\n' || this.best(decorator, cursor, frame, { spaced: true, operand: false }))) return decorator;
      const b = this.expression(cursor, frame, match.tight);
      return b !== undefined && decorator?.style !== undefined ? this.decorate(b, decorator) : b;
    }

    provisional(receiver: Node, argument: Node) {
      let node = this.reference_of(receiver);
      for (let depth = 0; node.ref && depth < 64; depth++) {
        const bound = this.bound(node);
        if (bound === undefined) break;
        const next = this.reference_of(bound);
        if (!next.ref) return;
        node = next;
      }
      if (!node.ref || this.bound(node) !== undefined) return;
      const value = this.deref(argument, false);
      if (value) this.bind(node.ref.scope, node.ref.key, value);
    }

    external(name: Text.Node, at: Text.Node, frame: Node): Node | undefined {
      const key = name.string;
      this.paint_reference(this.reference(frame, 'external', name), true);
      const native = this.program?.EXTERNALS[key] ?? Natives[key];
      if (!native) { this.error(`Expected method \`${key}\` to be externally defined by the runtime, but it wasn't.`, name); return undefined; }
      if (native.arity === 0) return native.fn({ interpreter: this, frame, args: [], method: this.EXTERNAL, at });
      const node = new Node(this.diagnostics, name);
      node.fn = native.fn; node.arity = native.arity; node.pure = native.pure;
      return node;
    }

    forward(pattern: Text.Node, frame: Node): Node {
      const pieces = this.pieces(this.chunks(pattern), frame);
      const key = `${frame.key}::forward ${pieces.map(describe).join('')}`;
      const rule = frame.rules.find(x => x.key === key) ?? Object.assign(new Node(this.diagnostics, pattern), { key });
      rule.pattern = pieces;
      const impl = new Node(this.diagnostics, pattern);
      impl.forward = pattern; impl.closure = frame;
      if (!pieces.some(x => x.kind === 'capture')) impl.params = ['argument'];
      const painting = this.probing > 0 || (this.owns(pattern.source) && !this.in_body(pattern) && this.first_site(pattern));
      if (painting) this.paint_definition(this.chunks(pattern), [], this.definition_scope(frame, rule, impl), key, { pieces });
      const head = pieces[0]?.kind === 'literal' ? pieces[0].text.trim() : '';
      const at = head ? pattern.source.value.indexOf(head, pattern.begin) : -1;
      if (painting && at >= 0 && at <= pattern.end) {
        const span = pattern.span(at, at + head.length - 1);
        if (!/\s/.test(head) && pieces.some(piece => piece.kind === 'capture') ? frame.lookup(head) !== undefined : /^[\p{L}_]/u.test(head)) this.paint_reference(this.reference(frame, head, span), true);
        else if (!pieces.some(piece => piece.kind === 'capture')) {
          const painted = span.span(span.begin, span.end);
          painted.of = key;
          painted.style = () => {
            for (const [rule, impl] of [...this.chain(frame).receiver, ...this.chain(frame).operand]) {
              if (impl.forward || this.head(rule) !== head || !impl.decorators?.length) continue;
              return this.safely(() => this.style_of(impl.decorators![0], impl.closure ?? frame))?.style;
            }
          };
          if (this.owns(span.source)) this.record(painted);
        }
      }
      if (this.probing) return impl;
      if (impl.params) {
        const name = this.head(rule);
        if (name !== undefined && !(frame.own(name) && !frame.own(name)!.forward)) this.bind(frame, name, impl);
      }
      this.bind(frame, rule, impl);
      this.forwards.push(rule);
      this.definitions.push(key);
      return impl;
    }

    arrow(cursor: Text.Node, frame: Node): number {
      const text = cursor.source.value, limit = cursor.limit, start = cursor.cursor;
      for (let j = start; j < limit && text[j] !== '\n';) {
        if (text.startsWith('=>', j) && (j === start || /\s/.test(text[j - 1])) && (j + 2 >= limit || /\s/.test(text[j + 2]))) return j;
        if (this.line_rule(cursor, j, frame, start)) return -1;
        const claimed = this.claim(cursor, j, frame);
        j = claimed > j ? claimed : j + 1;
      }
      return -1;
    }

    grammar_rule(cursor: Text.Node, frame: Node): Node | undefined {
      const arrow = this.arrow(cursor, frame);
      if (arrow < 0) return undefined;
      const text = cursor.source.value, start = cursor.cursor;
      let lhs_end = arrow;
      while (lhs_end > start && /\s/.test(text[lhs_end - 1])) lhs_end--;
      const body_start = this.skip(cursor, arrow + 2);
      const body_end = this.line_end(cursor, body_start, frame);
      cursor.cursor = body_end;
      if (lhs_end <= start) { this.error('Expected a pattern before `=>`.', cursor.span(arrow, arrow + 1)); return new Node(this.diagnostics); }
      return this.define(cursor.span(start, lhs_end - 1), body_end > body_start ? cursor.span(body_start, body_end - 1) : undefined, frame, cursor.span(arrow, arrow + 1));
    }

    define(lhs: Text.Node, body: Text.Node | undefined, frame: Node, arrow?: Text.Node): Node {
      const chunks = this.tokens(lhs, frame);
      const modifiers: Node[] = [], decorators: Text.Node[] = [], pattern: Text.Node[] = [];
      let params: string[] | undefined;
      let param_styles: Text.Node[][] | undefined;
      const param_names: Text.Node[] = [], param_types: Text.Node[] = [];
      const held = this.grouping(frame);
      const between = this.marked(frame, 'separator'), annotates = this.marked(frame, 'annotation');
      chunks.forEach((chunk, k) => {
        const s = chunk.string;
        if (pattern.length === 0 && k < chunks.length - 1 && /^[\p{L}_]/u.test(s)) {
          const modifier = this.modifier(chunk, frame);
          if (modifier) { modifiers.push(modifier); this.paint_reference(this.reference(frame, s, chunk)); return; }
        }
        if (this.decorates(chunk, frame)) { decorators.push(chunk); return; }
        if (pattern.length > 0 && held !== undefined && between !== undefined && s.startsWith(held[0]) && s.endsWith(held[1]) && !s.includes('{') && chunks.slice(k + 1).every(x => this.decorates(x, frame))) {
          params = []; param_styles = [];
          for (const part of s.slice(held[0].length, -held[1].length).split(between)) {
            const offset = chunk.begin + held[0].length + s.slice(held[0].length, -held[1].length).indexOf(part);
            const tokens = part.trim() ? this.tokens(chunk.span(offset, offset + part.length - 1), frame) : [];
            const styles = tokens.filter(token => this.decorates(token, frame));
            const plain = tokens.filter(token => !styles.includes(token));
            const whole = plain.map(token => token.string).join(' ');
            const name = (annotates === undefined ? whole : whole.split(annotates)[0]).trim();
            if (!name) continue;
            params.push(name); param_styles.push(styles);
            const first = plain[0];
            if (first) param_names.push(first.span(first.begin, first.begin + name.length - 1));
            const annotated = annotates === undefined ? undefined : plain.find(token => token.string.includes(annotates));
            if (annotated) {
              const colon = annotated.string.indexOf(annotates!);
              const last = plain[plain.length - 1];
              if (annotated.begin + colon < last.end) param_types.push(annotated.span(annotated.begin + colon + annotates!.length, last.end));
            }
          }
          return;
        }
        pattern.push(chunk);
      });
      const pieces = this.pieces(pattern, frame);
      if (pieces.length === 0) { this.error('Expected a pattern before `=>`.', lhs); return new Node(this.diagnostics, lhs); }
      const key = `${frame.key}::${pieces.map(describe).join('')}${params ? `(${params.join(',')})` : ''}`;
      const rule = frame.rules.find(x => x.key === key) ?? Object.assign(new Node(this.diagnostics, lhs), { key });
      rule.pattern = pieces; rule.position = lhs;
      const impl = new Node(this.diagnostics, body ?? lhs);
      impl.body = body; impl.closure = frame; impl.params = params; impl.param_styles = param_styles; impl.modifiers = modifiers; impl.decorators = decorators;
      impl.param_types = param_types.length > 0 ? param_types : undefined;
      if (!this.probing) { const fresh = this.spelled_before(impl); this.bind(frame, rule, impl); if (fresh) { this.definitions.push(key); this.sites.set(`rule::${key}`, lhs); } }
      if (this.probing || (this.owns(lhs.source) && !this.in_body(lhs) && this.first_site(lhs))) {
        const scope = this.definition_scope(frame, rule, impl);
        this.paint_definition(pattern, decorators, scope, key, { arrow, params: param_names, types: param_types, styles: param_styles?.flat(), pieces });
        if (body) this.paint_body(body, scope);
        // A body declares names for the text it is handed: a block written for
        // this rule may use them, wherever that block is written.
        const hands = new Set([...(scope.methods?.keys() ?? [])].filter((name): name is string => typeof name === 'string' && !scope.given?.has(name)));
        if (hands.size > 0) this.handed.set(rule, hands);
      }
      if (body) this.mark_given(body, new Set([...(params ?? []), ...pieces.flatMap(piece => piece.kind === 'capture' ? [piece.name] : []), ...(frame === this.GLOBAL ? [] : ['this'])]), frame);
      if (this.probing) return impl;
      if (pieces.some(piece => piece.kind === 'operator')) this.pending_rewrites.push([rule, impl]);
      for (const modifier of modifiers) if (!modifier.forward) this.call(modifier, impl, lhs, frame);
      return impl;
    }

    modifier(chunk: Text.Node, frame: Node): Node | undefined {
      const bound = this.resolved(this.reference(frame, chunk.string, chunk));
      if ((bound?.fn || bound?.forward) && bound !== this.EXTERNAL && bound !== this.FORWARD) return bound;
    }

    group_end(text: string, j: number, end: number): number {
      const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']', '`': '`' };
      const open = text[j], close = pairs[open];
      if (!close) return j;
      if (open === '`') { const q = text.indexOf('`', j + 1); return q < 0 || q >= end ? end : q + 1; }
      let depth = 0;
      for (let k = j; k < end; k++) {
        const c = text[k];
        if (c === '`') { const q = text.indexOf('`', k + 1); if (q < 0 || q >= end) return end; k = q; continue; }
        if (c === open) depth++;
        else if (c === close && --depth === 0) return k + 1;
      }
      return end;
    }
    chunks(span: Text.Node): Text.Node[] {
      if (span.empty()) return [];
      const text = span.source.value, end = span.end + 1, out: Text.Node[] = [];
      for (let j = span.begin; j < end;) {
        while (j < end && /\s/.test(text[j])) j++;
        if (j >= end) break;
        const start = j;
        while (j < end && !/\s/.test(text[j])) { const close = this.group_end(text, j, end); j = close > j ? close : j + 1; }
        out.push(span.span(start, j - 1));
      }
      return out;
    }
    tokens(span: Text.Node, frame: Node): Text.Node[] {
      const chunks = this.chunks(span), out: Text.Node[] = [];
      for (let k = 0; k < chunks.length; k++) {
        const next = chunks[k + 1];
        if (next && this.styler(chunks[k], frame)) { out.push(chunks[k].span(chunks[k].begin, next.end)); k++; }
        else out.push(chunks[k]);
      }
      return out;
    }
    styler(chunk: Text.Node, frame: Node): boolean {
      const name = this.name(this.cursor_of(chunk), frame);
      return name === chunk.string && this.resolved(this.reference(frame, name, chunk))?.fn === Natives['^'].fn;
    }
    // `f(a, b)`: an argument list in brackets is one argument per part of it,
    // as the separator rule spells the parts.
    listed(span: Text.Node, frame: Node): Text.Node[] | undefined {
      const inner = this.inner(span, frame), between = this.marked(frame, 'separator');
      if (inner === undefined || between === undefined) return undefined;
      const text = inner.source.value;
      return this.split(inner, between).flatMap(part => {
        let begin = part.begin, end = part.end;
        while (begin <= end && /\s/.test(text[begin])) begin++;
        while (end >= begin && /\s/.test(text[end])) end--;
        return end >= begin ? [part.span(begin, end)] : [];
      });
    }
    split(span: Text.Node, separator: string): Text.Node[] {
      const text = span.source.value, parts: Text.Node[] = [];
      let from = span.begin;
      for (let j = span.begin; j <= span.end;) {
        const skip = this.group_end(text, j, span.end + 1);
        if (skip > j) { j = skip; continue; }
        if (text[j] === separator) { if (j > from) parts.push(span.span(from, j - 1)); from = j + 1; }
        j++;
      }
      if (span.end >= from) parts.push(span.span(from, span.end));
      return parts;
    }
    pieces(chunks: Text.Node[], frame: Node): Piece[] {
      const pieces: Piece[] = [];
      const literal = (s: string) => { const last = pieces[pieces.length - 1]; if (last?.kind === 'literal' && !last.styles) last.text += s; else pieces.push({ kind: 'literal', text: s }); };
      const significant = () => [...pieces].reverse().find(x => x.kind !== 'literal' || x.text.trim().length > 0);
      chunks.forEach((chunk, k) => {
        if (k > 0) literal(' ');
        const text = chunk.source.value, end = chunk.end + 1;
        for (let j = chunk.begin; j < end;) {
          if (text[j] === '{') {
            const close = this.group_end(text, j, end);
            const piece = this.group(close - 2 >= j + 1 ? chunk.span(j + 1, close - 2) : chunk.span(j + 1, j), frame, pieces.length);
            const last = pieces[pieces.length - 1];
            if (piece.kind === 'literal' && !piece.styles && last?.kind === 'literal' && !last.styles) last.text += piece.text;
            else pieces.push(piece);
            j = close; continue;
          }
          if (text[j] === '[' && significant()?.kind === 'capture') {
            const close = this.group_end(text, j, end);
            const rest = chunks.slice(k + 1).map(x => x.string).join(' ');
            if (text[close] === '{' || (close >= end && rest.startsWith('{'))) {
              const [name, filter] = text.slice(j + 1, close - 1).split(/:(.*)/s);
              pieces.push({ kind: 'operator', name: name.trim(), filter: filter?.trim(), group: chunk.span(j, close - 1) });
              j = close; continue;
            }
          }
          literal(text[j]); j++;
        }
      });
      return pieces
        .map(p => p.kind === 'literal' ? { ...p, text: p.text.replace(/\s+/g, ' ') } : p)
        .filter(p => p.kind !== 'literal' || p.text.trim().length > 0);
    }
    group(content: Text.Node, frame: Node, index: number): Piece {
      const s = content.empty() ? '' : content.string;
      if (/^`[^`]*`$/.test(s)) return { kind: 'literal', text: s.slice(1, -1) };
      // Tokens that touch are one item of the capture's text (`x?`, `x:`).
      const parts: Text.Node[] = [];
      for (const token of content.empty() ? [] : this.tokens(content, frame)) {
        const last = parts[parts.length - 1];
        if (last !== undefined && last.end + 1 === token.begin) parts[parts.length - 1] = last.span(last.begin, token.end);
        else parts.push(token);
      }
      const plain = parts.filter(token => !this.decorates(token, frame));
      if (plain.length === 1 && plain.length < parts.length && /^`[^`]*`$/.test(plain[0].string))
        return { kind: 'literal', text: plain[0].string.slice(1, -1), styles: parts.filter(token => token !== plain[0]) };
      if (s.length > 0 && /^[ \t]+$/.test(s)) return { kind: 'space' };
      if (s === '\\n') return { kind: 'newline', group: content };
      const styles: Text.Node[] = [], words: string[] = [], typing: string[] = [];
      const annotates = this.marked(frame, 'annotation'), opens = this.grouping(frame)?.[0];
      const grouped = (t: string) => opens !== undefined && t.startsWith(opens);
      for (const token of parts) {
        const t = token.string;
        if (this.decorates(token, frame)) { styles.push(token); continue; }
        if (typing.length > 0) { typing.push(t); continue; }
        const colon = annotates === undefined || grouped(t) ? -1 : t.indexOf(annotates);
        if (colon >= 0) { if (colon > 0) words.push(t.slice(0, colon)); typing.push(t.slice(colon + annotates!.length)); continue; }
        words.push(t);
      }
      // A capture's text is read as what it says of the capture: the word is
      // the name, and whatever the rest makes of it (`x?` is `x | None`) is its
      // type; the capture is optional when that type admits None.
      const optional = { held: false };
      const spelled = (text: string, bound: boolean): string => {
        const word = text.match(/^[\p{L}\p{N}_]+/u)?.[0] ?? '';
        if (word === text) return word;
        const temp = new Node(this.diagnostics); temp.parent = frame;
        if (bound && word) this.bind(temp, word, this.placeholder());
        // The capture may be empty when None is an instance of its type: the
        // language's `instance_of`, answered as presence.
        this.probing++;
        const asked = this.diagnostics.muted(() => this.safely(() => this.resolved(this.array(this.cursor_of(Text.Node.string(`None.instance_of(${text})`)), temp))));
        this.probing--;
        if (asked !== undefined && !asked.none) optional.held = true;
        return word;
      };
      let name = words.length > 0 && !grouped(words[words.length - 1]) ? spelled(words.pop()!, true) : '';
      if (name === '' && words.length > 0) typing.unshift(words.pop()!);
      const raw = words.some(word => this.resolved(this.reference(frame, word, content))?.fn === Natives.literal.fn);
      const typed = typing.join(' ').trim();
      if (typed) spelled(typed, false);
      const type = typed || undefined;
      return { kind: 'capture', name: name || `#${index}`, raw, optional: optional.held, modifiers: words, styles, type, group: content };
    }

    private typings = new Map<Node, Map<string, Node | null>>();
    private readings = new WeakMap<Node, Map<string, Node | null>>();
    private passing = 0;
    typed(type: string, span: Text.Node, closure: Node, opts: { read?: boolean } = {}): Node | null | undefined {
      if (this.passing === 0 && this.began) return undefined;
      const reader = this.marked(closure, 'reader');
      if (reader === undefined) return undefined;
      const probing = this.probing, seeking = this.seeking;
      this.probing = 0; this.seeking = undefined;
      try {
        let types = this.typings.get(closure);
        if (!types) this.typings.set(closure, types = new Map());
        let resolved = types.get(type);
        if (resolved === null || resolved === this.NONE) return undefined;
        if (resolved === undefined) {
          types.set(type, null);
          resolved = this.diagnostics.muted(() => this.safely(() => this.deref(this.array(this.cursor_of(Text.Node.string(type)), closure), false)));
          if (resolved === undefined || resolved.unknown || resolved.none) { types.set(type, this.NONE); return undefined; }
          types.set(type, resolved);
        }
        const method = this.method_of(resolved, reader, { parameterised: true });
        if (!method) return undefined;
        let answers = this.readings.get(resolved);
        if (!answers) this.readings.set(resolved, answers = new Map());
        const text = span.string;
        const known = answers.get(text);
        if (known !== undefined || answers.has(text)) return known ?? null;
        if (opts.read === false) return undefined;
        answers.set(text, null);
        const at = Text.Node.string(text);
        const literal = Object.assign(new Node(this.diagnostics, at), { literal: true });
        const match: Match = { ...this.trivial(resolved, at), args: [at], given: [literal] };
        const value = this.diagnostics.muted(() => this.safely(() => this.deref(this.apply({ rule: method[0], impl: method[1], match }, this.cursor_of(at), closure, at), false)));
        const answer = value === undefined || value.none || value.unknown ? null : value;
        answers.set(text, answer);
        return answer;
      } catch (e) { if (e instanceof RangeError) return undefined; throw e; }
      finally { this.probing = probing; this.seeking = seeking; }
    }

    // What a rule's pattern says about where it could begin, read once: the
    // same questions were asked of every rule at every position.
    private rule_shape = new WeakMap<Node, { literal: boolean; head?: string; leading: boolean; newline: boolean; operator: boolean; loose: boolean }>();
    shaped(rule: Node) {
      let found = this.rule_shape.get(rule);
      if (found !== undefined) return found;
      const pieces = rule.pattern!;
      const leading = pieces[0]?.kind === 'capture';
      const first = pieces[leading ? 1 : 0];
      const head = pieces[pieces[0]?.kind === 'capture' ? 1 : 0];
      found = {
        literal: pieces.length === 1 && pieces[0].kind === 'capture' && pieces[0].type !== undefined,
        head: head?.kind === 'literal' && head.text[0] !== ' ' ? head.text[0] : undefined,
        leading,
        newline: first?.kind === 'newline',
        operator: pieces.some(piece => piece.kind === 'operator'),
        loose: pieces[0]?.kind === 'space',
      };
      this.rule_shape.set(rule, found);
      return found;
    }
    literal_rule(rule: Node): boolean {
      const pieces = rule.pattern!;
      return pieces.length === 1 && pieces[0].kind === 'capture' && pieces[0].type !== undefined;
    }
    literally(node: Node, opts: { read?: boolean } = {}): Node | undefined {
      const ref = node.ref!, span = node.position;
      if (span === undefined) return undefined;
      if (ref.through !== undefined) return ref.through;
      for (const [rule, impl] of this.chain(ref.scope).receiver) {
        if (!this.literal_rule(rule)) continue;
        const piece = rule.pattern![0] as Piece & { kind: 'capture' };
        const value = this.typed(piece.type!, span, impl.closure ?? this.GLOBAL, opts);
        if (value === null || value === undefined) continue;
        const match: Match = { begin: span.begin, end: span.end + 1, pattern: span.end + 1, spanned: false, literals: [], captures: new Map([[piece.name, span]]), operators: new Map(), args: [], tight: true, read: new Map([[piece.name, value]]) };
        const read = this.apply({ rule, impl, match }, this.cursor_of(span), ref.scope, span);
        if (read !== undefined) return ref.through = read;
      }
      return undefined;
    }

    decorates(token: Text.Node, frame: Node): boolean {
      const probe = this.cursor_of(token);
      for (const [rule, impl] of this.candidates(undefined, frame)) {
        if (!impl.forward || !rule.pattern!.some(x => x.kind === 'capture')) continue;
        const match = this.match(rule.pattern!, probe, frame, { leading: false, tight: true, params: 0, closure: impl.closure });
        if (match && !match.spanned && match.end >= probe.limit) return true;
      }
      const name = this.name(probe, frame);
      if (name === undefined || this.resolved(this.reference(frame, name, token))?.fn !== Natives['^'].fn) return false;
      const rest = token.begin + name.length, text = token.source.value;
      if (rest > token.end) return true;
      // What a pattern groups with is what the grammar rule spells: a name
      // followed by one of those marks is writing a pattern, not a style.
      const marks = this.shape(frame)?.marks;
      if (marks?.has(text[rest])) return false;
      const claimed = this.claim(probe, rest, frame);
      if (claimed > rest) return claimed === token.end + 1;
      return ![...token.source.value.slice(rest, token.end + 1)].some(each => marks?.has(each) ?? false);
    }
    quiet = 0;
    style_of(token: Text.Node, frame: Node): Node | undefined {
      this.quiet++;
      try { return this.diagnostics.muted(() => this.style_at(token, frame)); }
      finally { this.quiet--; }
    }
    private style_at(token: Text.Node, frame: Node): Node | undefined {
      const probe = this.cursor_of(token);
      for (const [rule, impl] of this.candidates(undefined, frame)) {
        if (!impl.forward || !rule.pattern!.some(x => x.kind === 'capture')) continue;
        const match = this.match(rule.pattern!, probe, frame, { leading: false, tight: true, params: 0 });
        if (!match || match.spanned || match.end < probe.limit) continue;
        const head = this.head(rule);
        const real = head !== undefined ? this.resolved(this.reference(frame, head, token)) : undefined;
        if (!real?.callable) return undefined;
        let style: Node | undefined = real;
        for (const piece of rule.pattern!) {
          const span = piece.kind === 'capture' ? match.captures.get(piece.name) : undefined;
          if (span && style) style = this.call(style, this.lazy(span, frame, true), token, frame);
        }
        return style;
      }
      const name = this.name(probe, frame);
      const head = name !== undefined ? this.resolved(this.reference(frame, name, token)) : undefined;
      const rest = token.begin + (name?.length ?? 0);
      if (head?.fn && rest <= token.end && this.claim(probe, rest, frame) === token.end + 1) {
        const inner = this.inner(token.span(rest, token.end), frame);
        const argument = inner && this.deref(this.lazy(inner, frame, false), false);
        const styled = argument && this.call(head, argument, token, frame);
        return styled?.style !== undefined ? styled : undefined;
      }
      const value = this.resolved(this.expression(probe, frame, !/\s/.test(token.string)));
      return value?.style !== undefined ? value : undefined;
    }

    forwarded(token: Text.Node, frame: Node): boolean {
      const probe = this.cursor_of(token);
      return this.candidates(undefined, frame).some(([rule, impl]) => {
        if (!impl.forward || !rule.pattern!.some(x => x.kind === 'capture')) return false;
        const match = this.match(rule.pattern!, probe, frame, { leading: false, tight: true, params: 0 });
        return match !== undefined && !match.spanned && match.end >= probe.limit;
      });
    }
    site(token: Text.Node, frame: Node) {
      if (!this.forwarded(token, frame)) return;
      this.diagnostics.muted(() => this.safely(() => this.expression(this.cursor_of(token), frame, true)));
    }
    private shapes?: { version: number; base?: Node; shape?: Shape };
    private grammars = new WeakMap<Node, Shape | null>();
    shape(frame: Node): Shape | undefined {
      if (this.shapes?.version === this.version && this.shapes.base === this.BASE) return this.shapes.shape;
      let shape: Shape | undefined;
      for (const [rule, impl] of this.chain(frame).receiver) {
        let parsed = this.grammars.get(impl);
        if (parsed === undefined) this.grammars.set(impl, parsed = this.grammar(rule, impl, frame) ?? null);
        if (parsed) { shape = parsed; break; }
      }
      this.shapes = { version: this.version, base: this.BASE, shape };
      return shape;
    }
    grammar(rule: Node, impl: Node, frame: Node): Shape | undefined {
      const first = rule.pattern![0];
      if (impl.forward || first?.kind !== 'capture' || impl.body?.string.trim() !== 'external GRAMMAR_RULE') return undefined;
      const content = first.group, text = content.source.value;
      const open = text.indexOf('(', content.begin);
      if (open < 0 || open > content.end) return undefined;
      const close = this.group_end(text, open, content.end + 1);
      const closure = impl.closure ?? frame;
      const styles = (item: Text.Node) => this.tokens(item, closure).filter(token => this.decorates(token, closure));
      const literal = (item: Text.Node) => this.chunks(item).some(token => /^`[^`]*`$/.test(token.string));
      const shape: Shape = { text: [], groups: new Map(), arrow: impl.decorators ?? [], frame: closure, marks: new Set() };
      for (const alternative of this.split(content.span(open + 1, close - 2), '|')) {
        const items = this.split(alternative, ',');
        if (items.length >= 3 && literal(items[0]) && literal(items[items.length - 1])) {
          const spelled = (item: Text.Node) => this.chunks(item).find(token => /^`[^`]*`$/.test(token.string))!.string.slice(1, -1);
          const opening = spelled(items[0]), closing = spelled(items[items.length - 1]);
          shape.groups.set(opening, { open: styles(items[0]), content: items.slice(1, -1).flatMap(styles), close: styles(items[items.length - 1]) });
          shape.marks.add(opening); shape.marks.add(closing);
        } else shape.text = items.flatMap(styles);
      }
      return shape;
    }
    private synthetic = new WeakSet<Node>();
    private sited = new Map<string, string | undefined>();
    first_site(at: Text.Node): boolean {
      const key = `${at.source.location}:${at.begin}`;
      if (this.sited.has(key)) return false;
      this.sited.set(key, this.statements[0]?.source.location);
      return true;
    }
    definition_scope(frame: Node, rule: Node, impl: Node): Node {
      const scope = new Node(this.diagnostics);
      scope.parent = frame;
      scope.key = `${rule.key}#pattern`;
      this.synthetic.add(scope);
      const named = rule.pattern!.flatMap(piece => piece.kind === 'capture' || piece.kind === 'operator' ? [piece] : []);
      for (const piece of named) this.sites.set(`${scope.key}::${piece.name}`, piece.group);
      scope.given = new Set([...(impl.params ?? []), ...named.map(piece => piece.name), ...(frame === this.GLOBAL ? [] : ['this'])]);
      for (const name of scope.given) scope.set(name, this.placeholder());
      // While the body is only being looked at, a parameter has no value yet,
      // so it stands for whatever it was declared to be — otherwise the rules
      // of its type are missing from exactly the reading that gets recorded.
      if (!this.typing) {
        this.typing = true;
        try {
          impl.params?.forEach((name, k) => {
            const written = impl.param_types?.[k];
            const held = written !== undefined ? scope.own(name) : undefined;
            if (held === undefined) return;
            const named = this.diagnostics.muted(() => this.safely(() => this.deref(this.reference(frame, written!.string.trim(), written!), false)));
            if (named !== undefined) held.declared = named;
          });
        } finally { this.typing = false; }
      }
      const shape = this.shape(frame);
      const declare = (name: string, tokens: Text.Node[], group?: Group) => this.mark_name(scope, name, [this.fallback([...(group?.content ?? []).map(token => this.lazy_style(token, shape!.frame)), ...tokens.map(token => this.lazy_style(token, scope))])]);
      for (const piece of named) declare(piece.name, piece.kind === 'capture' ? piece.styles : [], shape?.groups.get(piece.kind === 'operator' ? '[' : '{'));
      impl.params?.forEach((name, k) => declare(name, impl.param_styles?.[k] ?? [], shape?.groups.get('{')));
      return scope;
    }
    private blank = Text.Node.string('');
    placeholder(): Node { return Object.assign(new Node(this.diagnostics, this.blank), { literal: true }); }
    fallback(styles: Node[]): Node {
      const node = new Node(this.diagnostics);
      Object.defineProperty(node, 'style', { get: () => { for (let k = styles.length - 1; k >= 0; k--) { const style = styles[k].style; if (style) return style; } return undefined; } });
      return node;
    }
    paint_definition(chunks: Text.Node[], decorators: Text.Node[], scope: Node, of: string, opts: { arrow?: Text.Node; params?: Text.Node[]; types?: Text.Node[]; styles?: Text.Node[]; pieces?: Piece[] } = {}) {
      const shape = this.shape(scope.parent ?? scope);
      if (shape && opts.arrow) for (const style of shape.arrow) this.paint(opts.arrow, style, shape.frame, of);
      for (const decorator of [...decorators, ...(opts.styles ?? [])]) this.paint_decorator(decorator, scope);
      for (const name of opts.params ?? []) this.paint_reference(this.reference(scope, name.string, name), true);
      for (const type of opts.types ?? []) this.paint_type(type, scope, of);
      const operators = new Set((opts.pieces ?? []).flatMap(piece => piece.kind === 'operator' ? [piece.group.begin] : []));
      for (const chunk of chunks) {
        const text = chunk.source.value, end = chunk.end + 1;
        let run = -1;
        const flush = (j: number) => {
          if (run < 0) return;
          const span = chunk.span(run, j - 1);
          if (shape) for (const style of shape.text) this.paint(span, style, shape.frame, of);
          for (const decorator of decorators) this.paint(span, decorator, scope, of);
          this.paint_words(span, scope);
          run = -1;
        };
        for (let j = chunk.begin; j < end;) {
          // What groups a pattern is what the grammar rule writes down: the
          // openings it spells, and the operator groups already found.
          if (shape?.groups.has(text[j]) || operators.has(j)) {
            flush(j);
            const close = this.group_end(text, j, end);
            const group = shape?.groups.get(text[j]);
            if (shape && group) {
              for (const style of group.open) this.paint(chunk.span(j, j), style, shape.frame, of);
              for (const style of group.close) this.paint(chunk.span(close - 1, close - 1), style, shape.frame, of);
            }
            if (close - 2 >= j + 1) this.paint_group(chunk.span(j + 1, close - 2), scope, of, shape, { operator: operators.has(j), group });
            j = close;
            continue;
          }
          if (run < 0) run = j;
          j++;
        }
        flush(end);
      }
    }
    paint_decorator(token: Text.Node, scope: Node) {
      this.site(token, scope);
      this.paint_name(token, scope);
      const name = this.name(this.cursor_of(token), scope);
      const rest = name === undefined ? undefined : token.span(token.begin + name.length, token.end);
      if (rest && rest.begin <= rest.end && /^[\s(]/.test(rest.string)) this.paint_words(rest, scope);
    }
    raw_argument(span: Text.Node, scope: Node): boolean {
      const text = span.source.value;
      let j = span.begin - 1;
      while (j >= 0 && (text[j] === ' ' || text[j] === '\t')) j--;
      const end = j;
      while (j >= 0 && /[\p{L}\p{N}_-]/u.test(text[j])) j--;
      const word = text.slice(j + 1, end + 1);
      return word.length > 0 && scope.lookup(word)?.reads !== undefined;
    }
    rule_head(word: string, frame: Node): Node | undefined {
      const chain = this.chain(frame);
      for (const [rule, impl] of [...chain.operand, ...chain.receiver]) if (!impl.forward && this.head(rule) === word) return rule;
    }
    paint_rule(word: string, span: Text.Node, scope: Node) {
      if (this.raw_argument(span, scope)) return;
      const spans = this.verbatim.get(span.source.location ?? '');
      if (spans?.some(([begin, end]) => span.begin >= begin && span.end <= end)) return;
      for (const [rule, impl] of [...this.chain(scope).operand, ...this.chain(scope).receiver]) {
        if (impl.forward || this.head(rule) !== word) continue;
        const painted = span.span(span.begin, span.end);
        painted.of = rule.key;
        painted.defines = `rule::${rule.key}`;
        painted.style = () => {
          const current = (impl.closure ?? this.GLOBAL).methods?.get(rule) ?? impl;
          for (let k = (current.decorators?.length ?? 0) - 1; k >= 0; k--) {
            const style = this.safely(() => this.style_of(current.decorators![k], impl.closure ?? scope))?.style;
            if (style) return style;
          }
          return undefined;
        };
        this.record(painted);
        return;
      }
    }
    private prefixing?: { version: number; marks: Set<string> };
    // What a word written straight after it belongs to: a rule that reads a
    // word after one character reads it as that character's, not as a name of
    // its own — `.name` is a member, `^name` a style.
    get prefixes(): Set<string> {
      if (this.prefixing?.version === this.version) return this.prefixing.marks;
      const marks = new Set<string>();
      const take = (rules: [Node, Node][]) => {
        for (const [rule] of rules) {
          const pieces = rule.pattern!;
          const opening = pieces[0], after = pieces[1];
          if (opening?.kind !== 'literal' || after?.kind !== 'capture' || !after.raw) continue;
          const text = opening.text.trim();
          if (text.length === 1 && !/[\p{L}\p{N}_]/u.test(text)) marks.add(text);
        }
      };
      for (const scope of this.BASE === undefined ? [this.GLOBAL] : [this.GLOBAL, this.BASE]) {
        const set = this.ruleset(scope);
        take(set.operand);
        take(set.receiver);
      }
      this.prefixing = { version: this.version, marks };
      return marks;
    }
    paint_words(span: Text.Node, scope: Node) {
      const text = span.source.value;
      for (const found of span.string.matchAll(/[\p{L}_][\p{L}\p{N}_-]*|[^\s\p{L}\p{N}_(){}\[\]`,.]+/gu)) {
        const at = span.begin + found.index!;
        if (this.prefixes.has(text[at - 1])) continue;
        const reference = this.reference(scope, found[0], span.span(at, at + found[0].length - 1));
        if (this.resolved(reference) !== undefined) this.paint_reference(reference, true);
      }
    }
    paint_group(content: Text.Node, scope: Node, of: string, shape?: Shape, opts: { operator?: boolean; group?: Group } = {}) {
      const tokens = this.tokens(content, scope);
      const decorators = tokens.filter(token => this.decorates(token, scope));
      decorators.forEach(token => this.paint_decorator(token, scope));
      const annotates = this.marked(scope, 'annotation'), opens = this.grouping(scope)?.[0];
      const grouped = (t: string) => opens !== undefined && t.startsWith(opens);
      const words: Text.Node[] = [], types: Text.Node[] = [];
      for (const token of tokens) {
        if (decorators.includes(token)) continue;
        const t = token.string;
        if (types.length > 0) { types.push(token); continue; }
        const colon = annotates === undefined || grouped(t) || t.startsWith('`') ? -1 : t.indexOf(annotates);
        if (colon < 0) { words.push(token); continue; }
        if (colon > 0) words.push(token.span(token.begin, token.begin + colon - 1));
        types.push(token.span(token.begin + colon + annotates!.length, token.end));
      }
      const last = words[words.length - 1];
      const name = last && !grouped(last.string) ? words.pop() : undefined;
      if (!name && last) types.unshift(words.pop()!);
      for (const word of words) this.paint_words(word, scope);
      if (name) {
        const t = name.string;
        if (/^`[^`]*`$/.test(t)) {
          this.sample(name, scope);
          if (t.length > 2) for (const decorator of decorators) this.paint(name.span(name.begin + 1, name.end - 1), decorator, scope, of);
        } else if (/^[\p{L}_]/u.test(t)) {
          const reference = this.reference(scope, t, name);
          if (this.resolved(reference) !== undefined) this.paint_reference(reference, true);
          else {
            if (shape) for (const style of opts.group?.content ?? []) this.paint(name, style, shape.frame, of);
            for (const decorator of decorators) this.paint(name, decorator, scope, of);
          }
        }
      }
      if (!opts.operator) for (const type of types) if (!type.empty() && type.begin <= type.end) this.paint_type(type, scope, of);
    }
    paint_type(span: Text.Node, scope: Node, of: string) {
      this.probe(span, scope, { report: true });
    }
    owns: (src: Text.Source) => boolean = () => true;
    painting: Text.Node[] = this.paints;
    marks: Marks = Interpreter.marks();
    static marks(): Marks { return { names: new Map(), values: new WeakMap(), given: new Map(), stands: new Map(), instances: new WeakMap() }; }
    private inherited(): Marks {
      const marks = Interpreter.marks(), source = this.copy_of!.marks;
      for (const [scope, entries] of source.names) { const of = this.seen.get(scope); if (of) marks.names.set(of, new Map(entries)); }
      return marks;
    }
    marking = this.marks;
    decorate(target: Node, style: Node): Node {
      const reference = this.reference_of(target);
      if (reference.ref) {
        const marked = new Node(this.diagnostics, reference.position);
        marked.ref = reference.ref;
        marked.marks = [...(reference.marks ?? []), style];
        return marked;
      }
      const value = this.deref(target, false);
      if (value) this.mark_value(value, [style]);
      return value ?? target;
    }
    private epoch = 0;
    private stale = new Map<string, number>();
    entry<T>(mark: T): Mark<T> { return { mark, by: this.statements[0]?.source.location, epoch: this.epoch }; }
    live<T>(entry: Mark<T> | undefined): T | undefined {
      return entry && (entry.by === undefined || entry.epoch >= (this.stale.get(entry.by) ?? 0)) ? entry.mark : undefined;
    }
    mark_value(value: Node, styles: Node[], sources: Node[] = []) {
      let marks = this.marking.values.get(value);
      if (!marks) this.marking.values.set(value, marks = new Map());
      const except = sources.flatMap(source => source.ref ? [[this.scope_of(source) ?? source.ref.scope, source.ref.key] as [Node, string]] : []);
      for (const style of styles) if (!this.live(marks.get(style.style!))) marks.set(style.style!, { ...this.entry(style), except });
    }
    mark_name(scope: Node, key: string, styles: Node[]) {
      let marks = this.marking.names.get(scope);
      if (!marks) this.marking.names.set(scope, marks = new Map());
      marks.set(key, this.entry(styles[styles.length - 1]));
    }
    receives(rule: Node, impl: Node, receiver: Node | undefined) {
      const closure = impl.closure ?? this.GLOBAL;
      const reference = receiver?.ref;
      if (!reference) return;
      if ((this.probing || this.analyzing) && !reference.own && this.scope_of(receiver!) === undefined && !(reference.literal && this.literally(receiver!, { read: false }) !== undefined)) {
        const named = rule.pattern![0];
        if (!this.binders.has(this.binder_of(rule)) && !(named?.kind === 'capture' && named.raw)) this.error(`Unresolved \`${reference.key}\`.`, receiver!.position);
        else if (this.synthetic.has(reference.scope)) reference.scope.set(reference.key, this.placeholder());
      }
      // An instance mark colours what is painted, and bodies are only painted while probing.
      if (closure !== this.GLOBAL && (this.probing > 0 || !this.in_body(receiver!.position ?? rule.position!))) this.mark_instance(receiver, closure);
    }
    private binders = new Set<string>();
    binder_of(rule: Node): string { const at = rule.position; return at ? `${at.source.location}:${at.begin}` : rule.key!; }
    private ran = new Set<string>();
    private entered = new Map<string, number>();
    private applying: { rule: Node; impl?: Node; receiver?: Node; local?: Node }[] = [];
    mark_instance(receiver: Node | undefined, closure: Node) {
      if (!receiver?.ref || closure === this.GLOBAL) return;
      const scope = this.scope_of(receiver) ?? receiver.ref.scope;
      let table = this.marking.instances.get(scope);
      if (!table) this.marking.instances.set(scope, table = new Map());
      let closures = table.get(receiver.ref.key);
      if (!closures) table.set(receiver.ref.key, closures = new Map());
      closures.set(closure, this.entry(closure));
    }
    stands_for(closure: Node, name: string): Node | undefined {
      for (let scope: Node | undefined = closure; scope; scope = scope.parent) {
        const style = this.live(this.marks.stands.get(scope)?.get(name));
        if (style) return style();
      }
      return undefined;
    }
    mark_given(body: Text.Node, given: Set<string>, frame: Node) {
      const inner = this.inner(body, frame) ?? body;
      const text = inner.source.value;
      for (let j = inner.begin; j <= inner.end;) {
        let end = text.indexOf('\n', j);
        if (end < 0 || end > inner.end + 1) end = inner.end + 1;
        const chunks = end > j ? this.tokens(inner.span(j, end - 1), frame) : [];
        if (chunks.length >= 2 && given.has(chunks[0].string) && this.decorates(chunks[1], frame)) {
          const decorator = chunks[1];
          const table = chunks.length === 2 ? this.marking.stands : this.marking.given;
          let marks = table.get(frame);
          if (!marks) table.set(frame, marks = new Map());
          marks.set(chunks[0].string, this.entry(() => this.safely(() => this.style_of(decorator, frame))));
        }
        j = end + 1;
      }
    }
    site_of(): Text.Node | undefined {
      for (let k = this.statements.length - 1; k >= 0; k--) if (!this.in_body(this.statements[k])) return this.statements[k];
      return this.statements[0];
    }
    binding(node: Node): string | undefined {
      const scope = this.scope_of(node) ?? node.ref!.scope;
      return `${scope === this.GLOBAL ? 'GLOBAL' : scope.key}::${node.ref!.key}`;
    }
    scope_of(node: Node): Node | undefined {
      const { scope, key, own } = node.ref!;
      if (own) return scope;
      for (let current: Node | undefined = scope; current; current = current.parent) if (current.own(key) !== undefined || current.members?.get(key) !== undefined) return current;
    }
    mark_of(node: Node, definition: boolean = false): Node | undefined {
      const scope = this.scope_of(node) ?? node.ref!.scope;
      const key = node.ref!.key;
      const mark = node.ref!.member ? undefined : this.live(this.marks.names.get(scope)?.get(key));
      if (mark) return mark;
      if (scope.given?.has(key)) {
        for (let closure = scope.parent; closure; closure = closure.parent) {
          const given = this.live(this.marks.given.get(closure)?.get(key));
          if (given) return given();
        }
        return undefined;
      }
      if (!definition) {
        const value = this.resolved(node);
        for (const entry of [...((value && this.marks.values.get(value))?.values() ?? [])].reverse()) {
          if (entry.except?.some(([owner, name]) => owner === scope && name === key)) continue;
          const mark = this.live(entry);
          if (mark) return mark;
        }
      }
      for (const entry of this.marks.instances.get(scope)?.get(key)?.values() ?? []) {
        const closure = this.live(entry);
        const style = closure && this.stands_for(closure, 'this');
        if (style) return style;
      }
      return undefined;
    }
    paint_head(rule: Node, match: Match, cursor: Text.Node, frame: Node) {
      const first = match.literals[0];
      if (!first) return;
      const [p, begin, end] = first;
      const head = (rule.pattern![p] as { text: string }).text.trim();
      if (!head || /\s/.test(head) || frame.lookup(head) === undefined) return;
      const at = cursor.source.value.indexOf(head, begin);
      if (at < 0 || at + head.length - 1 > end) return;
      this.paint_reference(this.reference(frame, head, cursor.span(at, at + head.length - 1)));
    }
    paint_name(token: Text.Node, frame: Node) {
      const probe = this.cursor_of(token);
      const name = this.name(probe, frame);
      if (name !== undefined) this.paint_reference(this.reference(frame, name, token.span(token.begin, token.begin + name.length - 1)));
    }
    private referenced = new Map<string, Text.Node>();
    private verbatim = new Map<string, [number, number][]>();
    paint_reference(reference: Node, lexical: boolean = false, definition: boolean = false) {
      const at = reference.position;
      if (!at || !this.owns(at.source)) return;
      if (!lexical && !this.probing && this.in_body(at)) return;
      const key = `${at.source.location}:${at.begin}:${at.end}`;
      const style = () => this.mark_of(reference, definition)?.style;
      const existing = this.referenced.get(key);
      if (existing) { if (lexical) existing.style = style; return; }
      const painted = at.span(at.begin, at.end);
      painted.style = style;
      painted.defines = () => this.binding(reference);
      this.referenced.set(key, painted);
      this.record(painted);
    }
    private bodies = new Map<Text.Source, { seen: Set<number>; list: number[]; merged?: number[] }>();
    body_of(span: Text.Node) {
      let held = this.bodies.get(span.source);
      if (held === undefined) this.bodies.set(span.source, held = { seen: new Set(), list: [] });
      const key = span.begin * 1e7 + span.end;
      if (held.seen.has(key)) return;
      held.seen.add(key);
      held.list.push(span.begin, span.end);
      held.merged = undefined;
    }
    in_body(at: Text.Node): boolean {
      const held = this.bodies.get(at.source);
      if (held === undefined) return false;
      if (held.merged === undefined) {
        const spans: [number, number][] = [];
        for (let k = 0; k < held.list.length; k += 2) spans.push([held.list[k], held.list[k + 1]]);
        spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
        const merged: number[] = [];
        for (const [begin, end] of spans) {
          if (merged.length > 0 && begin <= merged[merged.length - 1] + 1) { if (end > merged[merged.length - 1]) merged[merged.length - 1] = end; continue; }
          merged.push(begin, end);
        }
        held.merged = merged;
      }
      const spans = held.merged;
      let low = 0, high = (spans.length >> 1) - 1, found = -1;
      while (low <= high) { const mid = (low + high) >> 1; if (spans[mid << 1] <= at.begin) { found = mid; low = mid + 1; } else high = mid - 1; }
      return found >= 0 && at.end <= spans[(found << 1) + 1];
    }
    lazy_style(token: Text.Node, frame: Node): Node {
      const node = new Node(this.diagnostics, token);
      Object.defineProperty(node, 'style', { get: () => this.safely(() => this.style_of(token, frame))?.style });
      return node;
    }
    sample(token: Text.Node, frame: Node) {
      this.diagnostics.muted(() => this.safely(() => this.expression(this.cursor_of(token), frame, true)));
    }
    excluded(span: Text.Node, frame: Node): [number, number][] {
      const out: [number, number][] = [];
      const cursor = this.cursor_of(span);
      const text = span.source.value;
      for (let j = span.begin; j <= span.end;) {
        if (this.line_rule(cursor, j, frame)) {
          let end = text.indexOf('\n', j);
          if (end < 0 || end > span.end) end = span.end + 1;
          out.push([j, end - 1]); j = end; continue;
        }
        const raw = this.layers.brackets.find(([rule]) => (rule.pattern![0] as { text: string }).text[0] === text[j] && rule.pattern!.some(piece => piece.kind === 'capture' && piece.raw));
        if (raw) {
          const match = this.match(raw[0].pattern!, cursor.bounded(j, span.end + 1), frame, { leading: false, tight: true, params: 0 });
          if (match) { out.push([j, match.end - 1]); j = match.end; continue; }
        }
        j++;
      }
      return out;
    }
    probing = 0;
    private probed = new Set<string>();
    probe(span: Text.Node, scope: Node, opts: { report?: boolean } = {}) {
      const key = `${span.source.location}:${span.begin}:${span.end}`;
      if (this.probed.has(key) || this.probing > Interpreter.DEPTH) return;
      this.probed.add(key);
      this.probing++;
      const run = () => this.safely(() => this.array(this.cursor_of(span), scope, opts.report, true));
      try { opts.report ? run() : this.diagnostics.muted(run); }
      finally { this.probing--; this.probed.delete(key); }
    }
    paint_body(body: Text.Node, scope: Node) {
      const frame = scope.parent!;
      const inner = this.inner(body, frame) ?? body;
      const text = inner.source.value;
      const declared: Text.Node[] = [];
      for (let j = inner.begin; j <= inner.end;) {
        let end = text.indexOf('\n', j);
        if (end < 0 || end > inner.end + 1) end = inner.end + 1;
        const chunks = end > j ? this.tokens(inner.span(j, end - 1), frame) : [];
        if (chunks.length >= 2 && /^[\p{L}_]/u.test(chunks[0].string) && this.decorates(chunks[1], frame)) {
          const name = chunks[0].string;
          if (chunks.length > 2 && !scope.own(name)) scope.set(name, this.placeholder());
          if (chunks.length > 2 && !scope.given?.has(name)) this.mark_name(scope, name, [this.lazy_style(chunks[1], frame)]);
          declared.push(chunks[0]);
        }
        j = end + 1;
      }
      for (const token of declared) this.paint_reference(this.reference(scope, token.string, token), true, true);
      this.probe(body, scope);
      const skip = this.excluded(body, frame);
      const outside = (at: number) => !skip.some(([b, e]) => at >= b && at <= e);
      const definitions = new Set(declared.map(token => token.begin));
      for (const found of body.string.matchAll(/[\p{L}_][\p{L}\p{N}_-]*/gu)) {
        const at = body.begin + found.index!, word = found[0];
        if (!outside(at) || this.prefixes.has(text[at - 1]) || definitions.has(at)) continue;
        const span = body.span(at, at + word.length - 1);
        if (scope.lookup(word) === undefined) { this.paint_rule(word, span, scope); continue; }
        this.paint_reference(this.reference(scope, word, span), true);
      }
    }
    paint(span: Text.Node, decorator: Text.Node | Node | undefined | (() => (Text.Node | Node)[]), frame: Node, of?: string, opts: { head?: boolean } = {}) {
      if (!this.owns(span.source) || (!this.probing && this.in_body(span))) return;
      const painted = span.span(span.begin, span.end);
      painted.of = of;
      painted.head = opts.head;
      if (decorator === undefined) { painted.style = ''; this.record(painted); return; }
      const resolve = (token: Text.Node | Node) => (token instanceof Node ? token : this.safely(() => this.style_of(token, frame)))?.style;
      painted.style = typeof decorator !== 'function' ? () => resolve(decorator) : () => {
        const tokens = decorator();
        for (let k = tokens.length - 1; k >= 0; k--) { const style = resolve(tokens[k]); if (style) return style; }
        return undefined;
      };
      this.record(painted);
    }
    record(painted: Text.Node) {
      if (this.quiet) return;
      painted.by = this.statements[0]?.source.location;
      this.painting.push(painted);
    }

    style(name: string): Node {
      const node = new Node(this.diagnostics);
      node.style = name; node.arity = 1;
      node.fn = ({ interpreter, args: [target] }) => interpreter.decorate(target, node);
      return node;
    }
    alias(name: string, value: Node | undefined) {
      if (value?.style === undefined) return;
      const statement = this.site_of();
      if (statement) this.sites.set(`theme::${name}`, statement);
      const table = this.building ?? (this.theme ??= Object.assign(new Node(this.diagnostics), { theme: new Map<string, string>() }));
      table.theme!.set(name, value.style);
      this.palette = undefined;
    }
    private palette?: { theme?: Node; colors: Map<string, string> };
    colors(): Map<string, string> {
      if (this.palette && this.palette.theme === this.theme) return this.palette.colors;
      const table = this.theme?.theme ?? new Map<string, string>();
      const out = new Map<string, string>();
      const resolve = (name: string, seen: Set<string> = new Set()): string | undefined => {
        if (name.startsWith('#')) return name;
        if (seen.has(name)) return undefined;
        seen.add(name);
        const next = table.get(name);
        if (next !== undefined) return resolve(next, seen);
        const dot = name.lastIndexOf('.');
        return dot > 0 ? resolve(name.slice(0, dot), seen) : undefined;
      };
      for (const name of table.keys()) { const color = resolve(name); if (color) out.set(name, color); }
      this.palette = { theme: this.theme, colors: out };
      return out;
    }
    color(name: string | undefined): string | undefined {
      if (name === undefined) return undefined;
      if (name.startsWith('#')) return name;
      const colors = this.colors();
      for (let n = name; n; n = n.includes('.') ? n.slice(0, n.lastIndexOf('.')) : '') { const color = colors.get(n); if (color) return color; }
    }

    peel(node: Node): Node | undefined {
      let current: Node | undefined = node;
      for (let depth = 0; current && depth < 64; depth++) {
        if (current.ref) { current = this.bound(current); continue; }
        if (current.lazy && !this.inner(current.lazy.span, current.lazy.frame)) {
          const next = this.reference_of(current);
          if (!next.ref) return current;
          current = next;
          continue;
        }
        return current;
      }
      return current;
    }

    // A literal made by the runtime: a node whose text is the given string.
    literal_of(text: string, at: Text.Node): Node {
      const node = new Node(this.diagnostics, Text.Node.string(text));
      node.literal = true;
      return node;
    }
    io(location: string, content: string | undefined, at: Text.Node): Node {
      const fs = env.fs;
      if (location === 'stdin') return this.literal_of(fs.readFileSync(0, 'utf8'), at);
      if (location === 'stdout' || location === 'stderr') { (location === 'stdout' ? process.stdout : process.stderr).write(content ?? ''); return this.NONE; }
      if (content === undefined) return this.literal_of(fs.readFileSync(location, 'utf8'), at);
      fs.writeFileSync(location, content);
      return this.NONE;
    }
    // Where a value is written: the file it is in and where in it. Two things
    // written in one place are one thing; a thing written nowhere has no
    // location.
    located(node: Node, at: Text.Node): Node {
      const value = this.deref(node);
      const position = value?.position ?? value?.body ?? value?.lazy?.span;
      if (position === undefined || position.source.location === undefined) return this.NONE;
      return this.literal_of(`${position.source.location}:${position.begin}`, at);
    }
    inline(node: Node, frame: Node, opts: { compose?: boolean } = {}): Node | undefined {
      if (this.depth > Interpreter.DEPTH) throw new Recursion(node, node.position ?? this.statements[0]!);
      this.depth++;
      try { return this.inlined(node, frame, opts); }
      finally { this.depth--; }
    }
    private unforced(node: Node): Node | undefined {
      if (!node.ref) return undefined;
      const bound = this.bound(node);
      return bound?.lazy && !bound.lazy.raw ? bound : undefined;
    }
    private inlined(node: Node, frame: Node, opts: { compose?: boolean } = {}): Node | undefined {
      // Looking for a label means running past the statements in between; they
      // are only being read, so nothing they say should take effect.
      if (this.seeking !== undefined) return undefined;
      // A name is followed to what it holds; any other text is run as it is.
      const text = node.lazy !== undefined && !node.lazy.raw && node.value === undefined && !/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(node.lazy.span.string.trim());
      const target = text ? node : this.unforced(node) ?? this.safely(() => this.peel(node));
      if (target?.lazy?.span.empty()) return undefined;
      if (!target) { this.error(`Unresolved \`${this.text(node)}\`.`, node.position); return undefined; }
      if (target.lazy) {
        target.lazy.consumed = true;
        this.sees(frame, target.lazy.frame);
        const inner = this.inner(target.lazy.span, target.lazy.frame);
        const span = inner ?? target.lazy.span;
        // An argument list is one statement per argument: what the separator
        // rule spells splits it, outside any brackets. A block is not a list.
        const opens = this.scoped(frame);
        const between = opens !== undefined && target.lazy.span.string.trimStart().startsWith(opens) ? undefined : this.marked(frame, 'separator');
        const parts = between !== undefined ? this.split(span, between) : [span];
        let last: Node | undefined;
        for (const part of parts) last = this.safely(() => this.array(this.cursor_of(part), frame, true));
        // Text that reads as a block is that block, inlined in turn.
        const held = last !== undefined ? this.resolved(last) ?? last : undefined;
        if (held?.lazy !== undefined && held.value === undefined && held !== target) return this.inlined(held, frame, opts);
        return last;
      }
      if (target.theme) { this.theme = target; return target; }
      if (target.none) { frame.none = true; return target; }
      // Composing reads from a value; only inlining runs a definition's body.
      if (target.body && !opts.compose) return this.safely(() => this.array(this.cursor_of(target.body), frame, true));
      if ((target.methods || target.members) && !target.body) this.reads_from(frame, target, opts.compose === true);
      return target;
    }
    // Text run here reads the names of where it was written, without this
    // frame being made of that one.
    sees(frame: Node, from: Node) {
      if (frame === from || frame === this.NONE || from === this.NONE) return;
      const sees = (frame.sees ??= []);
      if (!sees.includes(from)) sees.push(from);
    }
    reads_from(frame: Node, from: Node, composing = false) {
      // Nothing is made of nothing, and reads from nothing.
      if (frame === from || frame === this.NONE || from === this.NONE) return;
      for (const scope of from.composed(new Set())) if (scope === frame) return;
      const held = composing ? (frame.made_of ??= []) : (frame.inlined ??= []);
      if (!held.includes(from)) { held.push(from); this.composing++; }
    }
    inner(span: Text.Node, frame: Node): Text.Node | undefined {
      const probe = this.cursor_of(span);
      for (const [rule] of this.brackets(frame)) {
        const match = this.match(rule.pattern!, probe, frame, { leading: false, tight: true, params: 0 });
        if (match && match.end === probe.limit) return [...match.captures.values()][0];
      }
    }
    theme_of(name: Node, block: Node, at: Text.Node): Node {
      const theme = new Node(this.diagnostics, at);
      theme.theme = new Map(); theme.key = this.text(name);
      const previous = this.building;
      this.building = theme;
      this.inline(block, this.frame(this.GLOBAL, `theme@${this.anchor(at)}`, this.GLOBAL));
      this.building = previous;
      return theme;
    }
    report(level: Node | undefined, variable: Node | undefined, comment: Node | undefined, at?: Text.Node): Node | undefined {
      const levels: Record<string, Diagnostic['level']> = { FATAL: 'fatal', ERROR: 'error', WARN: 'warning', INFO: 'info', DEBUG: 'debug', TRACE: 'trace' };
      const target = variable && this.resolved(variable);
      const node = target?.position ?? variable?.position ?? comment?.position ?? at;
      if (node) this.complain((level !== undefined ? levels[this.text(level)] : undefined) ?? 'error', comment ? this.text(comment) : '', node);
      return comment;
    }
    program_of(node: Node): Node | undefined {
      const target = this.peel(node);
      if (!target?.lazy) return this.deref(node);
      const program = new Node(this.diagnostics, target.lazy.span);
      program.body = this.inner(target.lazy.span, target.lazy.frame) ?? target.lazy.span;
      program.closure = target.lazy.frame;
      program.params = [];
      return program;
    }

    pending_rewrites: [Node, Node][] = [];
    analyze(location?: string) {
      this.analyzing = true;
      try { return this.analyzed(location); } finally { this.analyzing = false; }
    }
    private analyzed(location?: string) {
      const here = (rule: Node) => location === undefined || rule.position?.source.location === location;
      this.hands = new Map();
      for (const [rule, impl] of this.definitions_of()) {
        const names = impl.forward ? undefined : this.handed.get(rule);
        if (names === undefined) continue;
        const head = this.head(rule);
        if (head === undefined) continue;
        let out = this.hands.get(head);
        if (out === undefined) this.hands.set(head, out = new Set());
        for (const name of names) out.add(name);
      }
      for (const [rule, impl] of this.definitions_of()) {
        if (impl.forward || !impl.body || this.ran.has(rule.key!) || this.pending_rewrites.some(([other]) => other === rule)) continue;
        if (!this.owns(impl.body.source) || (location !== undefined && impl.body.source.location !== location)) continue;
        if (!this.first_site(impl.body)) continue;
        const scope = this.definition_scope(impl.closure ?? this.GLOBAL, rule, impl);
        this.quiet++;
        try { this.probe(impl.body, scope); } finally { this.quiet--; }
        for (const missing of this.missing(rule, impl, scope)) this.error(`Unresolved \`${missing.string}\`.`, missing);
      }
      for (const node of this.deferred) {
        const lazy = node.lazy!;
        if (node.value !== undefined || lazy.consumed || this.in_body(lazy.span) || !this.owns(lazy.span.source)) continue;
        if (location !== undefined && lazy.span.source.location !== location) continue;
        this.probe(lazy.span, lazy.frame, { report: true });
      }
      for (const [rule, impl] of this.pending_rewrites) if (here(rule))
        for (const missing of this.missing(rule, impl)) this.error(`Unresolved \`${missing.string}\`.`, missing);
      const scopes = [this.GLOBAL, ...this.frames.values()];
      for (const forward of this.forwards) {
        if (!here(forward)) continue;
        const head = this.head(forward);
        const implemented = head !== undefined && scopes.some(scope =>
          scope.rules.some(rule => rule !== forward && !scope.methods!.get(rule)!.forward && this.head(rule) === head) ||
          ((scope.own(head)?.callable ?? false) && !scope.own(head)!.forward));
        if (!implemented) this.error(`Expected \`${forward.position!.string}\` to be implemented later on (it was declared with \`forward\`), but it never was.`, forward.position);
      }
    }
  }

  export type Mark<T> = { mark: T; by?: string; epoch: number; except?: [Node, string][] };
  export type Marks = {
    names: Map<Node, Map<string, Mark<Node>>>;
    values: WeakMap<Node, Map<string, Mark<Node>>>;
    given: Map<Node, Map<string, Mark<() => Node | undefined>>>;
    stands: Map<Node, Map<string, Mark<() => Node | undefined>>>;
    instances: WeakMap<Node, Map<string, Map<Node, Mark<Node>>>>;
  };

  export type Group = { open: Text.Node[]; content: Text.Node[]; close: Text.Node[] };
  export type Shape = { text: Text.Node[]; groups: Map<string, Group>; arrow: Text.Node[]; frame: Node; marks: Set<string> };

  export class Jump extends Error {
    site?: Text.Node
    constructor(public label: string, public value?: Node, public kind?: 'end' | 'begin') { super('jump'); }
  }

  export class Recursion extends Error {
    constructor(public rule: Node, public at: Text.Node) { super('recursion'); }
  }

  export const describe = (piece: Piece): string => {
    switch (piece.kind) {
      case 'literal': return piece.text;
      case 'space': return '{ }';
      case 'newline': return '{\\n}';
      case 'capture': return `{${piece.raw ? 'literal ' : ''}${piece.name}${piece.type ? `: ${piece.type}` : ''}}`;
      case 'operator': return `[${piece.name}]`;
    }
  };

  const identity: Native = { arity: 1, fn: ({ args: [node] }) => node };
  export const Natives: Record<string, Native> = {
    'external': { arity: 0, fn: ({ interpreter }) => interpreter.EXTERNAL },
    'forward': { arity: 0, fn: ({ interpreter }) => interpreter.FORWARD },
    'GRAMMAR_RULE': { arity: 0, fn: ({ interpreter, at }) => Object.assign(new Node(interpreter.diagnostics, at), { key: 'GRAMMAR_RULE' }) },
    '.': { arity: 0, fn: ({ frame }) => frame },
    'global': { arity: 0, fn: ({ interpreter }) => interpreter.GLOBAL },
    'get': { arity: 2, pure: true, fn: ({ interpreter, args: [node, key] }) => interpreter.get(node, key) },
    'assign': { arity: 2, fn: ({ interpreter, args: [slot, value], at }) => interpreter.assign(slot, value, at) },
    'declare': { arity: 2, fn: ({ interpreter, args: [slot, value], at }) => interpreter.assign(slot, value, at, { declare: true }) },
    // Whether a name is the scope's own (or already a value): what `:` types rather than declares.
    'own': { arity: 1, pure: true, fn: ({ interpreter, args: [node] }) => {
      // The name as written, followed through what it is bound to while that
      // is itself a name.
      const written = node.lazy?.frame;
      let cur: Node | undefined = node.lazy !== undefined ? interpreter.reference(node.lazy.frame, node.lazy.span.string.trim(), node.lazy.span) : node;
      for (let depth = 0; cur?.ref !== undefined && depth < 64; depth++) { const held = interpreter.bound(cur); if (held?.ref !== undefined) cur = held; else break; }
      if (cur === undefined || cur.unknown || cur.ref?.scope.unknown) return interpreter.NONE;
      // A name is held where it is written: what is only visible from further
      // out is not this one's, so writing it down here writes a new name down.
      // A name reached through another answers about where that one lives.
      const scope = cur.ref === undefined ? undefined : written !== undefined && cur.ref.key === node.lazy?.span.string.trim() ? written : cur.ref.scope;
      return scope === undefined || scope.own(cur.ref!.key) !== undefined || scope.members?.get(cur.ref!.key) !== undefined ? interpreter.GLOBAL : interpreter.NONE;
    } },
    'goto': { arity: 2, fn: ({ interpreter, frame, args: [label, condition] }) => interpreter.jump(label, condition, frame) },
    'none': { arity: 0, pure: true, fn: ({ interpreter }) => interpreter.NONE },
    'return\\': { arity: 0, pure: true, fn: ({ interpreter }) => interpreter.RETURN },
    'recur\\': { arity: 0, pure: true, fn: ({ interpreter }) => interpreter.RECUR },
    'label': { arity: 1, pure: true, fn: ({ interpreter, args: [name] }) => interpreter.labelled(name) },
    'base': { arity: 1, fn: ({ interpreter, args: [node] }) => { const target = interpreter.deref(node); if (target) interpreter.BASE = target; return target; } },
    // Where a thing is written, and whether two texts are the same text: the
    // machine answering about its own, as `bits` answers about its bytes.
    'where': { arity: 1, fn: ({ interpreter, args: [node], at }) => interpreter.located(node, at) },
    'alike': { arity: 2, fn: ({ interpreter, args: [left, right] }) => { const a = interpreter.deref(left) ?? left, b = interpreter.deref(right) ?? right; return a.none || b.none ? interpreter.NONE : interpreter.text(a) === interpreter.text(b) ? interpreter.GLOBAL : interpreter.NONE; } },
    'inline': { arity: 1, fn: ({ interpreter, frame, args: [node] }) => interpreter.inline(node, frame) },
    // What crosses from the machine into the language is a literal: `bits` reads
    // one as its bytes, and the rest are read that way language-side.
    'bits': { arity: 2, fn: ({ interpreter, frame, args: [node, each], at }) => { for (const bit of [...new TextEncoder().encode(interpreter.text(node))].flatMap(byte => byte.toString(2).padStart(8, '0').split(''))) { const taken = interpreter.call(each, interpreter.lazy(Text.Node.string(bit), frame, false), at, frame); if (interpreter.deref(taken, false)?.none) break; } return interpreter.NONE; } },
    'time': { arity: 0, fn: ({ interpreter, at }) => interpreter.literal_of(String(process.hrtime.bigint()), at) },
    // One bit from the machine, as this language spells a bit: it is there or
    // it is not. Handed over as a written `0` or `1` it could not be read at
    // all, since a written literal has no equality of its own.
    'random': { arity: 0, fn: ({ interpreter }) => env.import<typeof import('crypto')>('crypto').randomInt(2) === 1 ? interpreter.GLOBAL : interpreter.NONE },
    'io': { arity: 2, fn: ({ interpreter, args: [location, content], at }) => interpreter.io(interpreter.text(location), content.none ? undefined : interpreter.text(content), at) },
    'os': { arity: 1, fn: ({ interpreter, args: [name], at }) => { const key = interpreter.text(name); const value = key === 'platform' ? process.platform : key === 'architecture' ? process.arch : process.env[key]; return value === undefined ? interpreter.NONE : interpreter.literal_of(value, at); } },
    'extend': { arity: 2, fn: ({ interpreter, args: [target, node] }) => { const into = interpreter.deref(target); return into ? interpreter.inline(node, into, { compose: true }) : undefined; } },
    'literal': { arity: 1, fn: ({ args: [node] }) => node },
    'unordered': { arity: 1, fn: ({ args: [node] }) => node },
    'theme': { arity: 2, fn: ({ interpreter, args: [name, block], at }) => interpreter.theme_of(name, block, at) },
    'report': { arity: 3, fn: ({ interpreter, args: [level, variable, comment], at }) => interpreter.report(level, variable, comment, at) },
    '^': { arity: 1, fn: ({ interpreter, args: [name] }) => interpreter.style(interpreter.text(name)) },
    '**': { arity: 1, fn: ({ interpreter, args: [node] }) => interpreter.program_of(node) },
    '=': identity,
    'left-to-right': identity,
    'right-to-left': identity,
    '</': identity,
    'call': identity,
  };
}

export namespace Text {
  export function shift(before: string, after: string): { prefix: number; suffix: number; delta: number } {
    let prefix = 0;
    while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
    let suffix = 0;
    while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
    return { prefix, suffix, delta: after.length - before.length };
  }

  export class Node extends Global.Node {

    static string(string: string) {
      const src = new Text.Source(); src.value = string;
      const node = new Text.Node(src);
      node.end = src.value.length - 1;
      return node; 
    }

    constructor(public source: Text.Source) { super(); }

    expression: Node
    begin_expression() {
      const expressions = this.source.expressions;
      let expression = expressions.get(this.cursor);
      if (!expression) expressions.set(this.cursor, expression = this.span(this.cursor, this.cursor));
      this.expression = expression;
    }
    end_expression() {
      this.expression.end = Math.max(this.expression.begin, this.cursor - 1);
    }

    cursor: number = 0;
    until?: number;
    selection: number[] = [];

    color?: string
    style?: string | (() => string | undefined)
    of?: string
    by?: string
    defines?: string | (() => string | undefined)
    head?: boolean

    span(begin: number, end: number) {
      const span = new Node(this.source);
      span.cursor = begin;
      span.selection = [begin, end];
      span.expression = this.expression;
      return span;
    }

    direction: -1 | 1 = 1
    get limit() { return this.until ?? this.source.value.length; }
    done() { return this.cursor >= this.limit; }
    peek(offset: number = 0) { const i = this.cursor + offset * this.direction; return i >= 0 && i < this.limit ? this.source.value[i] : undefined; }
    advance(n: number = 1) { this.cursor += n * this.direction; }
    at(literal: string) { return this.cursor + literal.length <= this.limit && this.source.value.startsWith(literal, this.cursor); }
    bounded(begin: number, until: number) {
      const cursor = this.copy();
      cursor.cursor = begin; cursor.until = until; cursor.selection = [];
      return cursor;
    }

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

    copy() {
      const copy = new Node(this.source);
      copy.cursor = this.cursor;
      copy.until = this.until;
      copy.expression = this.expression;
      copy.selection = [...this.selection];
      copy.color = this.color;
      copy.direction = this.direction;
      return copy;
    }
  }
  export class Source extends Global.Source {
    private _value: string; get value(): string { if (this._value === undefined) { throw new Error(`Source '${this.location ?? ''}' not loaded — call 'await source.load()' first.`); } return this._value; }
    set value(value: string) { this._value = value; this.expressions = new Map(); this._newlines = undefined; }
    get text(): string { return this.value; }
    get loaded(): boolean { return this._value !== undefined; }

    async load(): Promise<void> {
      if (this._value !== undefined) return;
      if (!this.location) throw new Error('Source has neither value nor location.');

      await this.reload();
    }
    async reload(): Promise<void> {
      this.value = env.nodejs
        ? await env.fs.promises.readFile(this.location, 'utf-8')
        : await (await fetch(new URL(this.location))).text()
      this.expressions = new Map();
      this._newlines = undefined;
    }

    expressions: Map<number, Node> = new Map();

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
  at?: Text.Node;
  message: string;
}

const c = {
  reset:     '\x1b[0m',
  gray:      '\x1b[90m',
  dark_gray: '\x1b[2;90m',
}
const ansi = (hex: string, bold: boolean = false): string => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `\x1b[${bold ? '1;' : ''}38;2;${r};${g};${b}m`;
};
const theme: Record<string, string> = { namespace: '\x1b[38;2;154;134;253m', type: '\x1b[38;2;154;134;253m', class: '\x1b[38;2;154;134;253m', enum: '\x1b[38;2;154;134;253m', interface: '\x1b[38;2;154;134;253m', struct: '\x1b[38;2;154;134;253m', typeParameter: '\x1b[38;2;154;134;253m', parameter: '\x1b[38;2;196;185;254m', variable: '\x1b[38;2;196;185;254m', property: '\x1b[38;2;196;185;254m', enumMember: '\x1b[38;2;255;204;153m', event: '\x1b[38;2;154;134;253m', function: '\x1b[38;2;154;134;253m', method: '\x1b[38;2;154;134;253m', macro: '\x1b[38;2;154;134;253m', keyword: '\x1b[38;2;108;103;131m', modifier: '\x1b[38;2;108;103;131m', comment: '\x1b[38;2;108;103;131m', string: '\x1b[38;2;255;204;153m', number: '\x1b[38;2;255;204;153m', regexp: '\x1b[38;2;255;204;153m', operator: '\x1b[38;2;171;179;191m', decorator: '\x1b[38;2;255;204;153m' };

export const DIAGNOSTIC_SEVERITY: Record<Diagnostic['level'], number> = { trace: 0, debug: 1, info: 2, warning: 3, error: 4, fatal: 5 };
export class Diagnostics {
  items: Map</*location:*/ Text.Source | undefined, Map<Text.Node | undefined, Diagnostic[]>> = new Map();

  program?: Ray.Program

  private start = performance.now();

  constructor(public level: Diagnostic['level'] = 'info') {}

  *all(filter?: (x: Diagnostic) => boolean): IterableIterator<Diagnostic> {
    for (const arr of this.items.values()) { for (const [, elements] of arr) { for (const element of elements) { if (filter ? filter(element) : true) yield element; } } }
  }
  *get(src: Text.Source): IterableIterator<Diagnostic> { for (const arr of this.items.get(src).values()) { yield* arr; } }
  *of(src: Text.Source): IterableIterator<Diagnostic> {
    for (const [key, arr] of this.items) { if (key !== src && key?.location !== src.location) continue; for (const [, elements] of arr) yield* elements; }
  }

  is_visible(level: Diagnostic['level']): boolean { return DIAGNOSTIC_SEVERITY[level] >= DIAGNOSTIC_SEVERITY[this.level]; }

  get empty() { return [...this.items.keys()].length === 0 }
  get has_errors(): boolean { return [...this.errors].length > 0 }
  get errors() { return this.all(x => DIAGNOSTIC_SEVERITY[x.level] >= DIAGNOSTIC_SEVERITY['error'])}
  get warnings() { return this.all(x => x.level === 'warning')}

  forget(src: Text.Source | Iterable<Text.Source>) {
    if (Symbol.iterator in src) { for (const element of src) { this.forget(element) }; return; }
    for (const key of [...this.items.keys()]) if (key === src || key?.location === src.location) this.items.delete(key);
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
      if (header) console.error(`${this.color('info')}${header}${c.reset}`);
      for (const src of srcs) if (src !== undefined) this.print_lines_of(src);
    }

    let first = true;
    for (const [header, entries] of group(this.all(), e => header_of(e.node?.source))) {
      if (!first) console.error('');
      if (header) console.error(`${this.color('info')}${header}${c.reset}`);
      first = false;
      for (const entry of entries) this.print_diagnostic(entry);
    }

    const parts: string[] = []
    const count = (level: Diagnostic['level'], entries: Iterable<Diagnostic>) => { const count = [...entries].length; if (count !== 0) parts.push(`${this.color(level)}${count} ${level}${count > 1 ? 's' : ''}${c.reset}`); }
    
    count('error', this.errors); count('warning', this.warnings)
    parts.push(`${c.gray}${exec_time.toFixed(2)}ms${c.reset} ${c.dark_gray}+ ${(performance.now() - print_start).toFixed(2)}ms print${c.reset}`)
    console.error(`\n  ${parts.join(`${c.gray}, ${c.reset}`)}`)
  }
  print_lines_of(src: Text.Source) {
    console.error(`${c.gray}${src.location ? src.location : `unknown location`}${c.reset}`);

    let entry_i = 0;
    const entries = [...this.get(src)].filter(x => x.node).sort((a, b) => a.node.cursor - b.node.cursor)

    const line_number_width = String(src.newlines.length + 1).length;
    const painted = this.program?.painted(src) ?? [];
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
          worst.node.color = this.color(worst.level);
          return worst.node.segments;
        });
        const text = line.string;
        const chars: (string | undefined)[] = new Array(text.length).fill(undefined);
        const coat = painted.filter(s => s.end >= line.begin && s.begin <= line.end).sort((a, b) => (b.end - b.begin) - (a.end - a.begin));
        for (const s of coat) {
          const hex = s.color;
          if (!hex) continue;
          for (let k = Math.max(s.begin - line.begin, 0); k <= Math.min(s.end - line.begin, text.length - 1); k++) chars[k] = ansi(hex);
        }
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

  format(entry: Diagnostic): string { return `${this.color(entry.level)}${entry.level}${c.reset} ${this.message(entry)}${c.gray} [${env.version.toString()}]${c.reset}`; }

  message(entry: Diagnostic): string {
    if (!entry.at) return entry.message;
    const at = this.current(entry.at);
    return `${entry.message} (in ${at.source.name}:${at.line}:${at.col})`;
  }
  current(node: Text.Node): Text.Node {
    const source = this.program?.sources.find(src => src.location === node.source.location);
    if (!source || source === node.source) return node;
    const before = node.source.value;
    const { prefix, suffix, delta } = Text.shift(before, source.value);
    const begin = node.begin < prefix ? node.begin : node.begin >= before.length - suffix ? node.begin + delta : node.begin;
    return new Text.Node(source).span(begin, begin);
  }

  private silent = 0;
  muted<T>(fn: () => T): T { this.silent++; try { return fn(); } finally { this.silent--; } }

  report(entry: Diagnostic) {
    if (this.silent > 0 || !this.is_visible(entry.level)) return;
    
    const source = entry.node?.source;
    let expr = this.items.get(source);
    if (!expr) { expr = new Map(); this.items.set(source, expr); }
    let expr_diagnostics = expr.get(entry.node?.expression)
    if (!expr_diagnostics) { expr_diagnostics = []; expr.set(entry.node?.expression, expr_diagnostics); }

    // The same complaint about the same place is only worth making once
    if (expr_diagnostics.some(x => x.level === entry.level && x.message === entry.message && x.node?.begin === entry.node?.begin)) return;

    expr_diagnostics.push(entry);
    
    if (entry.level === 'fatal') return this.exit();
  }

  exit(): never {
    this.print();
    if (env.nodejs) return process.exit(1);
    throw new Error('fatal diagnostic');
  }

  static STYLES: Record<Diagnostic['level'], string[]> = { fatal: ['fatal'], error: ['error'], warning: ['warn', 'warning'], info: ['info'], debug: ['debug'], trace: ['trace'] };
  color(level: Diagnostic['level']): string {
    const hex = Diagnostics.STYLES[level].map(style => this.program?.color(style)).find(Boolean);
    return hex ? ansi(hex, level === 'fatal' || level === 'error' || level === 'warning') : Diagnostics.levelColor[level];
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

  static file(location: string): Text.Source { return new Text.Source(location); }
  static directory(location: string, options: { recursively?: boolean, filter?: (x: string) => boolean }): Text.Source[] {
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
  static at(location: string, options: { recursively?: boolean, filter?: (x: string) => boolean } = {}): Text.Source[] {
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

if (env.is_main_entrypoint) main(env.cli_args(cli));