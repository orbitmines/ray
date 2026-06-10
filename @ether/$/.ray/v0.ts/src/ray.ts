import { fileURLToPath } from "url";
import { Runtime, String, AST } from "./language.ts";
import { Standard, Version } from "./version.ts";
import { nodejs } from "./node.js.ts";
import { Instrumentable, instrumented } from "./diagnostics.ts";
import { Text } from "./source.ts";
import { is_function, is_string } from "./lodash.ts";
import {
  Grammar, Rule, Match, Recognized, Scan,
  match, recognize, cursor_at, sub, indent_at, capture_word, rule_of, gid,
} from "./grammar.ts";

const jump = (node: AST.Node, to: number): void => { node.cursor = to; node.selection = []; };

// The engine is both the bootstrapper and the interpreter — pass 1 over the
// language file plays the bootstrapper's role (the seeded `{pattern} => body`
// rule is the only special shape, and it retires once the file declares it
// in-language). Rule candidates at any position are the Node-keyed methods on
// the type chain of the node being parsed (receiver chain after a result,
// lexical scope chain at expression start), so what grammar is valid where
// follows from the types, not from this file.
@instrumented('trace')
class Engine implements Instrumentable {
  grammar: Grammar;
  scopes: AST.Node[];
  file?: string;
  language_file?: string;
  _: AST.Node;

  constructor(public program: Runtime) {
    this._ = program.BASE;
    this.scopes = [program.GLOBAL];
    // Node-keyed dispatch: the method registered under a pattern node re-runs
    // the matcher at the args cursor and fires.
    this.grammar = new Grammar(program, rule => (_class, method, args) => {
      const m = rule.external?.match ? rule.external.match(rule, args, this.scan()) : match(rule, args, this.scan());
      return (m && this.fire(rule, m, { receiver: _class === rule.on ? undefined : _class })) ?? args;
    });
    this.grammar.changed = () => this.scans.clear();
  }

  get position() { return this._; }
  get __instrumentation() { return this.program; }
  get language(): boolean { return this.file === this.language_file; }

  scope(): AST.Node { return this.scopes[this.scopes.length - 1]; }
  enter(scope: AST.Node): void { this.scopes.push(scope); }
  leave(): void { this.scopes.pop(); }

  // Every node reachable from the scope stack, innermost first (lexical scopes
  // and their super chains) — what an expression start resolves against.
  *lookup(): Generator<AST.Node> {
    const seen = new Set<AST.Node>();
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      for (let n: AST.Node | null | undefined = this.scopes[i]; n; n = n._super) {
        if (seen.has(n)) break;
        seen.add(n);
        yield n;
      }
    }
  }

  // A receiver's type chain — what a result resolves against.
  *chain(node: AST.Node | null | undefined): Generator<AST.Node> {
    const seen = new Set<AST.Node>();
    for (let n = node; n; n = n._super) {
      if (seen.has(n)) break;
      seen.add(n);
      yield n;
    }
  }

  *rules_on(node: AST.Node): Generator<Rule> {
    if (!node.has_value) return;
    for (const key of node.value.keys()) {
      if (is_string(key)) continue;
      const rule = rule_of(key);
      if (rule) yield rule;
    }
  }

  // Disabled rules (the ones the existence analysis errored on) still match —
  // firing them is a no-op, but consuming their regions keeps a single grammar
  // error from cascading into unresolved-token noise. Silently nonexistent
  // rules (no live definition, no error) don't match at all. Rules are visible
  // to the language and to their own file.
  visible(rule: Rule): boolean {
    if (!(rule.exists || rule.disabled)) return false;
    return rule.file === undefined || rule.file === this.file;
  }

  // The recursion that replaces hardcoded syntax knowledge: scanning skips
  // whatever the active grammar claims at a position (strings hide quoted
  // delimiters, group rules hide balanced nesting), and `{`...`}`-style
  // pattern pieces are literal exactly when a quote-like rule (single capture
  // returned verbatim by its body) covers their content. The recursion nests
  // once per open group; past the cap a position simply isn't claimed —
  // unterminated junk degrades to char-wise scanning instead of overflowing.
  //
  // The memo is load-bearing, not a nicety: overlapping scans re-walk the
  // same nested regions from every enclosing position, which is exponential
  // on deeply bracketed content. Keyed by position + the rule-bearing scopes;
  // cleared whenever the installed rule set changes.
  private scan_depth = 0;
  private scans = new Map<string, AST.Node | null>();
  scan(): Scan {
    const anchors = new Set<string>();
    let sig = `${this.file ?? ''}|`;
    for (const node of this.lookup()) {
      let rules = false;
      for (const rule of this.rules_on(node)) {
        rules = true;
        if (this.visible(rule) && rule.anchored && rule.delimited) anchors.add(rule.pieces[0].literal![0]);
      }
      if (rules) sig += `${gid(node)}.`;
    }
    const scan: Scan = {
      anchors,
      inner: (at) => {
        if (this.scan_depth > 64) return null;
        const key = `${sig}:${at.head}`;
        if (this.scans.has(key)) return this.scans.get(key)!;
        this.scan_depth++;
        try {
          const result = this.inner(at, scan);
          this.scans.set(key, result);
          return result;
        } finally { this.scan_depth--; }
      },
      literal_of: (content) => this.quoted(content, scan),
    };
    return scan;
  }

  private inner(at: AST.Node, scan: Scan): AST.Node | null {
    const c = at.source.value[at.head];
    let best: AST.Node | null = null;
    for (const node of this.lookup()) {
      for (const rule of this.rules_on(node)) {
        if (!rule.anchored || !rule.delimited || !this.visible(rule)) continue;
        const lit = rule.pieces[0].literal!;
        if (lit[0] !== c || (lit.length > 1 && at.peek(lit.length) !== lit)) continue;
        const m = match(rule, at, scan);
        if (m && !m.at.empty() && (!best || m.at.end! > best.end!)) best = m.at;
      }
    }
    return best;
  }

  private quoted(content: AST.Node, scan: Scan): string | undefined {
    if (content.empty()) return undefined;
    for (const node of this.lookup()) {
      for (const rule of this.rules_on(node)) {
        if (!rule.anchored || !rule.delimited || !rule.body || !this.visible(rule)) continue;
        const caps = rule.pieces.filter(p => p.literal === undefined);
        if (caps.length !== 1 || !caps[0].name || rule.body.string.trim() !== caps[0].name) continue;
        const m = match(rule, cursor_at(content, content.begin!), scan);
        if (!m || m.at.end !== content.end) continue;
        return m.capture(caps[0].name!)?.string ?? '';
      }
    }
    return undefined;
  }

  parse(node: AST.Node): AST.Node {
    const saved = { file: this.file, scopes: this.scopes };
    this.file = node.source.location;
    this.scopes = [this.program.GLOBAL];
    this._ = node;
    this.statements(cursor_at(node, 0), {});
    this.file = saved.file;
    this.scopes = saved.scopes;
    return node;
  }

  statements(_: AST.Node, opts: { limit?: number; forwards?: boolean }): AST.Node | undefined {
    const over = () => _.done() || (opts.limit !== undefined && _.head > opts.limit);
    const src = _.source.value;
    let result: AST.Node | undefined;
    for (;;) {
      let h = _.head;
      while (h < src.length && (opts.limit === undefined || h <= opts.limit) && (src[h] === ' ' || src[h] === '\n')) h++;
      jump(_, h);
      if (over()) break;
      const before = _.head;
      const r = this.expr(_, { indent: indent_at(src, before), limit: opts.limit, forwards: opts.forwards });
      if (r !== undefined) result = r;
      if (_.head === before) jump(_, _.head + 1);
    }
    return result;
  }

  eval_block(span: AST.Node | undefined, opts: { forwards?: boolean } = {}): AST.Node | undefined {
    if (!span || span.empty()) return undefined;
    const saved_file = this.file;
    this.file = span.source.location;
    const result = this.statements(cursor_at(span, span.begin!), { limit: span.end!, forwards: opts.forwards });
    this.file = saved_file;
    return result;
  }

  expr(_: AST.Node, opts: { indent: number; limit?: number; forwards?: boolean }): AST.Node | undefined {
    const over = () => _.done() || (opts.limit !== undefined && _.head > opts.limit);
    let result: AST.Node | undefined;
    let first = true;

    while (!over()) {
      const c = _.peek();
      if (c === '\n') break;
      const at = cursor_at(_, _.head);

      if (c === ' ') {
        // a rule may claim the space itself (function definitions, spaced calls)
        if (this.apply(_, at, { receiver: result, indent: opts.indent, update: r => result = r ?? result })) continue;
        jump(_, _.head + 1);
        continue;
      }

      // A leading declarative word (external, static) grabs the whole line raw.
      if (first) {
        first = false;
        const keyword = this.known(at, this.lookup());
        const target = keyword ? this.resolve(keyword) : undefined;
        if (target && is_function(target.value.encoded) && target.enabled('declarative')) {
          jump(_, _.head + keyword!.length);
          while (!over() && _.peek() === ' ') jump(_, _.head + 1);
          const src = _.source.value;
          const nl = src.indexOf('\n', _.head);
          const eol = nl === -1 ? src.length : nl;
          const raw = sub(_, _.head, eol - 1);
          jump(_, eol);
          result = (target.value.encoded as AST.EncodedMethod)(this.scope(), target, raw) ?? undefined;
          continue;
        }
      }

      if (this.apply(_, at, { receiver: result, indent: opts.indent, update: r => result = r ?? result })) continue;

      const known = this.known(at, result ? this.chain(result) : this.lookup());
      if (known) {
        const start = _.head;
        jump(_, _.head + known.length);
        const m = result ? this.resolve_on(result, known)! : this.resolve(known)!;
        if (is_function(m.value.encoded)) {
          const fn = m.value.encoded as AST.EncodedMethod;
          const self = result ?? this.scope();
          if (m.enabled('callable')) {
            const rhs = this.expr(_, opts);
            result = fn(self, m, rhs ?? sub(_, start, start - 1)) ?? result;
          } else {
            result = fn(self, m, sub(_, start, start - 1)) ?? result;
          }
        } else {
          result = m;
        }
        continue;
      }

      const start = _.head;
      const word = capture_word(cursor_at(_, _.head), this.scan());
      if (!word) { jump(_, _.head + 1); continue; }
      jump(_, start + word.length);

      if (result) {
        sub(_, start, start + word.length - 1).error('method', `Unresolved \`${word}\` on \`${result.string || AST.Node.describe(result)}\`.`);
        this.skip_line(_);
        return result;
      }
      const forward = sub(_, start, start + word.length - 1);
      forward.forward = { name: word, on: this.scope() };
      result = forward;
    }

    if (result?.forward && !result.consumed && !opts.forwards) {
      result.consumed = true;
      result.error('resolve', `Unresolved variable \`${result.forward.name}\`.`);
    }
    return result;
  }

  // Pick and fire the best rule at `at`: longest match wins; ties prefer an
  // anchored rule (one that starts with a literal) over an unanchored one,
  // then the nearest node in the type chain — the type-bound specificity that
  // lets `({args})` on Program shadow Node's function-definition rule.
  apply(_: AST.Node, at: AST.Node, opts: { receiver?: AST.Node; indent: number; update: (r: AST.Node | undefined) => void }): boolean {
    const scan = { ...this.scan(), indent: opts.indent, start: opts.receiver === undefined };
    const c = at.source.value[at.head];
    let best: { rule: Rule; m: Match; level: number } | null = null;
    const seen = new Set<Rule>();
    let level = 0;
    const consider = (chain: Iterable<AST.Node>) => {
      for (const node of chain) {
        for (const rule of this.rules_on(node)) {
          if (!this.visible(rule) || seen.has(rule)) continue;
          seen.add(rule);
          // Anchored rules are rejected on a single character compare.
          const first = rule.pieces[0]?.literal;
          if (first !== undefined && (first[0] !== c || (first.length > 1 && at.peek(first.length) !== first))) continue;
          const m = rule.external?.match ? rule.external.match(rule, at, scan) : match(rule, at, scan);
          if (!m || m.at.empty()) continue;
          if (!best
            || m.at.end! > best.m.at.end!
            || (m.at.end! === best.m.at.end! && (
                 (rule.anchored && !best.rule.anchored)
              || (rule.anchored === best.rule.anchored && level < best.level)))) best = { rule, m, level };
        }
        level++;
      }
    };
    if (opts.receiver) consider(this.chain(opts.receiver));
    consider(this.lookup());
    if (!best) return false;
    jump(_, best.m.at.end! + 1);
    opts.update(this.fire(best.rule, best.m, { receiver: opts.receiver }));
    return true;
  }

  // Recursion is cut by cycle detection, not depth: re-firing the same rule at
  // the same position is a guaranteed loop and returns immediately. The depth
  // cap is a backstop for cycles the position key can't see; when it trips,
  // the whole current chain aborts (anything less is exponential) without
  // aborting the run.
  private depth = 0;
  private overflowed = false;
  private firing = new Set<string>();
  fire(rule: Rule, m: Match, opts: { receiver?: AST.Node } = {}): AST.Node | undefined {
    if (this.overflowed) return undefined;
    const site = `${gid(rule.pattern)}:${m.at.source.location ?? ''}:${m.at.begin}`;
    if (this.firing.has(site)) return undefined;
    if (this.depth > 64) {
      this.overflowed = true;
      m.at.error('fire', `Rule recursion exceeded at \`${rule.pattern.string}\` — refusing to evaluate deeper.`);
      return undefined;
    }
    this.firing.add(site);
    this.depth++;
    try { return this._fire(rule, m, opts); }
    finally {
      this.firing.delete(site);
      if (--this.depth === 0) this.overflowed = false;
    }
  }
  private _fire(rule: Rule, m: Match, opts: { receiver?: AST.Node } = {}): AST.Node | undefined {
    if (opts.receiver?.forward) opts.receiver.consumed = true;
    // Even an error-recovery match (disabled rule) records what it consumed —
    // the suppression analysis needs to know those regions stay claimed.
    this.grammar.applied(rule, m, { ...this.scan(), on: this.scope(), file: this.file });
    if (rule.disabled) return undefined;
    if (rule.external) return rule.external.fire({ rule, match: m, receiver: opts.receiver, engine: this });
    const body = rule.body;
    if (!body || body.empty()) return undefined;

    const ctx = new AST.Node(this.program, body.source);
    for (const cap of m.captures) {
      const piece = cap.piece;
      if (!piece.name) continue;
      const value = (piece.name === 'expr' || piece.name === 'args')
        ? (this.eval_block(cap.node) ?? cap.node)
        : cap.node;
      if (piece.name === 'block') this.abstract(value);
      ctx.value.set(piece.name, value);
    }
    if (opts.receiver) ctx.value.set('this', opts.receiver);
    this.enter(ctx);
    const result = this.eval_block(body);
    this.leave();
    return result;
  }

  known(at: AST.Node, chain: Iterable<AST.Node>): string | null {
    const src = at.source.value;
    const c = src[at.head];
    let best: string | null = null;
    for (const node of chain) {
      if (!node.has_value) continue;
      for (const key of node.value.keys()) {
        if (!is_string(key) || key[0] !== c) continue;
        if (best !== null && key.length <= best.length) continue;
        if (key.length > 1 && !src.startsWith(key, at.head)) continue;
        if (/\w$/.test(key) && /\w/.test(src[at.head + key.length] ?? '')) continue;
        best = key;
      }
    }
    return best;
  }

  resolve(word: string): AST.Node | undefined {
    for (const node of this.lookup()) if (node.has_value && node.value.has(word)) return node.value.get(word);
    return undefined;
  }

  resolve_on(on: AST.Node, key: AST.Key): AST.Node | undefined {
    for (const node of this.chain(on)) if (node.has_value && node.value.has(key)) return node.value.get(key);
    return undefined;
  }

  // Iterative with a seen-set: slot values can be cyclic (`a = b; b = a`).
  deref(node: AST.Node | undefined): AST.Node | undefined {
    let seen: Set<AST.Node> | undefined;
    let n = node;
    while (n?.slot) {
      if ((seen ??= new Set()).has(n)) break;
      seen.add(n);
      const found = this.resolve_on(n.slot.on, n.slot.key);
      if (!found || found === n) break;
      n = found;
    }
    return n;
  }

  // Under .abstract(), a deferred block is evaluated where it's captured — no
  // call needed. The runtime's abstract hook decides what actually runs.
  abstract(program: AST.Node): void {
    if (!this.program.abstract_interpretation.enabled || program.empty()) return;
    const fn = this.program.abstract_interpretation.call?.(program) ?? program;
    if (fn && !fn.empty()) this.call(fn, fn.New);
  }

  // An in-language program's node spans its own body — calling it evaluates
  // that span with the program node as the local scope (it carries `args` &
  // friends). A body already being evaluated is a recursive call: abstractly
  // its result is opaque — return a fresh node instead of unrolling.
  // TODO Bind call-time args to the definition's parameters.
  private calling = new Set<AST.Node>();
  call(callee: AST.Node | undefined, args: AST.Node): AST.Node {
    const method = callee?.bound ? callee.bound.method : callee;
    const self = callee?.bound ? callee.bound.self : callee;
    if (method && is_function(method.value.encoded))
      return (method.value.encoded as AST.EncodedMethod)(self ?? method, method, args);
    if (method && !method.empty()) {
      if (this.calling.has(method)) return method.New;
      this.calling.add(method);
      try {
        this.enter(method);
        const result = this.eval_block(method);
        this.leave();
        return result ?? method.New;
      } finally { this.calling.delete(method); }
    }
    return (callee ?? this.program.BASE).error('call', 'Expected a function to call.');
  }

  define(target: AST.Node | undefined, value: AST.Node, method: AST.Node): AST.Node {
    if (target?.slot) {
      target.slot.on.value.set(target.slot.key, value);
      this.defined(target, AST.Node.describe(target.slot.key), target.slot.on);
      return value;
    }
    if (target?.forward) {
      target.consumed = true;
      target.forward.on.value.set(target.forward.name, value);
      this.defined(target, target.forward.name, target.forward.on);
      return value;
    }
    (target ?? method).error('assign', 'Cannot assign here.');
    return value;
  }

  defined(at: AST.Node, name: string, on: AST.Node): void {
    const cls = this.class_name(on);
    if (cls) at.info('define', `Defined \`${name}\` on \`${cls}\`.`);
  }

  class_name(node: AST.Node): string | undefined {
    for (const [name, cls] of this.program.classes) if (cls === node) return name;
    return undefined;
  }

  // `external <name>` verifies a runtime-provided method; `external <pattern>`
  // activates a runtime-provided rule under the language's own pattern text.
  declare(raw: AST.Node, on: AST.Node): AST.Node {
    let begin = raw.begin ?? raw.cursor!, end = raw.end ?? begin - 1;
    const src = raw.source.value;
    while (begin <= end && src[begin] === ' ') begin++;
    while (end >= begin && src[end] === ' ') end--;
    const node = sub(raw, begin, end);
    const text = node.string;
    if (!text) { raw.error('external', '`external` requires a declaration as its argument.'); return raw; }

    if (text.startsWith('{') || text.startsWith('(') || text.startsWith('[')) {
      const r = recognize(cursor_at(node, node.begin!), this.scan());
      const pattern = r && r.pattern.end! <= node.end! ? r.pattern : node;
      const rule = this.grammar.declare(pattern, on, { ...this.scan(), file: this.file, language: this.language });
      if (!rule) node.error('external', `Expected the rule \`${pattern.string}\` to be provided by the runtime, but it wasn't.`);
      return raw;
    }
    const name = text.split(/[\s:]+/)[0];
    if (!this.resolve_on(on, name) && !this.resolve(name))
      node.error('external', `Expected method \`${name}\` to be externally defined by the runtime, but it wasn't.`);
    return raw;
  }

  skip_line(_: AST.Node): void {
    const nl = _.source.value.indexOf('\n', _.head);
    jump(_, nl === -1 ? _.source.value.length : nl);
  }
}

export const Ray = String.extension(".ray")
export const Ether = new Runtime('Ether', (Version.scheme('E') as Standard).create(0, '2027-01-01', 0))
  .abstract(fn => {
    // TODO Time/trace the function allow it to go own for a small while in certain configurations/cache certain results.
    return fn;
  })
  .register_frontend(Ray, async (target, input) => {
    const program = target.new()
    const engine = new Engine(program);

    program.base(_ => {
      _.method('external', (_class, method, args) => engine.declare(args, _class)).with('declarative')
      _.method('static', (_class, method, args) => engine.eval_block(args) ?? args).with('declarative')
      _.method('=', (_class, method, args) => engine.define(_class, engine.deref(args) ?? args, method)).with('callable', 'Program')
      // Declared `external **: Program` — the result is a Program, which is
      // what makes Program's rules (`({args})`, the spaced call) apply to it.
      _.method('**', (_class, method, args) => {
        const program = engine.deref(_class) ?? _class;
        program._super = engine.program.PROGRAM;
        return program;
      })

      _.method('left-to-right', (_class, method, args) => args.with('left-to-right')).with('callable', 'Program')
      _.method('right-to-left', (_class, method, args) => args.with('right-to-left')).with('callable', 'Program')
      _.method('left-associative', (_class, method, args) => args.with('associativity', 'left')).with('callable', 'Program')
      _.method('right-associative', (_class, method, args) => args.with('associativity', 'right')).with('callable', 'Program')

      // Stand-ins for the direction/associativity fixtures (tests/direction.ray).
      _.method('test-middle', (_class, method, args) => _class)
      _.method('test-right', (_class, method, args) => { method.info('test', `test-right fired on \`${_class.string ?? '?'}\``); return _class; }).with('callable', 'Program')
      _.method('test-left', (_class, method, args) => { method.info('test', `test-left fired on \`${_class.string ?? '?'}\``); return _class; })
      _.method('F', (_class, method, args) => { method.info('test', `F fired`); return method; })
      _.method('x', (_class, method, args) => { method.info('test', `x@${method.col} fired`); return _class; }).with('callable')
      _.method('M', (_class, method, args) => { method.info('test', `M@${method.col} fired`); return _class; }).with('callable')
      _.method('N', (_class, method, args) => { method.info('test', `N@${method.col} fired`); return _class; }).with('callable')
      _.method('X', (_class, method, args) => { method.info('test', `X@${method.col} fired`); return _class; }).with('callable')
    })

    // Runtime-provided rule implementations. These are inert until a .ray file
    // declares them with `external <pattern>` — the pattern text below must
    // match the declaration exactly.
    engine.grammar.provide('{`class `}{name}{block}', {
      name: 'class',
      fire: ({ match: m, engine }) => {
        const e = engine as Engine;
        const name = m.capture('name')?.string.trim();
        if (!name) return undefined;
        const node = e.program.class_node(name);
        e.scope().value.set(name, node);
        const block = m.capture('block');
        if (block && !block.empty()) {
          e.enter(node);
          e.eval_block(block);
          e.leave();
        }
        return node;
      },
    });

    engine.grammar.provide('{(String.Word | `{`, expr, `}`)[]}{`=>`}{body}', {
      name: 'rule-definition',
      match: (rule, at, opts) => {
        // A statement shape: don't run the line-scanning recognizer at every
        // mid-expression position.
        if (!opts.start) return null;
        const r = recognize(at, opts);
        if (!r) return null;
        const m = new Match(rule, r.at);
        (m as any).recognized = r;
        return m;
      },
      fire: ({ match: m, engine }) => {
        const e = engine as Engine;
        const r = (m as any).recognized as Recognized;
        e.grammar.define(r, e.scope(), { file: e.file, language: e.language });
        return undefined;
      },
    });

    engine.grammar.provide('[{property}]', {
      name: 'index',
      fire: ({ match: m, receiver, engine }) => {
        const e = engine as Engine;
        const self = receiver ?? e.scope();
        const key_node = e.eval_block(m.capture('property'), { forwards: true });
        if (key_node?.forward) key_node.consumed = true;
        const key = key_node ? (key_node.forward?.name ?? key_node.string) : '';
        const found = key ? e.resolve_on(self, key) : undefined;
        if (found && is_function(found.value.encoded)) {
          const bound = sub(m.at, m.at.begin!, m.at.end!);
          bound._super = e.program.PROGRAM;
          bound.bound = { self, method: found };
          return bound;
        }
        const slot = sub(m.at, m.at.begin!, m.at.end!);
        slot.slot = { on: e.deref(self) ?? self, key };
        return slot;
      },
    });

    engine.grammar.provide('({args})', {
      name: 'call',
      fire: ({ match: m, receiver, engine }) => {
        const e = engine as Engine;
        const cap = m.capture('args');
        const args = (cap && !cap.empty() ? e.eval_block(cap) : undefined) ?? cap ?? m.at;
        return e.call(receiver, args);
      },
    });

    program.interpreter = (node: AST.Node) => engine.parse(node);

    const cd = '@ether/$/.ray'
    const language = program.phase('language');
    await program.add(input.new().bundled.loadFile(`${cd}/Node.ray`).all())
    await program.add(input.new().bundled.loadFile(`${cd}/tests/direction.ray`).all())
    await program.add(input.new().bundled.loadFile(`${cd}/tests/circular.ray`).all())
    await program.add(input.new().bundled.loadFile(`${cd}/tests/self.ray`).all())
    await program.add(input.new().bundled.loadFile(`${cd}/tests/string.ray`).all())
    await program.add(input.new().bundled.loadFile(`${cd}/tests/cycle3.ray`).all())
    await program.add(input.new().bundled.loadFile(`${cd}/tests/cycle4.ray`).all())
    await program.add(input.new().bundled.loadFile(`${cd}/tests/tail.ray`).all())
    await program.add(input.new().bundled.loadDirectory(`@ether/.ray3`).all())
    await program.add(input.new().bundled.loadDirectory(`@ether/.ray2`).all())
    const nodes = language.nodes;
    engine.language_file = nodes[0].source.location;

    // The single hardcoded shape — `{pattern} => body` — is seeded as a rule
    // scoped to the language file alone, so even rule definitions are matched
    // through the same Node-keyed dispatch as everything else. Pass 1 over the
    // language file is the bootstrap: it must declare the rule in-language for
    // every other file, and the seed retires with it.
    const seed_source = new Text.Source('{(String.Word | `{`, expr, `}`)[]}{`=>`}{body}', undefined);
    const seed_pattern = new AST.Node(program, seed_source);
    seed_pattern.cursor = 0;
    seed_pattern.selection = [0, seed_source.value.length - 1];
    engine.grammar.install(engine.grammar.rule(seed_pattern, [], program.BASE, { file: engine.language_file }));

    // Baseline = post-base() + seed. Every pass restores it, then re-derives
    // all semantic state (classes, methods, rules) by reparsing — so passes
    // are deterministic and order-independent.
    const snapshots = new Map<AST.Node, ReturnType<AST.Node['snapshot']>>();
    for (const n of new Set([program.BASE, program.CTX, program.GLOBAL, program.PROGRAM]))
      snapshots.set(n, n.snapshot());
    const classes = new Map(program.classes);

    const pass = async () => {
      engine.grammar.begin_pass();
      for (const [n, snap] of snapshots) n.restore(snap);
      program.classes = new Map(classes);
      engine.grammar.install();
      for (const node of nodes) {
        program.log.delete(node.source);
        node.loaded = false;
        node.before = undefined;
        jump(node, 0);
        await node.load();
      }
    };

    // Interpret and reparse to a fixpoint: the discovery pass collects the
    // grammar (live definitions and shadow-scanned suppressed ones); a probe
    // turns every discovered rule on so mutually-suppressing definitions
    // collide (circular comment rules, rules defined only inside themselves)
    // and repeats only while new rules keep turning up; a final pass parses
    // with the settled grammar.
    await pass();
    if (![...engine.grammar.rules.values()].some(r => r.external?.name === 'rule-definition' && r.language))
      return program.log.fatal('bootstrap', `'${engine.language_file}' did not declare the grammar-rule definition rule; the interpreter cannot continue.`);
    engine.grammar.analyze();
    for (let i = 0; i < 3; i++) {
      engine.grammar.probe();
      await pass();
      if (!engine.grammar.analyze().discovered) break;
    }
    await pass();
    engine.grammar.report();

    program.phase('input')
    await program.add(input.all())

    return program
  })

const _isMainEntrypoint = (() => {
  if (!nodejs.enabled) return false;
  if (!process.argv[1]) return false;
  try { return fileURLToPath(import.meta.url) === nodejs.path.resolve(process.argv[1]); }
  catch { return false; }
})();

if (_isMainEntrypoint) {
  // RAY_BENCH=n runs the whole pipeline n times in this process: run 1 pays
  // V8's first-execution tiering, later runs show what the engine itself costs.
  const runs = Math.max(1, Number(process.env.RAY_BENCH) || 1);
  for (let i = 0; i < runs; i++) {
    const ether = Ether.frontend(Ray.new()).abstract()
    const t0 = performance.now();
    await ether.exec()
    if (runs > 1) console.error(`run ${i + 1}: ${(performance.now() - t0).toFixed(2)}ms`);
    if (i === runs - 1) ether.print()
  }
}
