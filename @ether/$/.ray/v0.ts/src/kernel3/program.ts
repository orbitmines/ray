import { Text, EXTENSION, type Source } from './text.ts';
import { Natives } from './natives.ts';
import { env } from './env.ts';
import { Diagnostics } from './diagnostics.ts';
import { Interpreter, Node, type Piece, type Native } from './interpreter.ts';
import { Accelerated } from './accelerate.ts';


export function v0(diagnostics: Diagnostics) {
  return new Program(diagnostics)
    .add(env.directory(`@ether/$/${EXTENSION}/v0`, { recursively: true, filter: x => x.endsWith(EXTENSION) }))
    .add(env.directory(`@ether/$/${EXTENSION}/tests`, { recursively: true, filter: x => x.endsWith(EXTENSION) }))
    .interpreting(optimizations());
}

export function lsp(diagnostics: Diagnostics) {
  return new Program(diagnostics)
    .serve()
    .add(env.directory(`@ether/$/${EXTENSION}/v0`, { recursively: true, filter: x => x.endsWith(EXTENSION) }))
    .interpreting(optimizations());
}

export function optimizations(): Text.Source[] {
  for (const name of ['core.o', 'v0.ts.o']) {
    const location = `@ether/$/${EXTENSION}/v0.ts/${name}${EXTENSION}`;
    if (env.nodejs && env.fs.existsSync(env.path.join(env.root, location))) return env.at(location);
  }
  return [];
}

export class Project {
  source: Text.Source[] = []
  dependencies: Project[] = []
  layered: Project[] = []

  interpreters: Map<Project, Interpreter> = new Map();

  constructor(private program: Program, public dot_project: Text.Source, interpreter: Interpreter) { this.interpreters.set(this, interpreter); }
  get directory(): string { return this.dot_project.dir; }

  get is_language() { return this.dot_project.line(0).string.includes('!language'); }
  
  get interpreter() { return this.interpreters.get(this); }

  get entrypoints(): Text.Source[] { return this.source.filter(x => x.dir === this.directory && this.program.entrypoint(x)); }
  get order(): Text.Source[] {
    const entrypoints = this.entrypoints;
    return [...this.layered.flatMap(project => project.order), ...entrypoints, ...this.source.filter(x => !x.is_dot_project && !x.is_entrypoint && !entrypoints.includes(x)), ...this.interpreted];
  }
  get interpreted(): Text.Source[] { return this.program.default_language === this ? this.program.interpreted : []; }
  get declared(): string[] {
    const { path } = env;
    return this.dot_project.value.split('\n').filter(line => line.trimStart().startsWith('@')).flatMap(line => line.trim().split(/\s+/)).filter(word => word.startsWith('@') && word.length > 1).map(word => {
      const spelled = word.slice(1);
      if (spelled.startsWith('/')) return path.normalize(spelled);
      if (spelled.startsWith('./') || spelled.startsWith('../')) return path.normalize(path.join(this.directory, spelled));
      return path.normalize(path.join(env.root, word));
    });
  }

  private claim_sources() {
    const mine = new Set<string>([this.dot_project, ...this.source, ...this.interpreted].map(src => src.location));
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
    const visit = (project: Project) => { if (out.includes(project)) return; project.dependencies.forEach(visit); project.layered.forEach(visit); out.push(project); };
    this.projects.forEach(visit);
    return out;
  }

  project_at(directory: string): Project | undefined {
    const { path } = env;
    const wanted = path.resolve(env.root, directory);
    return this.projects.find(project => path.resolve(env.root, project.directory) === wanted);
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

  interpreted: Text.Source[] = [];
  interpreting(srcs: Text.Source[]): this { this.interpreted.push(...srcs); return this; }
  by_interpreter(src: Text.Source): boolean { return this.interpreted.some(x => x.location === src.location); }

  serving: boolean = false;
  serve(serving?: boolean): this { this.serving = serving ?? true; return this; }

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
        const interpreter = new Accelerated(this.diagnostics);
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
    await Promise.all([...this.projects.flatMap(project => project.load()), ...this.interpreted.map(src => src.load())]);
    for (let round = 0; round < 16; round++) {
      const missing = [...new Set(this.projects.flatMap(project => project.declared))].filter(directory => this.project_at(directory) === undefined && env.fs.existsSync(directory));
      if (missing.length === 0) break;
      for (const directory of missing) this.add(env.directory(directory, { recursively: true, filter: x => x.endsWith(EXTENSION) }));
      await Promise.all(this.projects.flatMap(project => project.load()));
    }
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
            pattern: { text: at.string }, style: project.interpreter?.style_of(impl),
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
    const languages = this.projects.filter(project => project.is_language);
    const enclosing = (project: Project): Project | undefined => {
      let best: Project | undefined;
      for (const language of languages)
        if (language !== project && project.directory.startsWith(`${language.directory}/`) && (best === undefined || language.directory.length > best.directory.length)) best = language;
      return best;
    };
    const filling = new Set<Project>();
    const fill = (x: Project) => {
      if (filling.has(x) || x.dependencies.length > 0) return;
      filling.add(x);
      const declared: Project[] = [];
      for (const directory of x.declared) {
        const found = this.project_at(directory);
        if (found === undefined) this.diagnostics.report({ level: 'error', message: `Expected a project at \`${directory}\`, which \`${x.dot_project.location}\` depends on, but there is none.` });
        else if (found !== x && !declared.includes(found)) declared.push(found);
      }
      if (declared.length > 0) { declared.forEach(fill); x.depend_on(declared[0]); x.layered = declared.slice(1); return; }
      const language = enclosing(x) ?? (x.is_language ? undefined : this.default_language);
      if (language) { fill(language); x.depend_on(language); }
    };
    this.projects.forEach(fill);
    for (const project of this.projects) project.interpreter.program = this;
  }

}

export const SEMANTIC_TOKEN_TYPES = ['namespace', 'type', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'parameter', 'variable', 'property', 'enumMember', 'event', 'function', 'method', 'macro', 'keyword', 'modifier', 'comment', 'string', 'number', 'regexp', 'operator', 'decorator'];

export type RuleInfo = {
  key: string; exists: boolean; disabled: boolean; pieces: Piece[];
  pattern: { text: string }; style?: string; body?: { empty: boolean; text: string };
  definitions: { at: { src: Text.Source; begin: number; end: number }; seen: 'live' }[];
}
