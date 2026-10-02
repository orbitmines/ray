import { Text } from './text.ts';
import { Natives } from './natives.ts';
import { Levelled } from './level.ts';
import { Interpreter, Node, Jump, describe, type Key, type Rules, type Match, type Found, type Piece, type Native, type BodyPlan, type ExternalPlan } from './interpreter.ts';

// What reading decides, decided once: readings kept per place against the
// shape of the rules in reach, and bodies and statements that need not be
// read again. It answers what the interpreter would; it only reads less.
export class Accelerated extends Levelled {
  protected interned = new Map<string, number>();
  intern(key: string): number { let n = this.interned.get(key); if (n === undefined) this.interned.set(key, n = this.interned.size + 1); return n; }
  protected rule_ids = new WeakMap<Node, number>();
  protected pattern_ids = new WeakMap<Piece[], string>();
  rule_id(rule: Node, impl: Node): number {
    let id = this.rule_ids.get(impl);
    if (id !== undefined) return id;
    let spelled = this.pattern_ids.get(rule.pattern!);
    if (spelled === undefined) this.pattern_ids.set(rule.pattern!, spelled = rule.pattern!.map(piece => piece.kind === 'capture' ? `${describe(piece)}${piece.optional ? '?' : ''}` : describe(piece)).join(''));
    id = this.intern(`${spelled}|${impl.forward ? 'F' : ''}|${impl.params?.length ?? -1}`);
    this.rule_ids.set(impl, id);
    return id;
  }
  protected segment_ids = new WeakMap<object, number>();
  protected segment_shapes = new Map<number, { ids: number[]; id: number }[]>();
  segment_id(segment: readonly (readonly [Node, Node])[]): number {
    let id = this.segment_ids.get(segment);
    if (id !== undefined) return id;
    const ids = new Array<number>(segment.length);
    let hash = segment.length;
    for (let k = 0; k < segment.length; k++) { const n = this.rule_id(segment[k][0], segment[k][1]); ids[k] = n; hash = (Math.imul(hash, 31) + n) | 0; }
    let bucket = this.segment_shapes.get(hash);
    if (bucket === undefined) this.segment_shapes.set(hash, bucket = []);
    for (const known of bucket) if (known.ids.length === ids.length && known.ids.every((n, k) => n === ids[k])) { id = known.id; break; }
    if (id === undefined) { id = this.intern('s#' + (this.interned.size + 1)); bucket.push({ ids, id }); }
    this.segment_ids.set(segment, id);
    return id;
  }
  protected set_shapes = new Map<number, { ids: number[]; id: number }[]>();
  set_id(set: Rules): number {
    let id = this.segment_ids.get(set);
    if (id !== undefined) return id;
    const ids = new Array<number>(set.length);
    let hash = set.length ^ 0x5bd1e995;
    for (let k = 0; k < set.length; k++) { const n = this.segment_id(set[k]); ids[k] = n; hash = (Math.imul(hash, 31) + n) | 0; }
    let bucket = this.set_shapes.get(hash);
    if (bucket === undefined) this.set_shapes.set(hash, bucket = []);
    for (const known of bucket) if (known.ids.length === ids.length && known.ids.every((n, k) => n === ids[k])) { id = known.id; break; }
    if (id === undefined) { id = this.intern('S#' + (this.interned.size + 1)); bucket.push({ ids, id }); }
    this.segment_ids.set(set, id);
    return id;
  }
  protected env_ids = new WeakMap<object, number>();
  env_id(frame: Node): number {
    const chain = this.chain(frame);
    let id = this.env_ids.get(chain);
    if (id === undefined) this.env_ids.set(chain, id = this.intern(`E${this.set_id(chain.operand)}|${this.set_id(chain.receiver)}|${[...this.edges(this.rooted(frame))].sort().join('')}`));
    return id;
  }
  protected set_facts = new WeakMap<Rules, { id: number; loose: Node[]; operators: [Node, Node][]; version: number; waiting: string }>();
  protected shape_facts = new Map<number, { loose: [number, number][]; operators: [number, number][] }>();
  facts(set: Rules) {
    let held = this.set_facts.get(set);
    if (held === undefined) {
      const id = this.set_id(set);
      let shape = this.shape_facts.get(id);
      if (shape === undefined) {
        shape = { loose: [], operators: [] };
        set.forEach((segment, k) => segment.forEach(([rule], i) => { const shaped = this.shaped(rule); if (shaped.loose) shape!.loose.push([k, i]); if (shaped.operator) shape!.operators.push([k, i]); }));
        this.shape_facts.set(id, shape);
      }
      this.set_facts.set(set, held = { id, loose: shape.loose.map(([k, i]) => set[k][i][0]), operators: shape.operators.map(([k, i]) => set[k][i] as [Node, Node]), version: -1, waiting: '' });
    }
    if (held.operators.length > 0 && held.version !== this.version) {
      let bits = '';
      for (const [rule, impl] of held.operators) bits += this.ready(rule, impl) ? '0' : '1';
      held.version = this.version; held.waiting = bits;
    }
    return held;
  }

  protected epoch_parts: number[] = [];
  protected epoch_n = 0;
  grammar_epoch(): number {
    const parts = this.epoch_parts, early = this.passing === 0 && this.began ? 0 : 1, base = this.BASE === undefined ? 0 : this.intern_node(this.BASE);
    if (parts[0] !== this.bracketing || parts[1] !== Node.heads.size || parts[2] !== early || parts[3] !== base) {
      this.epoch_parts = [this.bracketing, Node.heads.size, early, base];
      this.epoch_n = this.intern('e' + this.epoch_parts.join(':'));
    }
    return this.epoch_n;
  }
  protected read_sites = new WeakMap<Text.Source, Map<number, { limit: number; flags: number; besides?: Node; set: number; env: number; owned: string; epoch: number; waiting: string; last?: Rules; chain?: object; found?: { segment: number; index: number; match: Match } }[]>>();
  best(receiver: Node | undefined, cursor: Text.Node, frame: Node, opts: { newline?: boolean; spaced: boolean; operand: boolean; forwards?: boolean; self?: boolean; leading?: boolean; besides?: Node }): Found | undefined {
    const set = opts.leading
      ? this.only(this.chain(frame).receiver, true)
      : opts.self
        ? this.only(this.candidates(receiver, frame, { self: true }), false)
        : this.candidates(receiver, frame);
    const flags = (opts.newline ? 1 : 0) | (opts.spaced ? 2 : 0) | (opts.operand ? 4 : 0) | (opts.forwards ? 8 : 0) | (opts.self ? 16 : 0) | (opts.leading ? 32 : 0) | (receiver !== undefined ? 64 : 0) | (this.rewriting.size > 0 ? 128 : 0);
    const facts = this.facts(set), chain = this.chain(frame), epoch = this.grammar_epoch();
    let owned = '';
    if (receiver !== undefined) for (const rule of facts.loose) owned += this.declares(receiver, rule) ? '1' : '0';
    let at = this.read_sites.get(cursor.source);
    if (at === undefined) this.read_sites.set(cursor.source, at = new Map());
    let entries = at.get(cursor.cursor);
    if (entries === undefined || (entries.length > 0 && entries[0].epoch !== epoch)) at.set(cursor.cursor, entries = []);
    let env = -1;
    for (let k = 0; k < entries.length; k++) {
      const entry = entries[k];
      if (entry.limit !== cursor.limit || entry.flags !== flags || entry.besides !== opts.besides || entry.set !== facts.id || entry.owned !== owned || entry.epoch !== epoch || entry.waiting !== facts.waiting) continue;
      if (entry.chain !== chain) { if (env < 0) env = this.env_id(frame); if (entry.env !== env) continue; entry.chain = chain; }
      if (k > 0) { entries[k] = entries[0]; entries[0] = entry; }
      const answer: Found | undefined = entry.found && { rule: set[entry.found.segment][entry.found.index][0], impl: set[entry.found.segment][entry.found.index][1], match: { ...entry.found.match, receiver } };
      return answer;
    }
    const found = this.best_of(set, receiver, cursor, frame, opts);
    if (found !== undefined && found.match.read !== undefined && found.match.read.size > 0) return found;
    let where: { segment: number; index: number; match: Match } | undefined;
    if (found !== undefined) for (let k = 0; k < set.length && where === undefined; k++) { const index = set[k].findIndex(([rule]) => rule === found.rule); if (index >= 0) where = { segment: k, index, match: found.match }; }
    if (entries.length >= 16) entries.pop();
    entries.unshift({ limit: cursor.limit, flags, besides: opts.besides, set: facts.id, env: this.env_id(frame), owned, epoch, waiting: facts.waiting, chain, found: where });
    return found;
  }
  protected node_ids = new WeakMap<Node, number>();
  protected node_count = 0;
  intern_node(node: Node): number { let n = this.node_ids.get(node); if (n === undefined) this.node_ids.set(node, n = ++this.node_count); return n; }

  // What reading decides is the same wherever the rules in reach are the
  // same: a stamp names that, and a plan is kept against it.
  protected stamps = new WeakMap<object, { epoch: number; version: number; stamp: number }>();
  stamp(frame: Node): number {
    const chain = this.chain(frame), epoch = this.grammar_epoch();
    const held = this.stamps.get(chain);
    if (held !== undefined && held.epoch === epoch && held.version === this.version) return held.stamp;
    const stamp = this.intern(`${epoch}|${this.env_id(frame)}|${this.facts(chain.operand).waiting}|${this.facts(chain.receiver).waiting}`);
    this.stamps.set(chain, { epoch, version: this.version, stamp });
    return stamp;
  }
  protected planned<T>(store: WeakMap<Text.Source, Map<number, { limit: number; stamp: number; value: T }>>, cursor: Text.Node, frame: Node, plan: () => T): T {
    let at = store.get(cursor.source);
    if (at === undefined) store.set(cursor.source, at = new Map());
    const start = cursor.cursor, stamp = this.stamp(frame), held = at.get(start);
    if (held !== undefined && held.limit === cursor.limit && held.stamp === stamp) return held.value;
    const value = plan();
    cursor.cursor = start;
    at.set(start, { limit: cursor.limit, stamp, value });
    return value;
  }
  // How a body reads, decided once: one of the rule's own captures (`pass`),
  // a name the rule does not hand it (`name`), a primitive reading only
  // values (`native`), or one group of a passing rule (`group`).
  protected body_plans = new WeakMap<Node, { stamp: number; plan: BodyPlan }>();
  body_plan(rule: Node, impl: Node): BodyPlan {
    if (impl.body === undefined || impl.fn !== undefined || impl.forward !== undefined || rule.pattern!.some(piece => piece.kind === 'operator' || (piece.kind === 'capture' && piece.runs))) return undefined;
    const closure = impl.closure ?? this.GLOBAL, stamp = this.stamp(closure), held = this.body_plans.get(impl);
    if (held !== undefined && held.stamp === stamp && (held.plan?.kind !== 'name' || held.plan.names === Node.named_keys.size)) return held.plan;
    const plan = this.plan_body(rule, impl, closure);
    this.body_plans.set(impl, { stamp, plan });
    return plan;
  }
  protected plan_body(rule: Node, impl: Node, closure: Node): BodyPlan {
    const body = impl.body!, text = body.string, cursor = this.cursor_of(body);
    const handed = new Set(rule.pattern!.flatMap(piece => piece.kind === 'capture' ? [piece.name] : []));
    const word = /^[\p{L}_][\p{L}\p{N}_-]*$/u.test(text) ? text : undefined;
    if (impl.params === undefined && word !== undefined) {
      if (this.line_rule(cursor, body.begin, closure, body.begin)) return undefined;
      if (handed.has(word)) return this.operand_length(cursor, closure) < word.length ? { kind: 'pass', word } : undefined;
      if (this.name(cursor, closure) !== word) return undefined;
      return this.operand_length(cursor, closure) < word.length ? { kind: 'name', word, names: Node.named_keys.size } : undefined;
    }
    const head = this.name(cursor, closure);
    if (impl.params === undefined && !text.includes('\n') && head !== undefined && !handed.has(head) && closure.lookup(head) === this.EXTERNAL) {
      const plan = this.plan_external(cursor, closure, head);
      const native = plan === undefined ? undefined : this.program?.EXTERNALS[plan.token.string] ?? Natives[plan.token.string];
      if (plan !== undefined && plan.end === body.end + 1 && native?.values === true && plan.args.length === native.arity && plan.args.every(span => handed.has(span.string) || closure.lookup(span.string) !== undefined))
        return { kind: 'native', native, words: plan.args.map(span => span.string), spans: plan.args };
      return undefined;
    }
    cursor.cursor = body.begin;
    if (this.line_rule(cursor, body.begin, closure, body.begin) || this.arrow(cursor, closure) >= 0) return undefined;
    const found = this.best(undefined, cursor, closure, { spaced: false, operand: false });
    cursor.cursor = body.begin;
    const name = this.name(cursor, closure);
    if (found === undefined || found.match.end !== body.end + 1 || (name !== undefined && found.match.end - found.match.begin < name.length) || found.match.read !== undefined) return undefined;
    const passing = this.body_plan(found.rule, found.impl);
    const inner = passing?.kind === 'pass' ? found.match.captures.get(passing.word) : undefined;
    const piece = found.rule.pattern!.find(each => each.kind === 'capture' && each.name === passing?.word);
    if (inner === undefined || piece?.kind !== 'capture' || piece.raw || found.rule.pattern!.filter(each => each.kind === 'capture').length !== 1) return undefined;
    return { kind: 'group', rule: found.rule, impl: found.impl, inner, at: cursor.span(found.match.begin, found.match.end - 1) };
  }
  // A frame for a body that is not read: where it was applied, and what it was handed.
  protected frame_for(rule: Node, impl: Node, frame: Node, at: Text.Node, captures?: Map<string, Node>, receiver?: Node): Node {
    const local = this.frame(frame, undefined, impl.closure ?? this.GLOBAL);
    local.position = at;
    if (captures !== undefined) {
      local.given = new Set(captures.keys());
      for (const [name, node] of captures) this.bind(local, name, node);
    }
    local.applied_to = receiver;
    const into = this.context_of(receiver);
    if (into !== undefined) { this.construct(into); this.sees(local, into); }
    this.ran.add(rule.key!);
    this.applying.push({ rule, impl, receiver, local });
    return local;
  }
  protected run_named(word: string, rule: Node, impl: Node, frame: Node, at: Text.Node, receiver?: Node): Node | undefined {
    const local = this.frame_for(rule, impl, frame, at, undefined, receiver);
    try { return this.unalias(this.settle(this.reference(local, word, impl.body!), false), local); }
    catch (jump) { throw this.ends_at(jump, impl, at); }
    finally { this.applying.pop(); }
  }
  protected run_native(plan: BodyPlan & { kind: 'native' }, rule: Node, impl: Node, captures: Map<string, Node>, receiver: Node | undefined, frame: Node, at: Text.Node): Node | undefined {
    const local = this.frame_for(rule, impl, frame, at, captures, receiver);
    try {
      for (;;) {
        try {
          const args = plan.words.map((word, k) => this.reference(local, word, plan.spans[k]));
          const result = this.unalias(this.settle(plan.native.fn({ interpreter: this, frame: local, method: impl, args, at: plan.spans[plan.spans.length - 1] }), false), local);
          return result;
        }
        catch (jump) {
          if (!(jump instanceof Jump) || this.seeking !== undefined || jump.kind === 'end') throw jump;
          this.again(local);
          if (jump.kind !== 'begin') throw jump;
        }
      }
    }
    catch (jump) { throw this.ends_at(jump, impl, at); }
    finally { this.applying.pop(); }
  }
  protected run_grouped(plan: BodyPlan & { kind: 'group' }, impl: Node, local: Node, functional: boolean): Node | undefined {
    const body = impl.body!;
    for (;;) {
      try {
        const held = this.lazy(plan.inner, local, false);
        return this.settle(this.passed(plan.rule, plan.impl, held, [held], plan.at), false);
      }
      catch (jump) {
        if (!(jump instanceof Jump) || this.seeking !== undefined) throw jump;
        if (jump.kind === 'end') {
          if (!functional || !(jump.site === undefined || Interpreter.within(jump.site, body))) throw jump;
          return jump.value;
        }
        this.looped(local, jump.kind === 'begin' ? '' : jump.label, plan.at);
        this.again(local);
        if (jump.kind !== 'begin') throw jump;
      }
    }
  }
  protected passed(rule: Node, impl: Node, held: Node, bound: Node[], at: Text.Node): Node | undefined {
    this.ran.add(rule.key!);
    this.applying.push({ rule, impl, receiver: undefined });
    const read = () => { let node: Node | undefined = held; for (let depth = 0; node?.ref && depth < 64; depth++) node = this.bound(node); return node?.lazy ? this.force(node) : held; };
    try {
      for (;;) {
        try {
          const answered = read();
          return answered;
        }
        catch (jump) {
          if (!(jump instanceof Jump) || this.seeking !== undefined || jump.kind === 'end') throw jump;
          this.looped(held.lazy?.frame, jump.kind === 'begin' ? '' : jump.label, at);
          for (const node of bound) if (node.lazy) node.value = undefined;
          if (jump.kind === 'begin') continue;
          const body = impl.body!;
          this.seeking = { label: jump.label, source: body.source, begin: body.begin, end: body.end + 1 };
          this.diagnostics.muted(() => this.safely(read));
          this.seeking = undefined;
          throw jump;
        }
      }
    }
    catch (jump) { throw this.ends_at(jump, impl, at); }
    finally { this.applying.pop(); }
  }

  // How much of what is written here a rule of the language reads, before
  // any name is: a name is only read where no rule reads at least as much.
  protected operand_lengths = new WeakMap<Text.Source, Map<number, { limit: number; stamp: number; value: number }>>();
  operand_length(cursor: Text.Node, frame: Node): number {
    return this.planned(this.operand_lengths, cursor, frame, () => {
      const found = this.best(undefined, cursor, frame, { spaced: false, operand: false });
      return found === undefined ? -1 : found.match.end - found.match.begin;
    });
  }
  // A statement written `external NAME a b` is read the same way wherever
  // the rules in reach are the same: what it calls, and with which spans.
  protected external_plans = new WeakMap<Text.Source, Map<number, { limit: number; stamp: number; value: ExternalPlan | undefined }>>();
  external_plan(cursor: Text.Node, frame: Node, word: string): ExternalPlan | undefined {
    return this.planned(this.external_plans, cursor, frame, () => this.plan_external(cursor, frame, word));
  }
  protected plan_external(cursor: Text.Node, frame: Node, word: string): ExternalPlan | undefined {
    const start = cursor.cursor, text = cursor.source.value;
    if (this.line_rule(cursor, start, frame, start) || this.arrow(cursor, frame) >= 0) return undefined;
    const first = this.best(undefined, cursor, frame, { spaced: false, operand: false });
    cursor.cursor = start;
    if (first !== undefined && first.match.end - first.match.begin >= word.length) return undefined;
    const name = cursor.span(start, start + word.length - 1);
    const reference = this.reference(frame, word, name);
    if (this.resolved(reference) !== this.EXTERNAL) return undefined;
    cursor.cursor = start + word.length;
    if (this.spaces(cursor) === 0 || cursor.done() || cursor.peek() === '\n' || this.line_rule(cursor, cursor.cursor, frame)) return undefined;
    const before = cursor.cursor;
    if (this.best(reference, cursor, frame, { spaced: true, operand: false, forwards: true }) !== undefined) return undefined;
    let end = before;
    while (end < cursor.limit && !/\s/.test(text[end])) end++;
    if (end === before) return undefined;
    const token = cursor.span(before, end - 1);
    const native = this.program?.EXTERNALS[token.string] ?? Natives[token.string];
    if (native === undefined) return undefined;
    cursor.cursor = end;
    const args: Text.Node[] = [];
    const probe = new Node(this.diagnostics, token); probe.fn = native.fn; probe.arity = native.arity;
    for (let k = 0; k < native.arity; k++) {
      if (this.spaces(cursor) === 0 || cursor.done() || cursor.peek() === '\n' || this.line_rule(cursor, cursor.cursor, frame)) return undefined;
      const from = cursor.cursor;
      if (this.best(probe, cursor, frame, { spaced: true, operand: false }) !== undefined) return undefined;
      const grouped = this.claim(cursor, from, frame);
      const until = this.reading_end(cursor, from, grouped > from ? grouped : this.operand_end(cursor, from, frame), frame);
      if (until <= from) return undefined;
      args.push(cursor.span(from, until - 1));
      cursor.cursor = until;
    }
    return { word: name, token, call: token, args, end: cursor.cursor };
  }
  protected run_external(plan: ExternalPlan, cursor: Text.Node, frame: Node): Node | undefined {
    let value: Node | undefined = this.reference(frame, plan.word.string, plan.word);
    this.paint_reference(value);
    const raw = new Node(this.diagnostics, plan.token); raw.literal = true;
    value = this.call(value, raw, plan.call, frame);
    cursor.cursor = plan.call.end + 1;
    for (const span of plan.args) {
      if (value === undefined || !this.callable_of(this.deref(value))) return value;
      value = this.call(value, this.lazy(span, frame, false), span, frame);
      cursor.cursor = span.end + 1;
    }
    return value;
  }
  protected arrows = new WeakMap<Text.Source, Map<number, { limit: number; epoch: number; env: number; lines: object; at: number }>>();
  arrow(cursor: Text.Node, frame: Node): number {
    let held = this.arrows.get(cursor.source);
    if (held === undefined) this.arrows.set(cursor.source, held = new Map());
    const known = held.get(cursor.cursor), epoch = this.grammar_epoch(), lines = this.layers.lines;
    if (known !== undefined && known.limit === cursor.limit && known.epoch === epoch && (known.lines === lines || this.segment_id(known.lines as any) === this.segment_id(lines))) { known.lines = lines; return known.at; }
    const at = this.arrow_at(cursor, frame);
    held.set(cursor.cursor, { limit: cursor.limit, epoch, env: 0, lines, at });
    return at;
  }

  override shortcut(found: Found, captures: Map<string, Node>, args: Node[], cursor: Text.Node, frame: Node, at: Text.Node): { value: Node | undefined } | undefined {
    const levelled = super.shortcut(found, captures, args, cursor, frame, at);
    if (levelled !== undefined) return levelled;
    const { rule, impl, match } = found;
    if (this.seeking !== undefined || args.length > 0) return undefined;
    const plan = this.body_plan(rule, impl);
    if (plan?.kind === 'pass' && captures.has(plan.word)) return { value: this.passed(rule, impl, captures.get(plan.word)!, [...captures.values(), ...(match.receiver !== undefined ? [match.receiver] : [])], at) };
    if (plan?.kind === 'name' && (impl.closure ?? this.GLOBAL).lookup(plan.word) !== undefined) return { value: this.run_named(plan.word, rule, impl, frame, at, match.receiver) };
    if (plan?.kind === 'native') return { value: this.run_native(plan, rule, impl, captures, match.receiver, frame, at) };
    return undefined;
  }
  override read_body(rule: Node, impl: Node, body: Text.Node, local: Node, functional: boolean): Node | undefined {
    const plan = body === impl.body ? this.body_plan(rule, impl) : undefined;
    return plan?.kind === 'group' ? this.run_grouped(plan, impl, local, functional) : super.read_body(rule, impl, body, local, functional);
  }
  override lead(cursor: Text.Node, frame: Node): { value: Node | undefined } | undefined {
    const name = this.name(cursor, frame);
    if (name === undefined) return undefined;
    const bound = frame.lookup(name);
    const plan = bound === this.EXTERNAL ? this.external_plan(cursor, frame, name) : undefined;
    if (plan !== undefined) return { value: this.run_external(plan, cursor, frame) };
    if (bound === undefined || this.operand_length(cursor, frame) >= name.length) return undefined;
    const value = this.reference(frame, name, cursor.span(cursor.cursor, cursor.cursor + name.length - 1));
    this.paint_reference(value);
    cursor.advance(name.length);
    return { value };
  }
  ruleset(scope: Node): { operand: [Node, Node][]; receiver: [Node, Node][]; forwarded: [Node, Node][] } {
    const cached = this.rulesets.get(scope);
    if (cached && cached.rules === (scope.rule_version ?? 0)) return cached;
    const operand: [Node, Node][] = [], receiver: [Node, Node][] = [];
    for (const rule of scope.rules.reverse()) {
      const impl = scope.methods!.get(rule)!;
      if (impl.operation || impl.defines) continue;
      const leading = rule.pattern![0]?.kind === 'capture';
      const is_operand = impl.forward !== undefined || (scope === this.GLOBAL && !leading);
      if (is_operand && !(impl.forward && impl.params)) operand.push([rule, impl]);
      if (!is_operand || impl.forward) receiver.push([rule, impl]);
    }
    const set = { rules: scope.rule_version ?? 0, operand, receiver, forwarded: receiver.filter(([, impl]) => impl.forward !== undefined) };
    this.rulesets.set(scope, set);
    return set;
  }
  rooted(frame: Node): Node {
    let held = frame, seen: Set<Node> | undefined, depth = 0;
    while (held.ruled !== true && held.parent !== undefined) {
      this.asked.add(held);
      if (++depth > 64) { seen ??= new Set(); if (seen.has(held.parent)) break; seen.add(held); }
      held = held.parent;
    }
    return held;
  }
  chain(frame: Node): { operand: Rules; receiver: Rules } {
    const known = this.frame_chains.get(frame);
    if (known !== undefined && known.epoch === this.scopes_epoch()) return known.chain;
    const held = this.rooted(frame);
    const chain = held !== frame ? this.chain(held) : this.chain_of(frame);
    this.frame_chains.set(frame, { epoch: this.scopes_epoch(), chain });
    return chain;
  }
  protected dispatch = new WeakMap<Node, { chain: Rules; of: unknown; rules: Rules }>();
  override dispatched(own: Node, chain: Rules, itself: boolean): Rules {
    const cached = itself ? undefined : this.dispatch.get(own);
    if (own.inlined === undefined && own.made_of === undefined) {
      if (!own.methods || itself) return chain;
      const segment = this.ruleset(own).receiver;
      if (cached?.chain === chain && cached.of === segment) return cached.rules;
      const rules = [segment, ...chain];
      this.dispatch.set(own, { chain, of: segment, rules });
      return rules;
    }
    const epoch = this.scopes_epoch();
    if (cached?.chain === chain && cached.of === epoch) return cached.rules;
    const dispatched = super.dispatched(own, chain, itself);
    if (!itself) this.dispatch.set(own, { chain, of: epoch, rules: dispatched });
    return dispatched;
  }
  edges(frame: Node): Set<string> {
    const cached = this.boundaries.get(frame);
    const epoch = this.rules_epoch();
    if (cached?.epoch === epoch) return cached.edges;
    const edges = new Set<string>();
    const add = (rule: Node) => { const first = rule.pattern!.find(x => x.kind !== 'capture'); if (first?.kind === 'literal' && !/[\p{L}\p{N}_]/u.test(first.text[0])) edges.add(first.text[0]); };
    for (let scope: Node | undefined = frame; scope; scope = scope.parent) scope.rules.forEach(add);
    this.BASE?.rules.forEach(add);
    this.boundaries.set(frame, { epoch: this.rules_epoch(), edges });
    return edges;
  }
  protected rulesets = new WeakMap<Node, { rules: number; operand: [Node, Node][]; receiver: [Node, Node][]; forwarded: [Node, Node][] }>();
  protected frame_chains = new WeakMap<Node, { epoch: number; chain: { operand: Rules; receiver: Rules } }>();
  protected boundaries = new WeakMap<Node, { epoch: number; edges: Set<string> }>();
  protected asked = new WeakSet<Node>();
  override stale_rules(frame: Node, key: Key): boolean { return key instanceof Node && !frame.methods?.has(key) && (this.rulesets.has(frame) || this.dispatch.has(frame) || this.asked.has(frame)); }

  override operators_in(segment: readonly [Node, Node][]): Map<string, [string, Text.Node][]> {
    const cached = this.operator_rules.get(segment);
    if (cached?.version === this.version) return cached.spelled;
    const spelled = new Map<string, [string, Text.Node][]>();
    for (const [rule, impl] of segment) {
      const pieces = rule.pattern;
      if (pieces?.length !== 1 || pieces[0].kind !== 'literal' || (impl.params?.length ?? 0) === 0 || rule.position === undefined) continue;
      const text = pieces[0].text.trim();
      if (text.length === 0 || Interpreter.word.test(text[0])) continue;
      let same = spelled.get(text[0]);
      if (same === undefined) spelled.set(text[0], same = []);
      same.push([text, rule.position]);
    }
    this.operator_rules.set(segment, { version: this.version, spelled });
    return spelled;
  }
  override operators_of(frame: Node): Map<string, [string, Text.Node][]>[] {
    const rules = this.chain(frame);
    const cached = this.operator_chains.get(rules.receiver);
    if (cached?.version === this.version) return cached.spelled;
    const spelled = [...rules.receiver, ...rules.operand].map(segment => this.operators_in(segment)).filter(operators => operators.size > 0);
    this.operator_chains.set(rules.receiver, { version: this.version, spelled });
    return spelled;
  }
  protected operator_rules = new WeakMap<readonly [Node, Node][], { version: number; spelled: Map<string, [string, Text.Node][]> }>();
  protected operator_chains = new WeakMap<Rules, { version: number; spelled: Map<string, [string, Text.Node][]>[] }>();

  protected onlys = [new WeakMap<Rules | readonly [Node, Node][], any>(), new WeakMap<Rules | readonly [Node, Node][], any>()];
  override only(set: Rules, leading: boolean): Rules {
    const known = this.onlys[leading ? 1 : 0];
    let kept: Rules | undefined = known.get(set);
    if (kept !== undefined) return kept;
    const out: (readonly [Node, Node][])[] = [];
    for (const segment of set) {
      let held: readonly [Node, Node][] | undefined = known.get(segment);
      if (held === undefined) {
        held = leading
          ? segment.filter(([rule]) => rule.pattern![0]?.kind === 'capture')
          : segment.filter(([rule]) => { const first = rule.pattern![0]; return first?.kind !== 'capture' || first.raw; });
        known.set(segment, held);
      }
      if (held.length > 0) out.push(held);
    }
    known.set(set, kept = out);
    return kept;
  }

}
