/**
 * Expression runtime (dependency-free TypeScript)
 *
 * - `dynamic(...)` tracks the Signals/ReactiveMaps read during evaluation and
 *   re-runs only when one of those dependencies changes.
 * - `Expression.compile(...)` parses statements using the longest matching rule
 *   and builds an IR whose only opcode is JMP.
 * - Every rule execution and dynamic invalidation passes through the injected
 *   ConcurrentScheduler, so it can be adapted to an application's scheduler.
 * - `parseLanguageDefinition(...)` bootstraps a rule format such as:
 *       !language { } {LHS} => {RHS}
 *
 * RHS semantics are deliberately supplied as TypeScript callbacks (or, by
 * default, interpreted as nested statements). This avoids eval/new Function.
 */

export type Unsubscribe = () => void;
export type Listener = () => void;

export interface ConcurrentScheduler {
  /** Schedule work in the host's concurrency/change-processing system. */
  schedule<T>(work: () => T | Promise<T>): Promise<T>;
}

/** Default adapter. Replace with your existing `concurrently` scheduler. */
export const immediateScheduler: ConcurrentScheduler = {
  schedule<T>(work: () => T | Promise<T>): Promise<T> {
    try {
      return Promise.resolve(work());
    } catch (error) {
      return Promise.reject(error);
    }
  },
};

interface Trackable {
  subscribe(listener: Listener): Unsubscribe;
}

interface DependencyCollector {
  dependOn(dependency: Trackable): void;
}

let activeCollector: DependencyCollector | undefined;

/** Mutable reactive cell. Reads made inside `dynamic` become dependencies. */
export class Signal<T> implements Trackable {
  #value: T;
  #listeners = new Set<Listener>();

  constructor(value: T) {
    this.#value = value;
  }

  get value(): T {
    activeCollector?.dependOn(this);
    return this.#value;
  }

  set value(next: T) {
    if (Object.is(this.#value, next)) return;
    this.#value = next;
    for (const listener of [...this.#listeners]) listener();
  }

  update(update: (current: T) => T): T {
    this.value = update(this.#value);
    return this.#value;
  }

  subscribe(listener: Listener): Unsubscribe {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

/**
 * A tracked computation. On each evaluation its dependency list is replaced
 * with the Signals/Computed values actually read by that evaluation.
 */
export class Dynamic<T> implements Trackable, DependencyCollector {
  #compute: () => T;
  #scheduler: ConcurrentScheduler;
  #dependencies = new Map<Trackable, Unsubscribe>();
  #listeners = new Set<Listener>();
  #value!: T;
  #hasValue = false;
  #error: unknown;
  #hasError = false;
  #queued = false;
  #disposed = false;

  constructor(compute: () => T, scheduler: ConcurrentScheduler = immediateScheduler) {
    this.#compute = compute;
    this.#scheduler = scheduler;
    this.#recompute(false);
  }

  get value(): T {
    activeCollector?.dependOn(this);
    if (this.#hasError) throw this.#error;
    return this.#value;
  }

  subscribe(listener: Listener): Unsubscribe {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Used internally by the current computation to collect dependencies. */
  dependOn(dependency: Trackable): void {
    if (!this.#nextDependencies) return;
    this.#nextDependencies.add(dependency);
  }

  #nextDependencies?: Set<Trackable>;

  dispose(): void {
    this.#disposed = true;
    for (const unsubscribe of this.#dependencies.values()) unsubscribe();
    this.#dependencies.clear();
    this.#listeners.clear();
  }

  #invalidate = (): void => {
    if (this.#disposed || this.#queued) return;
    this.#queued = true;
    void this.#scheduler.schedule(() => {
      this.#queued = false;
      if (!this.#disposed) this.#recompute(true);
    }).catch((error: unknown) => {
      // Preserve errors for the next .value read instead of creating an
      // unhandled rejection from a background reactive invalidation.
      this.#error = error;
      this.#hasError = true;
      for (const listener of [...this.#listeners]) listener();
    });
  };

  #recompute(notify: boolean): void {
    const nextDependencies = new Set<Trackable>();
    const previousCollector = activeCollector;
    this.#nextDependencies = nextDependencies;
    activeCollector = this;

    let nextValue!: T;
    let nextError: unknown;
    let failed = false;
    try {
      nextValue = this.#compute();
    } catch (error) {
      failed = true;
      nextError = error;
    } finally {
      activeCollector = previousCollector;
      this.#nextDependencies = undefined;
    }

    for (const [dependency, unsubscribe] of this.#dependencies) {
      if (!nextDependencies.has(dependency)) {
        unsubscribe();
        this.#dependencies.delete(dependency);
      }
    }
    for (const dependency of nextDependencies) {
      if (!this.#dependencies.has(dependency)) {
        this.#dependencies.set(dependency, dependency.subscribe(this.#invalidate));
      }
    }

    const changed = failed
      ? !this.#hasError || this.#error !== nextError || this.#hasValue
      : !this.#hasValue || this.#hasError || !Object.is(this.#value, nextValue);

    if (failed) {
      this.#error = nextError;
      this.#hasError = true;
    } else {
      this.#value = nextValue;
      this.#hasValue = true;
      this.#hasError = false;
      this.#error = undefined;
    }

    if (notify && changed) {
      for (const listener of [...this.#listeners]) listener();
    }

    // Initial evaluation should fail synchronously, so invalid syntax is not
    // silently hidden until some later .value access.
    if (!notify && failed) throw nextError;
  }
}

export function dynamic<T>(
  compute: () => T,
  scheduler: ConcurrentScheduler = immediateScheduler,
): Dynamic<T> {
  return new Dynamic(compute, scheduler);
}

/** A small reactive Map. Any read depends on its map snapshot; writes replace it. */
export class ReactiveMap<K, V> {
  #snapshot: Signal<Map<K, V>>;

  constructor(entries?: Iterable<readonly [K, V]>) {
    this.#snapshot = new Signal(new Map(entries));
  }

  get size(): number {
    return this.#snapshot.value.size;
  }

  get(key: K): V | undefined {
    return this.#snapshot.value.get(key);
  }

  has(key: K): boolean {
    return this.#snapshot.value.has(key);
  }

  set(key: K, value: V): this {
    const next = new Map(this.#snapshot.value);
    next.set(key, value);
    this.#snapshot.value = next;
    return this;
  }

  delete(key: K): boolean {
    const old = this.#snapshot.value;
    if (!old.has(key)) return false;
    const next = new Map(old);
    next.delete(key);
    this.#snapshot.value = next;
    return true;
  }

  clear(): void {
    if (this.#snapshot.value.size > 0) this.#snapshot.value = new Map();
  }

  keys(): IterableIterator<K> {
    return this.#snapshot.value.keys();
  }

  values(): IterableIterator<V> {
    return this.#snapshot.value.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.#snapshot.value.entries();
  }

  /** Snapshot reads still register this map as a dependency. */
  snapshot(): ReadonlyMap<K, V> {
    return this.#snapshot.value;
  }
}

export interface CaptureSyntax {
  open: string;
  close: string;
  flexibleWhitespace?: boolean;
}

export const defaultCaptureSyntax: CaptureSyntax = {
  open: "{",
  close: "}",
  flexibleWhitespace: true,
};

export interface RuleMatch {
  /** Number of input characters consumed. Must be greater than zero. */
  length: number;
  captures: Record<string, string>;
  text: string;
}

export type RuleMatcher = (source: string, offset: number) => RuleMatch | null;

export interface RuleControl {
  type: "label" | "goto";
  labelCapture: string;
  conditionCapture?: string;
}

export interface ExpressionRule {
  /** The syntax key. The longest key wins when multiple rules match. */
  key: string;
  matcher?: RuleMatcher;
  run?: (context: ExecutionContext, statement: ParsedStatement) => unknown | Promise<unknown>;
  control?: RuleControl;
  description?: string;
}

export interface ParsedStatement {
  rule: ExpressionRule;
  captures: Record<string, string>;
  text: string;
  start: number;
  end: number;
}

/**
 * Match a template like `external {rule} {args}` at `offset`.
 * Literal whitespace in the template matches one-or-more input whitespace.
 * Captures end at the next literal anchor; a final capture ends at the line end.
 */
export function createTemplateMatcher(
  template: string,
  syntax: CaptureSyntax = defaultCaptureSyntax,
): RuleMatcher {
  const { open, close } = syntax;
  if (!open || !close) throw new Error("Capture delimiters must not be empty.");

  const captureNames: string[] = [];
  let pattern = "^";
  let cursor = 0;

  while (cursor < template.length) {
    if (template.startsWith(open, cursor)) {
      const closeAt = template.indexOf(close, cursor + open.length);
      if (closeAt >= 0) {
        const name = template.slice(cursor + open.length, closeAt).trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) {
          captureNames.push(name);
          const isLast = template.indexOf(open, closeAt + close.length) < 0;
          pattern += isLast ? "([^\\n]*)" : "([^\\n]*?)";
          cursor = closeAt + close.length;
          continue;
        }
      }
    }

    const nextOpen = template.indexOf(open, cursor);
    if (nextOpen === cursor) {
      // An opening delimiter that is not a valid capture name is literal text.
      pattern += escapeRegex(open);
      cursor += open.length;
      continue;
    }
    const end = nextOpen < 0 ? template.length : nextOpen;
    const literal = template.slice(cursor, end);
    if (syntax.flexibleWhitespace !== false) {
      pattern += literal
        .split(/(\s+)/)
        .filter((part) => part.length > 0)
        .map((part) => /^\s+$/.test(part) ? "\\s+" : escapeRegex(part))
        .join("");
    } else {
      pattern += escapeRegex(literal);
    }
    cursor = end;
  }

  const regex = new RegExp(pattern);
  return (source, offset) => {
    const match = regex.exec(source.slice(offset));
    if (!match || match[0].length === 0) return null;
    const captures: Record<string, string> = Object.create(null) as Record<string, string>;
    captureNames.forEach((name, index) => {
      // Repeated capture names use the last value, matching map-like capture semantics.
      captures[name] = match[index + 1] ?? "";
    });
    return { length: match[0].length, captures, text: match[0] };
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class Node {
  readonly rules = new ReactiveMap<string, ExpressionRule>();
  readonly values = new ReactiveMap<string, unknown>();

  constructor(rules?: Iterable<ExpressionRule>) {
    if (rules) for (const rule of rules) this.addRule(rule);
  }

  addRule(rule: ExpressionRule): this {
    this.rules.set(rule.key, rule);
    return this;
  }

  removeRule(key: string): boolean {
    return this.rules.delete(key);
  }
}

export class Program {
  constructor(public caller?: Program) {}
}

export interface ExpressionOptions {
  scheduler?: ConcurrentScheduler;
  captureSyntax?: CaptureSyntax;
  externals?: Record<string, ExternalFunction>;
  /** Override how `goto ... if ...` conditions are evaluated. */
  evaluateCondition?: (source: string, context: ExecutionContext) => unknown | Promise<unknown>;
  /** Override how argument text is turned into values for external functions. */
  parseExternalArgs?: (source: string, context: ExecutionContext) => unknown[];
  maxSteps?: number;
}

export type ExternalFunction = (
  context: ExecutionContext,
  args: readonly unknown[],
) => unknown | Promise<unknown>;

export interface JMPInstruction {
  op: "JMP";
  /** Destination for an unconditional jump or the normal fallthrough. */
  target: number;
  /** Normal fallthrough, used by conditional JMP. */
  next: number;
  statement: ParsedStatement;
  rule: ExpressionRule;
  condition?: string;
}

export interface JMPProgram {
  readonly instructions: readonly JMPInstruction[];
  readonly labels: ReadonlyMap<string, number>;
}

export interface CompileOptions {
  /** Called while compiling/parsing; reads here become dynamic dependencies. */
  dependOn?: () => unknown;
}

export interface RunOptions {
  node?: Node;
  caller?: Program;
  variables?: ReactiveMap<string, unknown>;
  maxSteps?: number;
}

export class ExecutionContext {
  readonly variables: ReactiveMap<string, unknown>;
  readonly labels: ReadonlyMap<string, number>;
  lastValue: unknown;
  pc = 0;

  constructor(
    readonly expression: Expression,
    public node: Node,
    public program: Program,
    variables: ReactiveMap<string, unknown>,
    labels: ReadonlyMap<string, number>,
  ) {
    this.variables = variables;
    this.labels = labels;
  }

  get caller(): Program | undefined {
    return this.program.caller;
  }

  resolveValue(source: string): unknown {
    const value = source.trim();
    if (this.variables.has(value)) return this.variables.get(value);
    if (this.node.values.has(value)) return this.node.values.get(value);
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null") return null;
    if (value === "undefined") return undefined;
    if (/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return Number(value);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      const inner = value.slice(1, -1);
      return value.startsWith('"') ? safeJsonString(inner) : inner.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    }
    return value;
  }
}

function safeJsonString(inner: string): string {
  try {
    return JSON.parse(`"${inner.replace(/\\/g, "\\\\").replace(/\"/g, '\\"')}"`) as string;
  } catch {
    return inner;
  }
}

export interface LanguageRuleDefinition {
  lhs: string;
  rhs: string;
  line: number;
  text: string;
}

export interface LanguageDefinition {
  header: "!language";
  syntax: CaptureSyntax;
  ruleTemplate: string;
  /** The first rule is retained separately because it defines the grammar rule. */
  grammarRule: LanguageRuleDefinition;
  rules: readonly LanguageRuleDefinition[];
}

/**
 * Extract the separator represented by the literal text between {LHS} and
 * {RHS} in the bootstrap template. The template's capture names are meta-level
 * names; braces inside an actual LHS/RHS remain part of the captured text.
 */
function getRuleTemplateSeparator(template: string, syntax: CaptureSyntax): string {
  const firstOpen = template.indexOf(syntax.open);
  const firstClose = firstOpen < 0
    ? -1
    : template.indexOf(syntax.close, firstOpen + syntax.open.length);
  const secondOpen = firstClose < 0
    ? -1
    : template.indexOf(syntax.open, firstClose + syntax.close.length);
  const secondClose = secondOpen < 0
    ? -1
    : template.indexOf(syntax.close, secondOpen + syntax.open.length);

  if (firstOpen < 0 || firstClose < 0 || secondOpen < 0 || secondClose < 0) {
    throw new SyntaxError(
      `The rule template must contain ${syntax.open}LHS${syntax.close} and ${syntax.open}RHS${syntax.close}.`,
    );
  }

  const lhsName = template.slice(firstOpen + syntax.open.length, firstClose).trim();
  const rhsName = template.slice(secondOpen + syntax.open.length, secondClose).trim();
  const separator = template.slice(firstClose + syntax.close.length, secondOpen).trim();
  if (lhsName !== "LHS" || rhsName !== "RHS" || !separator) {
    throw new SyntaxError(
      `Expected a rule template of the form ${syntax.open}LHS${syntax.close} <separator> ${syntax.open}RHS${syntax.close}.`,
    );
  }
  return separator;
}

/**
 * Find all occurrences of a separator outside balanced braces and quoted text.
 * This lets a pattern such as `{lhs} => {rhs}` remain intact when it appears
 * as the LHS of the bootstrap grammar rule.
 */
function findTopLevelSeparators(source: string, separator: string): number[] {
  const positions: number[] = [];
  let depth = 0;
  let quote: "'" | '"' | "`" | undefined;
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (depth === 0 && source.startsWith(separator, i)) {
      positions.push(i);
      i += separator.length - 1;
      continue;
    }

    if (char === "{") depth++;
    else if (char === "}") depth = Math.max(0, depth - 1);
  }
  return positions;
}

/**
 * Find the matching `}` for an opening `{`, ignoring braces inside quoted
 * strings. This only delimits an opaque RHS block; it does not parse the block's
 * grammar or recursively interpret its contents.
 */
function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  let quote: "'" | '"' | "`" | undefined;
  let escaped = false;

  for (let i = openIndex; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Parse the bootstrap header and definitions after it.
 *
 * Definitions normally have the form `LHS => RHS`. A block-valued rule may
 * instead be written `LHS => { ... }`; its braces are consumed only to find the
 * end of the RHS, while its contents remain opaque text. In particular,
 * `{lhs} => {rhs} => { ... }` becomes a rule whose LHS is `{lhs} => {rhs}` and
 * whose RHS is the body of the block. That prevents the bootstrap parser from
 * incorrectly treating `{rhs} => {` as one greedy single-line RHS.
 */
export function parseLanguageDefinition(source: string): LanguageDefinition {
  const normalized = source.replace(/\r\n?/g, "\n");
  const firstNewline = normalized.indexOf("\n");
  const headerLine = firstNewline < 0 ? normalized : normalized.slice(0, firstNewline);
  const header = /^!language\s+(\S+)\s+(\S+)\s+(.+?)\s*$/.exec(headerLine);
  if (!header) {
    throw new SyntaxError(
      "Expected a first line like `!language { } {LHS} => {RHS}`.",
    );
  }

  const syntax: CaptureSyntax = {
    open: header[1],
    close: header[2],
    flexibleWhitespace: true,
  };
  if (!syntax.open || !syntax.close) {
    throw new SyntaxError("Capture delimiters must not be empty.");
  }

  const ruleTemplate = header[3];
  const separator = getRuleTemplateSeparator(ruleTemplate, syntax);
  const remainder = firstNewline < 0 ? "" : normalized.slice(firstNewline + 1);
  const lines = remainder.split("\n");
  const parsed: LanguageRuleDefinition[] = [];

  let index = 0;
  while (index < lines.length) {
    const rawLine = lines[index];
    if (!rawLine.trim()) {
      index++;
      continue;
    }

    const line = rawLine.trim();
    const separators = findTopLevelSeparators(line, separator);
    if (separators.length === 0) {
      throw new SyntaxError(
        `Line ${index + 2} does not match the bootstrapped rule template: ${rawLine}`,
      );
    }

    // Use the final top-level separator. This matters for the grammar-defining
    // rule, whose LHS itself contains `=>`: `{lhs} => {rhs} => { ... }`.
    const separatorIndex = separators[separators.length - 1];
    const lhs = line.slice(0, separatorIndex).trim();
    const rhsStart = separatorIndex + separator.length;
    const rhsOnLine = line.slice(rhsStart).trim();
    if (!lhs) {
      throw new SyntaxError(`Line ${index + 2} has an empty LHS.`);
    }

    if (rhsOnLine === "{") {
      // The opening brace must be the entire RHS marker on this line. Capture
      // the balanced block as text, rather than parsing its nested contents.
      const blockSource = lines.slice(index).join("\n");
      // Since rhsOnLine is exactly "{", the final opening brace on this line
      // is the start of the opaque block (earlier braces belong to the LHS).
      const blockOpen = rawLine.lastIndexOf("{");
      const blockClose = findMatchingBrace(blockSource, blockOpen);
      if (blockClose < 0) {
        throw new SyntaxError(`Unclosed RHS block beginning on line ${index + 2}.`);
      }

      const consumed = blockSource.slice(0, blockClose + 1);
      const lineCount = consumed.split("\n").length;
      const endLineIndex = index + lineCount - 1;
      const closeColumn = consumed.length - consumed.lastIndexOf("\n") - 1;
      if (lines[endLineIndex].slice(closeColumn + 1).trim()) {
        throw new SyntaxError(
          `Unexpected text after RHS block on line ${endLineIndex + 2}.`,
        );
      }

      let body = blockSource.slice(blockOpen + 1, blockClose);
      body = body.replace(/^\n/, "").replace(/\n[\t ]*$/, "");
      parsed.push({
        lhs,
        rhs: body,
        line: index + 2,
        text: consumed,
      });
      index = endLineIndex + 1;
      continue;
    }

    if (!rhsOnLine) {
      throw new SyntaxError(`Line ${index + 2} has an empty RHS.`);
    }
    parsed.push({
      lhs,
      rhs: rhsOnLine,
      line: index + 2,
      text: rawLine,
    });
    index++;
  }

  if (parsed.length === 0) {
    throw new SyntaxError("The first rule after the header must define the grammar rule.");
  }

  return {
    header: "!language",
    syntax,
    ruleTemplate,
    grammarRule: parsed[0],
    rules: parsed.slice(1),
  };
}

export class Expression {
  readonly global: Node;
  readonly scheduler: ConcurrentScheduler;
  readonly syntax: CaptureSyntax;
  readonly externals: Record<string, ExternalFunction>;
  readonly options: ExpressionOptions;

  constructor(options: ExpressionOptions = {}) {
    this.options = options;
    this.scheduler = options.scheduler ?? immediateScheduler;
    this.syntax = options.captureSyntax ?? defaultCaptureSyntax;
    this.externals = options.externals ?? Object.create(null) as Record<string, ExternalFunction>;
    this.global = new Node();
    this.#installBuiltins(this.global);
  }

  /**
   * Load rule definitions. By default each RHS is interpreted as nested source
   * in the same node; `resolveRule` can replace that behavior with native logic.
   */
  static fromLanguageDefinition(
    source: string,
    options: ExpressionOptions & {
      resolveRule?: (rule: LanguageRuleDefinition, expression: Expression) => ExpressionRule["run"];
      useGrammarRuleAsRuntimeRule?: boolean;
    } = {},
  ): { expression: Expression; definition: LanguageDefinition } {
    const definition = parseLanguageDefinition(source);
    const expression = new Expression({
      ...options,
      captureSyntax: definition.syntax,
    });

    const definitions = options.useGrammarRuleAsRuntimeRule === false
      ? [...definition.rules]
      : [definition.grammarRule, ...definition.rules];

    for (const definitionRule of definitions) {
      const run = options.resolveRule
        ? options.resolveRule(definitionRule, expression)
        : async (context: ExecutionContext, statement: ParsedStatement) => {
            const rhs = interpolateCaptures(
              definitionRule.rhs,
              statement.captures,
              definition.syntax,
            );
            return expression.executeInline(rhs, context.node, context.program, context.variables);
          };
      expression.global.addRule({ key: definitionRule.lhs, run, description: `grammar line ${definitionRule.line}` });
    }
    return { expression, definition };
  }

  addRule(node: Node, rule: ExpressionRule): Node {
    node.addRule(rule);
    return node;
  }

  /**
   * Create a live compilation. Reading `compiled.ir.value` gives the latest IR;
   * edits to source, node rules, or dependencies read by `dependOn` regenerate it.
   */
  compile(
    source: string | Signal<string>,
    node: Node = this.global,
    caller: Program = new Program(),
    options: CompileOptions = {},
  ): CompiledExpression {
    const sourceSignal = typeof source === "string" ? new Signal(source) : source;
    const ast = dynamic(() => {
      options.dependOn?.();
      return this.parseStatements(sourceSignal.value, node);
    }, this.scheduler);
    const ir = dynamic(() => {
      options.dependOn?.();
      return this.lowerToJMP(ast.value);
    }, this.scheduler);
    return new CompiledExpression(this, sourceSignal, node, caller, ast, ir);
  }

  parseStatements(source: string, node: Node = this.global): readonly ParsedStatement[] {
    const rules = [...node.rules.values()]; // Tracks the rule table snapshot.
    const prepared = rules.map((rule, order) => ({
      rule,
      order,
      matcher: rule.matcher ?? createTemplateMatcher(rule.key, this.syntax),
    }));
    const statements: ParsedStatement[] = [];
    let offset = 0;

    while (offset < source.length) {
      while (offset < source.length && /\s/.test(source[offset])) offset++;
      if (offset >= source.length) break;

      const candidates: Array<{ rule: ExpressionRule; order: number; match: RuleMatch }> = [];
      for (const item of prepared) {
        const match = item.matcher(source, offset);
        if (match && match.length > 0) candidates.push({ ...item, match });
      }
      if (candidates.length === 0) {
        const line = source.slice(0, offset).split("\n").length;
        const column = offset - source.lastIndexOf("\n", offset - 1);
        throw new SyntaxError(`No statement rule matched at ${line}:${column}: ${source.slice(offset, offset + 80)}`);
      }

      // Like `sort(.length).last`: choose the longest rule key first. For ties,
      // prefer the match consuming more input, then preserve registration order.
      candidates.sort((a, b) =>
        b.rule.key.length - a.rule.key.length ||
        b.match.length - a.match.length ||
        a.order - b.order,
      );
      const winner = candidates[0];
      const start = offset;
      offset += winner.match.length;
      statements.push({
        rule: winner.rule,
        captures: winner.match.captures,
        text: winner.match.text,
        start,
        end: offset,
      });
    }
    return statements;
  }

  lowerToJMP(statements: readonly ParsedStatement[]): JMPProgram {
    const labels = new Map<string, number>();

    statements.forEach((statement, index) => {
      if (statement.rule.control?.type !== "label") return;
      const name = (statement.captures[statement.rule.control.labelCapture] ?? "").trim();
      if (!name) throw new SyntaxError(`Empty label at source offset ${statement.start}.`);
      if (labels.has(name)) throw new SyntaxError(`Duplicate label: ${name}`);
      labels.set(name, index);
    });

    const instructions: JMPInstruction[] = statements.map((statement, index) => {
      const next = index + 1;
      const control = statement.rule.control;
      if (control?.type === "goto") {
        const label = (statement.captures[control.labelCapture] ?? "").trim();
        if (!labels.has(label)) {
          throw new SyntaxError(`Unknown label '${label}' at source offset ${statement.start}.`);
        }
        const target = labels.get(label)!;
        return {
          op: "JMP",
          target,
          next,
          statement,
          rule: statement.rule,
          ...(control.conditionCapture
            ? { condition: statement.captures[control.conditionCapture] ?? "" }
            : {}),
        };
      }
      return {
        op: "JMP",
        target: next,
        next,
        statement,
        rule: statement.rule,
      };
    });

    return { instructions, labels };
  }

  async run(
    ir: JMPProgram,
    node: Node = this.global,
    caller: Program = new Program(),
    variables = new ReactiveMap<string, unknown>(),
    maxSteps = this.options.maxSteps ?? 1_000_000,
  ): Promise<unknown> {
    const context = new ExecutionContext(this, node, caller, variables, ir.labels);
    let pc = 0;
    let steps = 0;

    while (pc >= 0 && pc < ir.instructions.length) {
      if (++steps > maxSteps) throw new Error(`Execution exceeded ${maxSteps} JMP steps (possible infinite loop).`);
      const instruction = ir.instructions[pc];
      context.pc = pc;

      const result = await this.scheduler.schedule(async () => {
        if (!instruction.rule.run) return undefined;
        return instruction.rule.run(context, instruction.statement);
      });
      if (result !== undefined) context.lastValue = result;

      if (instruction.condition !== undefined) {
        const conditionValue = await this.scheduler.schedule(async () => {
          const custom = this.options.evaluateCondition;
          return custom
            ? custom(instruction.condition!, context)
            : context.resolveValue(instruction.condition!);
        });
        pc = conditionValue ? instruction.target : instruction.next;
      } else {
        pc = instruction.target;
      }
    }
    return context.lastValue;
  }

  /** Execute nested RHS text using the same node/environment and a child frame. */
  async executeInline(
    source: string,
    node: Node,
    caller: Program,
    variables: ReactiveMap<string, unknown>,
  ): Promise<unknown> {
    const statements = this.parseStatements(source, node);
    const ir = this.lowerToJMP(statements);
    return this.run(ir, node, new Program(caller), variables);
  }

  #installBuiltins(global: Node): void {
    global.addRule({
      key: ".",
      run: (context) => new Node(),
      description: "Create an empty Node",
    });
    global.addRule({
      key: "&",
      run: (context) => context.caller,
      description: "Return the caller Program",
    });

    global.addRule({
      key: "goto {label} if {condition}",
      control: { type: "goto", labelCapture: "label", conditionCapture: "condition" },
      run: () => undefined,
      description: "Conditional jump to a label",
    });
    global.addRule({
      key: "goto {label}",
      control: { type: "goto", labelCapture: "label" },
      run: () => undefined,
      description: "Jump to a label",
    });
    global.addRule({
      key: "label {label}",
      control: { type: "label", labelCapture: "label" },
      run: () => undefined,
      description: "Declare a jump label",
    });

    global.addRule({
      key: "external {rule} {args}",
      run: (context, statement) => {
        const name = (statement.captures.rule ?? "").trim();
        const external = this.externals[name];
        if (!external) throw new Error(`Unknown external rule '${name}'.`);
        const rawArgs = statement.captures.args ?? "";
        const args = this.options.parseExternalArgs
          ? this.options.parseExternalArgs(rawArgs, context)
          : parseDefaultArguments(rawArgs, context);
        return external(context, args);
      },
      description: "Invoke an externally supplied rule with arguments",
    });
    global.addRule({
      key: "external {rule}",
      run: (context, statement) => {
        const name = (statement.captures.rule ?? "").trim();
        const external = this.externals[name];
        if (!external) throw new Error(`Unknown external rule '${name}'.`);
        return external(context, []);
      },
      description: "Invoke an external rule without arguments",
    });
  }
}

export class CompiledExpression {
  constructor(
    readonly expression: Expression,
    readonly source: Signal<string>,
    readonly node: Node,
    readonly caller: Program,
    readonly ast: Dynamic<readonly ParsedStatement[]>,
    readonly ir: Dynamic<JMPProgram>,
  ) {}

  get statements(): readonly ParsedStatement[] {
    return this.ast.value;
  }

  get instructions(): readonly JMPInstruction[] {
    return this.ir.value.instructions;
  }

  /** Subscribe to successful IR replacement after a relevant change. */
  onRecompile(listener: (program: JMPProgram) => void): Unsubscribe {
    return this.ir.subscribe(() => {
      try {
        listener(this.ir.value);
      } catch {
        // A syntax error remains readable through `ir.value`; don't break a
        // caller's change scheduler by throwing from a subscription callback.
      }
    });
  }

  run(options: RunOptions = {}): Promise<unknown> {
    return this.expression.run(
      this.ir.value,
      options.node ?? this.node,
      options.caller ?? this.caller,
      options.variables ?? new ReactiveMap<string, unknown>(),
      options.maxSteps,
    );
  }

  dispose(): void {
    this.ast.dispose();
    this.ir.dispose();
  }
}

function interpolateCaptures(
  source: string,
  captures: Record<string, string>,
  syntax: CaptureSyntax,
): string {
  let output = "";
  let cursor = 0;
  while (cursor < source.length) {
    if (source.startsWith(syntax.open, cursor)) {
      const closeAt = source.indexOf(syntax.close, cursor + syntax.open.length);
      if (closeAt >= 0) {
        const name = source.slice(cursor + syntax.open.length, closeAt).trim();
        if (Object.prototype.hasOwnProperty.call(captures, name)) {
          output += captures[name];
          cursor = closeAt + syntax.close.length;
          continue;
        }
      }
    }
    output += source[cursor++];
  }
  return output;
}

function parseDefaultArguments(source: string, context: ExecutionContext): unknown[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: "'" | '"' | "`" | undefined;
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth++;
    else if (char === ")" || char === "]" || char === "}") depth--;
    else if (char === "," && depth === 0) {
      parts.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (source.slice(start).trim()) parts.push(source.slice(start).trim());
  return parts.map((part) => context.resolveValue(part));
}
