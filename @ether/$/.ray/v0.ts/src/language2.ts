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

  const source = new Text.Source('@ether/$/.ray/v0/Node.ray');
  await source.load();
  diagnostics.report({ level: 'error', message: 'test', node: new Text.Node(source) })
  const n = new Text.Node(source); n.cursor = 1
  diagnostics.report({ level: 'error', message: 'test ata asdadasd', node: n })
  const n2 = new Text.Node(source); n2.cursor = 2
  diagnostics.report({ level: 'error', message: 'test ata asdasd ', node: n2 })
  const source2 = new Text.Source('@ether/$/.ray/tests/test-project/test.ray');
  await source2.load();
  const n3 = new Text.Node(source2); n3.cursor = 4
  diagnostics.report({ level: 'error', message: 'test aaaaaaa aaaaa aaaaa aa aa aaaaaaaaaaa aaaaaaa aaaaaaaaaaaaaaaaa aaaaaaaaaaaa aaaaaaaaaaaaaaaaaaaaaaaaa', node: n3 })
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
    get is_dot_project() { return this.location.endsWith(`/.project${Ray.EXTENSION}`); }
  }
}
export type Node = Global.Node;
export type Source = Global.Source;

namespace Ray {
  export const EXTENSION = '.ray'

  export function v0(diagnostics: Diagnostics) {
    return new Program(diagnostics)
      .add(env.directory(`@ether/$/${EXTENSION}/v0`, { recursively: true, filter: x => x.endsWith(EXTENSION) }))
      .add(env.directory(`@ether/$/${EXTENSION}/tests`, { recursively: true, filter: x => x.endsWith(EXTENSION) }));
  }

  export class Project {
    source: Text.Source[] = []
    dependencies: Project[] = []

    interpreters: Map<Project, Interpreter> = new Map();

    filled_defaults: boolean = false;

    constructor(private program: Program, public dot_project: Text.Source, interpreter: Interpreter) { this.interpreters.set(this, interpreter); }
    get directory(): string { return this.dot_project.dir; }

    get is_language() { return this.dot_project.line(0).string.includes('!language'); }
    
    get interpreter() { return this.interpreters.get(this); }
    get dependants() { return this.interpreters.keys().filter(x => x !== this); }

    interpret() { this.interpreter.interpret(this.source) }

    depend_on(project: Project) {
      if (this === project) return;
      this.dependencies.push(project);
      project.interpreters.set(this, this.interpreter.copy())
    }

    load(): Promise<void>[] { return [this.dot_project, ...this.source].map(x => x.load()) }
  }

  export class Program {

    projects: Project[] = []
    default_language: Project

    constructor(public diagnostics: Diagnostics) { diagnostics.program = this; }

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

      this.projects.forEach(project => project.interpret())

      return this.default_language?.interpreter.GLOBAL!;
    }
    async reload(next: Text.Source | Node | Iterable<Text.Source | Node>): Promise<Node> {
      const srcs: Text.Source[] = (next instanceof Node || !((next as any)?.[Symbol.iterator])) ? [next as Text.Source] : [...(next as Iterable<Text.Source | Node>)].map(item => item instanceof Node ? item.position.source : item);
      this.add(srcs);

      await Promise.all(srcs.map(x => x.reload()));
      this.fill_default_dependencies();

      for (const [project, list] of Map.groupBy(srcs, this.project_of).entries()) { project.interpreter.interpret(list); }

      return this.default_language?.interpreter.GLOBAL!;
    }

    EXTERNALS: { [method: string]: Method } = {
      '=': ({args}) => args,
      '**': ({args}) => args,
      'left-to-right': ({args}) => args,
      'right-to-left': ({args}) => args,
      '</': ({args}) => args,
      'get': ({args}) => args,
      'call': ({args}) => args,
      //TODO CONSTRUCTOR MAYBE.
    }
    fill_default_dependencies() {
      this.default_language = this.projects.find(project => project.is_language);
      if (!this.default_language) return this.diagnostics.report({ level: 'fatal', message: "Expected to have recognized the string !language (the project defining the default language) on the first line in a .project.ray file, but it wasn't provided." });

      if (!this.default_language.filled_defaults) {
        const { GLOBAL } = this.default_language.interpreter;

        GLOBAL.method('external', (o) => {
          const EXTERNAL = o.args.position.string;
          if (EXTERNAL in this.EXTERNALS) return this.EXTERNALS[EXTERNAL](o); 
          return o.args.error(`Expected method \`${EXTERNAL}\` to be externally defined by the runtime, but it wasn't.`);
        })
      }

      // All projects depend on the default language.
      this.projects.filter(x => x.dependencies.length === 0).forEach(x => x.depend_on(this.default_language));
    }

  }

  export type Key = string | Node
  export type Args = { interpreter: Interpreter; self: Node; method: Node; args: Node; at: Node }
  export type Method = (args: Args) => Node | undefined;

  export class Node {
    methods?: Map<Key, Node>
    position: Text.Node

    fn?: Method

    constructor(public diagnostics: Diagnostics, public _super?: Node) {}

    method(string: String, fn: Method) {
      //TODO check if string is a pattern.
      (this.methods ??= new Map()).set(string, fn);
    }

    fatal(message: string) { return this.diagnostics.report({ level: 'fatal', message, node: this.position }) }
    error(message: string) { return this.diagnostics.report({ level: 'error', message, node: this.position }) }
    warning(message: string) { return this.diagnostics.report({ level: 'warning', message, node: this.position }) }
    info(message: string) { return this.diagnostics.report({ level: 'info', message, node: this.position }) }
    debug(message: string) { return this.diagnostics.report({ level: 'debug', message, node: this.position }) }
    trace(message: string) { return this.diagnostics.report({ level: 'trace', message, node: this.position }) }

    clone(seen: Map<Node, Node> = new Map()): Node {
      const existing = seen.get(this); if (existing) return existing;
      const copy: Node = Object.create(Object.getPrototypeOf(this));
      seen.set(this, copy);
      copy._super = this._super?.clone(seen);
      copy.position = this.position;
      copy.fn = this.fn;
      if (this.methods) {
        copy.methods = new Map();
        for (const [key, value] of this.methods)
          copy.methods.set(key instanceof Node ? key.clone(seen) : key, value.clone(seen));
      }
      return copy;
    }
  }

  export class Rule extends Node {

  }

  export class Interpreter {
    constructor(public diagnostics: Diagnostics, public copy_of?: Interpreter) {
      this.GLOBAL = new Node(this.diagnostics)
    }

    GLOBAL: Node

    refresh() {
      if (!this.copy_of) return;
      const seen = new Map<Node, Node>();
      this.GLOBAL = this.copy_of.GLOBAL.clone(seen);
    }

    copy(): Interpreter { return new Interpreter(this.diagnostics, this); }

    interpret(srcs: Text.Source[]) {
      srcs.forEach((src) => this._interpret(src))
      this.analyze();
    }
    private _interpret(src: Text.Source) {
      this.diagnostics.forget(src);

      function array<T>(step: (cursor: Text.Node) => T | undefined, cursor: Text.Node = new Text.Node(src)): T[] {
        const items: T[] = []
        while(!cursor.done()) {
          const statement = step(cursor);
          if (statement) items.push(statement)
        }
        return items;
      }
      function expr(cursor: Text.Node): Node | undefined {
        // Skip leading whitespace.
        while(!cursor.done() && (cursor.peek() === ' ' || cursor.peek() === '\n')) cursor.advance();
        if (cursor.done()) return undefined;

        let pointer: Node;

        cursor.begin_expression();

        while (!cursor.done() && cursor.peek() !== '\n') {  
          // LTR/RTL: Done through Program pattern matching
          // Precedence: Done through Program pattern matching

          // Highlighting
          // Grammar rules - Type resolving. Allow arbitary whitespace in between pieces.
          // Resolve expr up to precedence level.
          
          // Expression[] if surrounded by literals.
        }

        cursor.end_expression();
        return pointer;
      }

      return array(expr);
    }
    
    analyze() {

    }
  }
}

namespace Text {
  export class Node extends Global.Node {
    constructor(public source: Text.Source) { super(); }

    expression: Node
    begin_expression() {
      this.expression = new Node(this.source); this.expression.begin = this.begin;
    }
    end_expression() {
      this.expression.end = this.end;
    }

    cursor: number = 0;
    selection: number[] = [];

    color?: string

    span(begin: number, end: number) {
      const span = new Node(this.source);
      span.begin = begin; span.end = end;
      return span;
    }

    direction: -1 | 1 = 1
    get flip() { this.direction *= -1; return this; }
    get head() { return this.direction === 1 ? this.begin : this.end - 1; }
    get behind() { return this.copy().flip; }
    peek(length: number = 1) { return this.source.value[this.head + length * this.direction] }
    advance() { this.direction === 1 ? this.end += 1 : this.begin -= 1; }

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
      copy.expression = this.expression;
      copy.selection = [...this.selection];
      copy.color = this.color;
      copy.direction = this.direction;
      return copy;
    }
  }
  export class Source extends Global.Source {
    private _value: string; get value(): string { if (this._value === undefined) { throw new Error(`Source '${this.location ?? ''}' not loaded — call 'await source.load()' first.`); } return this._value; }
    set value(value: string) { this._value = value; }

    async load(): Promise<void> {
      if (this._value !== undefined) return;
      if (!this.location) throw new Error('Source has neither value nor location.');

      await this.reload();
    }
    async reload(): Promise<void> {
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
  items: Map</*location:*/ Text.Source | undefined, Map<Text.Node | undefined, Diagnostic[]>> = new Map();

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

  report(entry: Diagnostic) {
    if (!this.is_visible(entry.level)) return;
    
    const source = entry.node?.source;
    let expr = this.items.get(source);
    if (!expr) { expr = new Map(); this.items.set(source, expr); }
    let expr_diagnostics = expr.get(entry.node?.expression)
    if (!expr_diagnostics) { expr_diagnostics = []; expr.set(entry.node?.expression, expr_diagnostics); }

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

if (env.is_main_entrypoint) await main(env.cli_args(cli));