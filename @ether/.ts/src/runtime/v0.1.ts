import fs from "fs";
import path from "node:path";

// ============================================================================
// Unified Node — Everything is a Node
// ============================================================================
//
// In Ray, Node IS Ray IS Boundary IS Edge. The boundary structure lives on
// every Node:
//
//   vertex ← boundary → edge → boundary → vertex
//
// Navigation returns generators because in a graph there are always multiple
// possibilities (branching). Multiple possibilities = superposition (#).
//
// Key insight: parsing IS ==.instance_of (type matching).

const NONE_SENTINEL = Symbol("None");
const UNKNOWN = Symbol("Unknown");

type EdgeKind = '|' | '&';

class Node {
  // === The primitive encoded value (string, number, boolean, null, etc.) ===
  encoded: any = UNKNOWN;

  // === Boundary structure — every Node is a Ray ===
  // ⊢ (initial boundary): vertex points back to this Node, edges go backward
  // ⊣ (terminal boundary): vertex points back to this Node, edges go forward
  //
  // Each boundary can have MULTIPLE edges (graph branching = superposition).
  // Edges are stored as a linked list via _edgeNext.
  initial: Boundary;
  terminal: Boundary;

  // === Properties/methods: type-based keys → values ===
  // Keys can be arbitrary Nodes, not just strings
  private _methods: Map<string | Node, Node> = new Map();

  // === Class components (###) — inheritance chain ===
  private _classCompHead: Node | null = null;
  _classCompNext: Node | null = null;

  // === Silent components — participate in resolution but invisible to ##/classComponents ===
  private _silentCompHead: Node | null = null;

  // === Lazy program (**) ===
  program: Program | null = null;
  _unresolved = false; // true if this node was produced from an unresolved identifier

  // === Type annotation ===
  type: Node | null = null;

  // === Class metadata ===
  className: string | null = null;
  get isClass(): boolean {
    const s = this.getDirect('static');
    return s === this;
  }

  constructor(value: any = UNKNOWN) {
    if (value !== UNKNOWN) this.encoded = value;
    this.initial = new Boundary(this);
    this.terminal = new Boundary(this);
  }

  // --- None ---

  get isNone(): boolean {
    return this.encoded === NONE_SENTINEL || this.encoded === null || this.encoded === undefined;
  }

  // --- Superposition (#) — unified via typed boundary edges ---
  // Both | (OR) and & (AND) link nodes via boundary edges with EdgeKind values.
  // next() follows ALL edges. superposed() follows only '|' and '&' edges.

  // | operator: link x as OR superposition via boundary edge
  or(x: Node): Node {
    if (x === this) return this;
    const edge = new BoundaryEdge(this.terminal, x.initial, '|');
    this.terminal.addEdge(edge);
    x.initial.addEdge(edge);
    return this;
  }

  // & operator: link x as AND superposition via boundary edge
  and(x: Node): Node {
    if (x === this) return this;
    const edge = new BoundaryEdge(this.terminal, x.initial, '&');
    this.terminal.addEdge(edge);
    x.initial.addEdge(edge);
    return this;
  }

  // Iterate all superposed values (follows '|' and '&' edges recursively)
  *superposed(): Generator<Node> {
    for (const [node] of this.superposedWithEdges()) yield node;
  }

  // Iterate superposed values with their edge kinds (recursive through chain)
  *superposedWithEdges(): Generator<[Node, EdgeKind | null]> {
    const visited = new Set<Node>();
    function* walk(node: Node, incomingEdge: EdgeKind | null): Generator<[Node, EdgeKind | null]> {
      if (visited.has(node)) return;
      visited.add(node);
      yield [node, incomingEdge];
      for (const edge of node.terminal.edges()) {
        if (edge.value !== '|' && edge.value !== '&') continue;
        const target = edge.to !== node.terminal ? edge.to : edge.from;
        yield* walk(target.vertex, edge.value as EdgeKind);
      }
    }
    yield* walk(this, null);
  }

  // Recursive unfolding of nested superposition groups
  // For A & (A | B): expands into the leaf nodes
  *expand(): Generator<Node> {
    let hasSuperEdges = false;
    for (const edge of this.terminal.edges()) {
      if (edge.value === '|' || edge.value === '&') { hasSuperEdges = true; break; }
    }
    if (!hasSuperEdges) {
      yield this;
      return;
    }
    for (const node of this.superposed()) {
      if (node === this) { yield this; continue; }
      yield* node.expand();
    }
  }

  // --- Class components (###) — generator ---

  *classComponents(visited: Set<Node> = new Set()): Generator<Node> {
    if (this._classCompHead === null) return;
    let current: Node | null = this._classCompHead;
    while (current !== null) {
      if (!visited.has(current)) {
        visited.add(current);
        yield current;
      }
      current = current._classCompNext;
    }
  }

  // &+ operator: merge properties from x into this (composition)
  compose(x: Node): Node {
    if (x === this) return this; // Don't compose with self
    // Check if already composed
    for (const comp of this.classComponents()) {
      if (comp === x) return this;
    }
    // Copy all methods from x that aren't already defined on this
    for (const [key, value] of x._methods) {
      if (!this._methods.has(key)) {
        this._methods.set(key, value);
      }
    }
    // Track in class components chain
    if (this._classCompHead === null) {
      this._classCompHead = x;
    } else {
      let last: Node = this._classCompHead;
      while (last._classCompNext !== null) last = last._classCompNext;
      last._classCompNext = x;
    }
    return this;
  }

  // Add x as a component without eagerly copying methods (lazy lookup via classComponents)
  addComponent(x: Node): Node {
    if (x === this) return this;
    for (const comp of this.classComponents()) {
      if (comp === x) return this;
    }
    if (this._classCompHead === null) {
      this._classCompHead = x;
    } else {
      let last: Node = this._classCompHead;
      while (last._classCompNext !== null) last = last._classCompNext;
      last._classCompNext = x;
    }
    return this;
  }

  // Add x as a silent component — participates in get() resolution but invisible to ##/classComponents
  addSilentComponent(x: Node): Node {
    if (x === this) return this;
    if (this._silentCompHead === null) {
      this._silentCompHead = x;
    } else {
      let last: Node = this._silentCompHead;
      while (last._classCompNext !== null) last = last._classCompNext;
      last._classCompNext = x;
    }
    return this;
  }

  // Iterate silent components (for internal resolution only)
  *silentComponents(): Generator<Node> {
    if (this._silentCompHead === null) return;
    let current: Node | null = this._silentCompHead;
    while (current !== null) {
      yield current;
      current = current._classCompNext;
    }
  }

  // --- Boundary-centric navigation (all generators!) ---

  // next: follow terminal boundary's edges to reach next vertices
  // Returns a generator because there can be multiple next nodes (graph branching)
  *next(): Generator<Node> {
    yield* this.terminal.continuationVertices();
  }

  // previous: follow initial boundary's edges to reach previous vertices
  *previous(): Generator<Node> {
    yield* this.initial.continuationVertices();
  }

  // first: follow all initial chains to find nodes with no predecessor
  *first(): Generator<Node> {
    let hasAny = false;
    for (const prev of this.previous()) {
      hasAny = true;
      yield* prev.first();
    }
    if (!hasAny) yield this; // No predecessor: this IS a first
  }

  // last: follow all terminal chains to find nodes with no successor
  *last(): Generator<Node> {
    let hasAny = false;
    for (const nxt of this.next()) {
      hasAny = true;
      yield* nxt.last();
    }
    if (!hasAny) yield this; // No successor: this IS a last
  }

  // forward: iterate forward from this Node (generator — could be infinite)
  // Uses a simple visited set to avoid infinite loops in cyclic graphs
  *forward(visited: Set<Node> = new Set()): Generator<Node> {
    if (visited.has(this)) return;
    visited.add(this);
    yield this;
    for (const nxt of this.next()) {
      yield* nxt.forward(visited);
    }
  }

  // backward: iterate backward from this Node
  *backward(visited: Set<Node> = new Set()): Generator<Node> {
    if (visited.has(this)) return;
    visited.add(this);
    yield this;
    for (const prev of this.previous()) {
      yield* prev.backward(visited);
    }
  }

  // push: connect a new Node after this one via boundaries/edges
  push(node: Node): Node {
    const edge = new BoundaryEdge(this.terminal, node.initial);
    this.terminal.addEdge(edge);
    node.initial.addEdge(edge);
    return node;
  }

  // unshift: connect a new Node before this one
  unshift(node: Node): Node {
    const edge = new BoundaryEdge(node.terminal, this.initial);
    node.terminal.addEdge(edge);
    this.initial.addEdge(edge);
    return node;
  }

  // --- Property access ---

  // Direct lookup only — no inheritance chain, no class fallback
  getDirect(key: string | Node): Node | null {
    return this._methods.get(key) ?? null;
  }

  set(key: string | Node, value: Node): Node {
    this._methods.set(key, value);
    return value;
  }

  get(key: string | Node, visited: Set<Node> = new Set()): Node | null {
    if (visited.has(this)) return null;
    visited.add(this);

    // Direct lookup (fast path)
    const direct = this._methods.get(key);
    if (direct) return direct;

    if (typeof key === 'string') {
      // Check alias keys: if a stored key node has multiple names (via |)
      for (const [k, v] of this._methods) {
        if (k instanceof Node && k.matchesName(key)) return v;
      }
      // Check silent components (e.g., Context — invisible to ##)
      for (const component of this.silentComponents()) {
        const result = component.get(key, visited);
        if (result !== null) return result;
      }
      // Check class components for inherited properties
      for (const component of this.classComponents()) {
        const result = component.get(key, visited);
        if (result !== null) return result;
      }
      // Check type (class) for inherited methods
      if (this.type && !visited.has(this.type)) {
        const result = this.type.get(key, visited);
        if (result !== null) return result;
      }
      // Fallback: everything is a Node (*), check Node class
      if (Node._NODE_CLASS && !visited.has(Node._NODE_CLASS)) {
        const result = Node._NODE_CLASS.get(key, visited);
        if (result !== null) return result;
      }
    } else {
      // Node key: use ==.instance_of matching
      for (const [k, v] of this._methods) {
        if (k === key) return v;
        if (k instanceof Node && key.instanceOf(k)) return v;
      }
    }

    return null;
  }

  // Check if a string matches this node's name (including aliases via |)
  matchesName(name: string): boolean {
    if (this.encoded === name) return true;
    if (this.name === name) return true;
    for (const sup of this.superposed()) {
      if (sup !== this && (sup.encoded === name || sup.name === name)) return true;
    }
    return false;
  }

  // Count methods (for debug output)
  get methodCount(): number {
    return this._methods.size;
  }

  // --- ==.instance_of — THE core operation ---
  // This IS the unification of parsing and type checking.

  instanceOf(type: Node): boolean {
    if (this === type) return true;

    // Wildcard Node/* matches everything
    if (type.isClass && (type.name === '*' || type.name === 'Node')) return true;

    // Same encoded value
    if (this.encoded !== UNKNOWN && type.encoded !== UNKNOWN && this.encoded === type.encoded) return true;

    // Type is a class: check type hierarchy
    if (type.isClass) {
      // Direct type match
      if (this.type === type) return true;
      // Check if this node's type inherits from type
      if (this.type && this.type.isClass) {
        for (const comp of this.type.classComponents()) {
          if (comp === type) return true;
        }
      }
      // Check this node's own class components
      for (const component of this.classComponents()) {
        if (component === type) return true;
      }
      // Check class name match
      if (type.name) {
        if (this.name === type.name) return true;
        if (this.type?.name === type.name) return true;
      }
    }

    // String type checking: "hello" instanceof String
    if (type.name === 'String' && typeof this.encoded === 'string') return true;
    if (type.name === 'Number' && typeof this.encoded === 'number') return true;
    if (type.name === 'boolean' && typeof this.encoded === 'boolean') return true;

    // Structural pattern matching: match against the methods of the type
    // If type has methods, check that this has matching methods
    if (type.methodCount > 0 && !type.isClass) {
      let allMatch = true;
      for (const [key] of type.methods()) {
        if (typeof key === 'string' && this.get(key) === null) {
          allMatch = false;
          break;
        }
      }
      if (allMatch && type.methodCount > 0) return true;
    }

    // Type superposition: if type has OR edges, ANY must match; if AND edges, ALL must match
    {
      const orMembers: Node[] = [];
      const andMembers: Node[] = [];
      for (const [n, e] of type.superposedWithEdges()) {
        if (e === '|') orMembers.push(n);
        else if (e === '&') andMembers.push(n);
      }
      if (andMembers.length > 0) {
        // ALL AND members must match
        let allMatch = true;
        for (const m of andMembers) { if (!this.instanceOf(m)) { allMatch = false; break; } }
        if (allMatch) return true;
      }
      if (orMembers.length > 0) {
        // ANY OR member must match
        for (const m of orMembers) { if (this.instanceOf(m)) return true; }
      }
    }

    // Superposition: if this is superposed, check if ANY alternative matches
    for (const alt of this.terminal.continuationVertices(e => e.value === '|' || e.value === '&')) {
      if (alt.instanceOf(type)) return true;
    }

    return false;
  }

  // Expose methods iterator for structural matching
  *methods(): Generator<[string | Node, Node]> {
    yield* this._methods.entries();
  }

  // --- as — type conversion ---

  as(targetType: Node): Node | null {
    if (targetType.name === 'boolean' || targetType.matchesName('boolean')) {
      return this.isNone ? Node.FALSE : Node.TRUE;
    }
    if (targetType.name === 'String' || targetType.matchesName('String')) {
      return new Node(String(this.encoded));
    }
    if (targetType.name === 'Number' || targetType.matchesName('Number')) {
      return new Node(Number(this.encoded));
    }
    return null;
  }

  // --- Utility ---

  toString(): string {
    if (this.isNone) return 'None';
    if (this.name) return `<class ${this.name}>`;
    if (typeof this.encoded === 'string') return this.encoded;
    if (typeof this.encoded === 'number') return String(this.encoded);
    if (typeof this.encoded === 'boolean') return String(this.encoded);
    if (this.encoded === UNKNOWN) return '<unknown>';
    return '<Node>';
  }

  // --- Static constructors ---

  static string(s: string): Node { return new Node(s); }
  static number(n: number): Node { return new Node(n); }
  static boolean(b: boolean): Node { return b ? Node.TRUE : Node.FALSE; }

  // Build a Node chain from an array of values
  static from(values: any[]): Node | null {
    if (values.length === 0) return null;
    const first = new Node(values[0]);
    let current = first;
    for (let i = 1; i < values.length; i++) {
      const next = new Node(values[i]);
      current.push(next);
      current = next;
    }
    return first;
  }

  // Create a non-destructive superposition of two nodes with typed edge
  // Returns a new node whose superposed() yields all values from both
  static superpose(a: Node, b: Node, edge: EdgeKind): Node {
    // Re-create a's superposition chain (cloned), then link b directly.
    // Flattens a (extends the left chain), but preserves b's internal structure
    // so nested superpositions like 1 | (2 & 3) keep their typed edges.
    const head = new Node(a.encoded);
    head.type = a.type;
    head.name = a.name;
    if (a.isClass) head.set('static', head);

    // Clone a's existing superposition chain
    let tail = head;
    let first = true;
    for (const [node, e] of a.superposedWithEdges()) {
      if (first) { first = false; continue; } // skip head (already cloned)
      const clone = new Node(node.encoded);
      clone.type = node.type;
      clone.name = node.name;
      if (node.isClass) clone.set('static', clone);
      if ((e || '|') === '|') tail.or(clone);
      else tail.and(clone);
      tail = clone;
    }

    // Link b directly (not flattened) — preserves b's boundary structure
    if (edge === '|') tail.or(b);
    else tail.and(b);
    return head;
  }

  // --- Singletons ---
  static NONE: Node;
  static TRUE: Node;
  static FALSE: Node;
  static _NODE_CLASS: Node | null = null;  // Set by Bootstrap to the * class
}

// ============================================================================
// Boundary & Edge — structural components of Node
// ============================================================================

class Boundary {
  vertex: Node;                  // ∙ — the Node this boundary belongs to
  private _edges: BoundaryEdge[] = [];  // ⊙ — connections (can be multiple for graph branching)

  constructor(vertex: Node) {
    this.vertex = vertex;
  }

  addEdge(edge: BoundaryEdge): void {
    this._edges.push(edge);
  }

  // Iterate all edges on this boundary
  *edges(): Generator<BoundaryEdge> {
    yield* this._edges;
  }

  // continuation: follow edges to reach other boundaries (excluding self)
  // ⊙⊢#{!= this}
  *continuation(filter?: (edge: BoundaryEdge) => boolean): Generator<Boundary> {
    for (const edge of this._edges) {
      if (filter && !filter(edge)) continue;
      if (edge.from !== this) yield edge.from;
      if (edge.to !== this) yield edge.to;
    }
  }

  // Follow continuations all the way to vertices
  *continuationVertices(filter?: (edge: BoundaryEdge) => boolean): Generator<Node> {
    for (const boundary of this.continuation(filter)) {
      yield boundary.vertex;
    }
  }
}

class BoundaryEdge {
  from: Boundary;   // The boundary this edge comes from
  to: Boundary;     // The boundary this edge goes to
  value: any;       // Data on the edge

  constructor(from: Boundary, to: Boundary, value: any = undefined) {
    this.from = from;
    this.to = to;
    this.value = value;
  }
}

// Initialize singletons (after Boundary is defined, since Node constructor needs it)
Node.NONE = new Node(NONE_SENTINEL);
Node.NONE.name = 'None';
Node.TRUE = new Node(true);
Node.TRUE.name = 'true';
Node.FALSE = new Node(false);
Node.FALSE.name = 'false';


// ============================================================================
// Program and Context
// ============================================================================

class Context {
  local: Node;
  program: Program;
  parent: Context | null;
  self: Node;         // 'this' reference

  constructor(program: Program, parent: Context | null = null, self?: Node) {
    this.local = new Node();
    // 'local' comes from a silent Context component — invisible to ##/classComponents
    const ctx = new Node();
    ctx.set('local', this.local);
    this.local.addSilentComponent(ctx);
    this.program = program;
    this.parent = parent;
    this.self = self || this.local;
  }

  resolve(name: string): Node | null {
    if (name === 'this') return this.self;
    if (name === '&') return this.program as Node;
    // Direct lookup first (own scope)
    const local = this.local.getDirect(name);
    if (local !== null) return local;
    // Silent components (e.g., Context provides 'local')
    for (const component of this.local.silentComponents()) {
      const result = component.get(name);
      if (result !== null) return result;
    }
    // Visible component chain (e.g., global inherits from Node)
    for (const component of this.local.classComponents()) {
      const result = component.get(name);
      if (result !== null) return result;
    }
    if (this.parent) return this.parent.resolve(name);
    return null;
  }

  define(name: string, value: Node): Node {
    return this.local.set(name, value);
  }

  // Create a child context (for function calls, blocks)
  child(self?: Node): Context {
    return new Context(this.program, this, self || this.self);
  }
}

class Program extends Node {
  expression: string;
  context: Context;
  private _expanded: Program[] | null = null;
  _parsedExpr: Expr | null = null;
  _paramNames: string[] = [];
  file: string = '<eval>';
  lineOffset: number = 0;  // offset to add to token line numbers (for body extracted from .ray)
  colOffset: number = 0;   // offset to add to first-line token col numbers

  constructor(expression: string = '', parent: Context | null = null) {
    super();
    this.expression = expression;
    this.context = new Context(this, parent);
  }

  // expand: break into sub-programs (generator — could be infinite)
  *expand(): Generator<Program> {
    if (this._expanded !== null) {
      yield* this._expanded;
      return;
    }
    yield this;
  }

  setExpanded(programs: Program[]): void {
    this._expanded = programs;
  }

  // Arguments: vertex to the LEFT (via initial boundary)
  *args(): Generator<Node> {
    yield* this.previous();
  }

  // Result: vertex to the RIGHT (via terminal boundary)
  *result(): Generator<Node> {
    yield* this.next();
  }

  // Set the result by pushing a node after this program
  setResult(value: Node): void {
    let hasNext = false;
    for (const nxt of this.next()) {
      nxt.encoded = value.encoded;
      hasNext = true;
      break;
    }
    if (!hasNext) {
      this.push(value);
    }
  }

  // Evaluate this program
  eval(self?: Node, callArgs?: Node[]): Node {
    if (!this.expression && !this._parsedExpr) return Node.NONE;

    const evalCtx = self ? this.context.child(self) : this.context;

    // Bind call arguments to parameter names
    if (callArgs && this._paramNames.length > 0) {
      for (let i = 0; i < Math.min(callArgs.length, this._paramNames.length); i++) {
        evalCtx.define(this._paramNames[i], callArgs[i]);
      }
    }

    try {
      if (!this._parsedExpr && this.expression) {
        const tokens = tokenize(this.expression);
        this._parsedExpr = new ExprParser(tokens, this.file, this.lineOffset, this.colOffset).parse();
      }
      if (this._parsedExpr) {
        const result = evalExpr(this._parsedExpr, evalCtx);
        this.setResult(result);
        return result;
      }
    } catch (e) {
      // Fallback: return expression as string
    }
    return Node.string(this.expression);
  }
}


// ============================================================================
// Bootstrap Parser
// ============================================================================

// Minimal token types — no hardcoded keywords, operators, or single-char mappings.
// Structural delimiters ()[]{} get their own types for nesting. Everything else is
// either Word (Unicode letters/digits/marks/connectors) or Symbol (greedy groups).
enum TokenType {
  Word = 'Word',       // Unicode \p{L}, \p{Pc}, \p{M}, \p{Nd} (+ continuation: - ')
  Symbol = 'Symbol',   // Everything else non-structural, non-quote, non-whitespace
  Number = 'Number',
  String = 'String',
  LParen = '(', RParen = ')',
  LBracket = '[', RBracket = ']',
  LBrace = '{', RBrace = '}',
  Newline = 'Newline', EOF = 'EOF', Comment = 'Comment',
}

interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
  indent: number;
}

// Unicode character classification — no hardcoded keywords, operators, or Latin-only restrictions.
// Full Unicode support: any script for identifiers, any symbols for operators.

function isWordStart(ch: string): boolean {
  if (!ch) return false;
  return /^[\p{L}\p{Pc}]$/u.test(ch);
}

function isWordCont(ch: string): boolean {
  if (!ch) return false;
  return /^[\p{L}\p{Pc}\p{M}\p{Nd}]$/u.test(ch) || ch === '-' || ch === '\'';
}

function isDigitStart(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

const STRUCTURAL_DELIMITERS = new Set('()[]{}');

function isSymbolChar(ch: string): boolean {
  if (!ch || ch <= ' ') return false;
  if (STRUCTURAL_DELIMITERS.has(ch)) return false;
  if (ch === '"' || ch === '`') return false;
  if (ch === ',') return false;  // comma is always a separate token (separator, not operator)
  if (isWordStart(ch)) return false;
  if (isDigitStart(ch)) return false;
  return true;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0, line = 1, col = 1, lineStart = 0;

  const peek = (offset = 0): string => source[pos + offset] ?? '';
  const advance = (): string => {
    const ch = source[pos++];
    if (ch === '\n') { line++; col = 1; lineStart = pos; } else col++;
    return ch;
  };
  const lineIndent = (): number => {
    let indent = 0, p = lineStart;
    while (p < source.length && source[p] === ' ') { indent++; p++; }
    return indent;
  };

  while (pos < source.length) {
    const ch = peek();
    const indent = lineIndent();

    if (ch === '\r') { advance(); continue; }

    if (ch === '\n') {
      advance();
      if (tokens.length === 0 || tokens[tokens.length - 1].type !== TokenType.Newline) {
        tokens.push({ type: TokenType.Newline, value: '\n', line, col: 1, indent });
      }
      continue;
    }

    if (ch === ' ' || ch === '\t') { advance(); continue; }

    // Comments: //
    if (ch === '/' && peek(1) === '/') {
      const sl = line, sc = col; let comment = '';
      while (pos < source.length && peek() !== '\n') comment += advance();
      tokens.push({ type: TokenType.Comment, value: comment, line: sl, col: sc, indent });
      continue;
    }

    // Comments: /* ... */
    if (ch === '/' && peek(1) === '*') {
      const sl = line, sc = col; let comment = '';
      advance(); advance();
      while (pos < source.length && !(peek() === '*' && peek(1) === '/')) comment += advance();
      if (pos < source.length) { advance(); advance(); }
      tokens.push({ type: TokenType.Comment, value: comment, line: sl, col: sc, indent });
      continue;
    }

    // String literals: "..."
    if (ch === '"') {
      const sl = line, sc = col; advance(); let str = '';
      while (pos < source.length && peek() !== '"') {
        if (peek() === '\\') str += advance();
        str += advance();
      }
      if (pos < source.length) advance();
      tokens.push({ type: TokenType.String, value: str, line: sl, col: sc, indent });
      continue;
      
    }

    // String literals: `...`
    if (ch === '`') {
      const sl = line, sc = col; advance(); let str = '';
      while (pos < source.length && peek() !== '`') {
        if (peek() === '\\') str += advance();
        str += advance();
      }
      if (pos < source.length) advance();
      tokens.push({ type: TokenType.String, value: str, line: sl, col: sc, indent });
      continue;
    }

    // Numbers: digit-start characters
    if (isDigitStart(ch)) {
      const sl = line, sc = col; let num = '';
      while (pos < source.length && (
        (peek() >= '0' && peek() <= '9') || peek() === '.' || peek() === '_' ||
        peek() === 'x' || peek() === 'b' || peek() === 'o' ||
        (peek() >= 'a' && peek() <= 'f') || (peek() >= 'A' && peek() <= 'F')
      )) num += advance();
      tokens.push({ type: TokenType.Number, value: num, line: sl, col: sc, indent });
      continue;
    }

    // Structural delimiters: ()[]{} — always single-character tokens
    if (STRUCTURAL_DELIMITERS.has(ch)) {
      const sl = line, sc = col;
      const single = advance();
      const type = ({
        '(': TokenType.LParen, ')': TokenType.RParen,
        '[': TokenType.LBracket, ']': TokenType.RBracket,
        '{': TokenType.LBrace, '}': TokenType.RBrace,
      } as Record<string, TokenType>)[single]!;
      tokens.push({ type, value: single, line: sl, col: sc, indent });
      continue;
    }

    // Word tokens: Unicode letters, marks, connector punctuation, digits (greedy)
    if (isWordStart(ch)) {
      const sl = line, sc = col; let word = '';
      while (pos < source.length && isWordCont(peek())) word += advance();
      tokens.push({ type: TokenType.Word, value: word, line: sl, col: sc, indent });
      continue;
    }

    // Comma: always a single-character Symbol token (separator, never grouped with operators)
    if (ch === ',') {
      const sl = line, sc = col;
      advance();
      tokens.push({ type: TokenType.Symbol, value: ',', line: sl, col: sc, indent });
      continue;
    }

    // Symbol tokens: everything else, greedy grouping by consecutive symbol chars
    if (isSymbolChar(ch)) {
      const sl = line, sc = col; let sym = '';
      while (pos < source.length && isSymbolChar(peek())) sym += advance();
      tokens.push({ type: TokenType.Symbol, value: sym, line: sl, col: sc, indent });
      continue;
    }

    // Unknown character — skip
    advance();
  }

  tokens.push({ type: TokenType.EOF, value: '', line, col, indent: 0 });
  return tokens;
}

// --- AST ---

interface ASTNode {
  kind: string;
  tokens: Token[];
  children: ASTNode[];
  indent: number;
  line: number;
  file?: string;
  name?: string;
  names?: string[];
  params?: ASTNode[];
  body?: ASTNode[];
  parent?: string;
  components?: string[];
  modifiers?: string[];
  type?: string;
  defaultValue?: string;
  rawText?: string;
}

function buildAST(tokens: Token[]): ASTNode[] {
  const roots: ASTNode[] = [];
  const stack: { node: ASTNode; indent: number }[] = [];

  const lines: Token[][] = [];
  let currentLine: Token[] = [];

  for (const token of tokens) {
    if (token.type === TokenType.Newline || token.type === TokenType.EOF) {
      if (currentLine.length > 0) { lines.push(currentLine); currentLine = []; }
    } else if (token.type !== TokenType.Comment || currentLine.length > 0) {
      currentLine.push(token);
    }
  }

  for (const line of lines) {
    const nonComment = line.filter(t => t.type !== TokenType.Comment);
    if (nonComment.length === 0) continue;

    const indent = nonComment[0].indent;
    const node: ASTNode = {
      kind: 'statement', tokens: line, children: [], indent,
      line: line[0].line, rawText: line.map(t => t.value).join(' '),
    };

    classifyStatement(node);

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1].node.children.push(node);
    stack.push({ node, indent });
  }

  return roots;
}

function classifyStatement(node: ASTNode): void {
  const tokens = node.tokens.filter(t => t.type !== TokenType.Comment);
  if (tokens.length === 0) return;

  // Collect leading modifiers (static, external, dynamically, etc.)
  const modifiers: string[] = [];
  let i = 0;
  while (i < tokens.length && isModifier(tokens[i].value)) { modifiers.push(tokens[i].value); i++; }
  if (modifiers.length > 0) node.modifiers = modifiers;
  if (i >= tokens.length) return;

  const first = tokens[i];

  if (first.value === 'class') {
    node.kind = 'class';
    // Re-slice tokens starting from 'class' for parseClassHeader
    parseClassHeader(node, tokens.slice(i));
  } else {
    node.kind = 'definition';
    parseDefinition(node, tokens, i);
  }
}

function isModifier(value: string): boolean {
  return value === 'external';
}

// Check if a token is a real delimiter/operator with the given value (not a string literal).
// String literals like `(` have value '(' but type String — they must be excluded from
// structural checks that look for actual parentheses/brackets/braces.
function isDelim(t: Token, v: string): boolean {
  return t.value === v && t.type !== TokenType.String;
}

// Parse: class Name | Alias < Parent &+ Mixin
// Also handles: class Name | Alias (constructor_params) < Parent
function parseClassHeader(node: ASTNode, tokens: Token[]): void {
  const names: string[] = [];
  let i = 1;

  // Parse name(s) separated by |
  // Stop at: <, (, =, {, &+, &, end of tokens
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.value === '<' || isDelim(t, '(') ||
        t.value === '=' || isDelim(t, '{') ||
        t.value === '&+' || t.value === '&') break;
    if (t.value === '|') { i++; continue; }
    if (t.type === TokenType.Word || t.value === '*') {
      names.push(t.value);
    }
    i++;
  }

  node.names = names;
  node.name = names[0] || '';

  // Skip constructor params if present: (...)
  if (i < tokens.length && isDelim(tokens[i], '(')) {
    let depth = 0;
    while (i < tokens.length) {
      if (isDelim(tokens[i], '(')) depth++;
      if (isDelim(tokens[i], ')')) depth--;
      i++;
      if (depth === 0) break;
    }
  }

  // Parse inheritance: < Parent &+ Mixin
  const components: string[] = [];
  if (i < tokens.length && tokens[i].value === '<') {
    i++;
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.type === TokenType.Word || t.value === '*') {
        components.push(t.value);
      }
      i++;
    }
  }
  node.components = components;
  node.parent = components[0] || undefined;
}


function parseDefinition(node: ASTNode, tokens: Token[], startIdx: number): void {
  const names: string[] = [];
  let i = startIdx;
  let nameTokens: Token[] = [];

  while (i < tokens.length) {
    const t = tokens[i];
    // Delimiters that end the name — but only after we have at least one name token.
    // This ensures operator names like '=', ':', '=>' are captured when they appear first.
    if (nameTokens.length > 0) {
      if (t.value === ':' && i + 1 < tokens.length && tokens[i + 1].value !== ':') break;
      if (t.value === '=>') break;
      if (t.value === '=' && tokens[i - 1]?.value !== '!') break;
    }
    if (isDelim(t, '(')) break;
    nameTokens.push(t);
    i++;
  }

  let currentName = '';
  for (const t of nameTokens) {
    if (t.value === '|') {
      // When | appears with empty currentName and no names yet, treat as literal name '|'
      if (!currentName.trim() && names.length === 0) {
        currentName = '|';
      } else {
        if (currentName.trim()) names.push(currentName.trim());
        currentName = '';
      }
    } else {
      currentName += (currentName ? ' ' : '') + t.value;
    }
  }
  if (currentName.trim()) names.push(currentName.trim());

  node.names = names;
  node.name = names[0] || '';

  if (i < tokens.length && tokens[i].value === ':') {
    i++;
    let typeStr = '';
    while (i < tokens.length && tokens[i].value !== '=' && tokens[i].value !== '=>') {
      typeStr += (typeStr ? ' ' : '') + tokens[i].value; i++;
    }
    node.type = typeStr.trim();
  }

  if (i < tokens.length && isDelim(tokens[i], '(')) {
    let depth = 0, paramStr = '';
    while (i < tokens.length) {
      if (isDelim(tokens[i], '(')) depth++;
      if (isDelim(tokens[i], ')')) depth--;
      paramStr += tokens[i].value; i++;
      if (depth === 0) break;
    }
    node.rawText = (node.rawText || '') + ' ' + paramStr;
  }

  if (i < tokens.length && tokens[i].value === '=>') {
    i++;
    let bodyStr = '';
    while (i < tokens.length) { bodyStr += (bodyStr ? ' ' : '') + tokens[i].value; i++; }
    node.defaultValue = bodyStr.trim();
  }

  if (i < tokens.length && tokens[i].value === '=') {
    i++;
    let valueStr = '';
    while (i < tokens.length) { valueStr += (valueStr ? ' ' : '') + tokens[i].value; i++; }
    node.defaultValue = valueStr.trim();
  }
}


// ============================================================================
// Expression AST, Parser & Evaluator
// ============================================================================

interface SourceLoc {
  file: string;
  line: number;
  col: number;
}

type Expr = (
  | { kind: 'string', value: string }
  | { kind: 'ident', name: string }
  | { kind: 'binary', op: string, left: Expr, right: Expr }
  | { kind: 'unary', op: string, operand: Expr }
  | { kind: 'sequence', exprs: Expr[] }
) & { loc?: SourceLoc }

// ============================================================================
// Grammar — built entirely from .ray files + externals during bootstrap
// ============================================================================
//
// Zero hardcoded operators. All grammar is discovered from:
//   1. Method definitions in .ray files (precedence = line number)
//   2. External methods registered on * (Node) class
//   3. Compound assignments generated from {operator}= pattern (Node.ray line 152)
//   4. Pattern definitions: {`(`, expr: *, `)`} => expr (delimiter rules)
//
// Precedence comes directly from definition line numbers in Node.ray.
// Higher line number = tighter binding. Structural levels (postfix, unary,
// juxtaposition) are set above the line-number range.

interface PatternElement {
  kind: 'literal' | 'binding';
  literal?: string;           // For 'literal': exact token to match
  name?: string;              // For 'binding': variable name
  type?: string;              // e.g., "*", "(): *", "\S[]"
  isThunk?: boolean;          // true when type is "(): *"
  isArray?: boolean;          // true when type ends with "*[]"
}

interface PatternRule {
  elements: PatternElement[];
  body: string | null;        // The => body expression (raw text)
  position: 'prefix' | 'postfix';
  triggerToken: string;       // First literal (for fast lookup)
  closingToken?: string;      // Last literal (for delimiter matching)
  line: number;
}

class Grammar {
  binaryOps: Map<string, { prec: number, assoc: 'left' | 'right' }> = new Map();
  prefixOps: Set<string> = new Set();
  postfixKeywords: Set<string> = new Set();
  breakKeywords: Set<string> = new Set();

  // Pattern rules: delimiter-based syntax discovered from .ray files
  // Key = trigger token (first literal in pattern, e.g., '(', '[', '{')
  prefixPatterns: Map<string, PatternRule[]> = new Map();   // atom-position patterns
  postfixPatterns: Map<string, PatternRule[]> = new Map();  // postfix patterns (have implicit 'this')

  // Delimiter pairs derived from patterns: opener → closer
  // e.g., '{' → '}', '(' → ')', '[' → ']'
  openerToCloser: Map<string, string> = new Map();
  closerToOpener: Map<string, string> = new Map();

  // Rebuild delimiter maps from registered patterns
  rebuildDelimiters(): void {
    this.openerToCloser.clear();
    this.closerToOpener.clear();
    const scan = (patterns: Map<string, PatternRule[]>) => {
      for (const rules of patterns.values()) {
        for (const rule of rules) {
          if (rule.triggerToken && rule.closingToken && rule.triggerToken !== rule.closingToken) {
            this.openerToCloser.set(rule.triggerToken, rule.closingToken);
            this.closerToOpener.set(rule.closingToken, rule.triggerToken);
          }
        }
      }
    };
    scan(this.prefixPatterns);
    scan(this.postfixPatterns);
  }

  // Track delimiter balance across a token stream using a stack.
  // Returns the stack (empty = balanced).
  balanceStack(tokens: Token[]): string[] {
    const stack: string[] = [];
    for (const t of tokens) {
      if (this.openerToCloser.has(t.value)) stack.push(t.value);
      else if (this.closerToOpener.has(t.value)) {
        if (stack.length > 0 && stack[stack.length - 1] === this.closerToOpener.get(t.value)) {
          stack.pop();
        }
      }
    }
    return stack;
  }

  // Update a stack in-place for a single token. Returns the stack.
  trackToken(stack: string[], t: Token): string[] {
    if (this.openerToCloser.has(t.value)) stack.push(t.value);
    else if (this.closerToOpener.has(t.value)) {
      if (stack.length > 0 && stack[stack.length - 1] === this.closerToOpener.get(t.value)) {
        stack.pop();
      }
    }
    return stack;
  }

  // Structural precedence levels — above any .ray line number range
  static readonly NONE = 0;
  static readonly POSTFIX = 1000;
  static readonly UNARY = 900;
  static readonly JUXTAPOSITION = 800;

  sequencePrec = 0;
  conditionalPrec = 0;
}

let activeGrammar: Grammar = new Grammar();

function isOperatorName(name: string): boolean {
  if (!name) return false;
  return !isWordStart(name[0]!) && !isDigitStart(name[0]!);
}

// Default precedences for operators discovered from externals (no .ray definition).
// These approximate standard language precedences. Once defined in .ray,
// the .ray line number takes over (buildGrammarFromAST scans .ray first).
function defaultOperatorPrec(op: string): number {
  // Assignment (lowest)
  if (op === '=' || op === '=>') return 10;
  // Ternary/conditional
  if (op === '?') return 15;
  // Logical OR / AND
  if (op === '|') return 20;
  if (op === '&') return 25;
  // Equality
  if (op === '==' || op === '!=') return 30;
  // Comparison
  if (op === '<' || op === '>' || op === '<=' || op === '>=') return 35;
  // Composition / extend
  if (op === '&+' || op === '<>') return 40;
  // Range
  if (op === '..') return 45;
  // Additive
  if (op === '+' || op === '-') return 50;
  // Multiplicative
  if (op === '*' || op === '/' || op === '%') return 60;
  // Power
  if (op === '**') return 70;
  // Dot / member access
  if (op === '.') return 80;
  // Type annotation
  if (op === ':') return 90;
  // Default for unknown operators
  return 40;
}

// Parse a pattern definition from the tokens of an AST node whose name starts with '{'.
// Extracts the elements between the outermost { } of the definition name, and the => body.
//
// Example: {`{`, expr: (): *, `}`} => expr<local: local>; local
//   tokens: { `{` , expr : ( ) : * , `}` } => expr < local : local > ; local
//   elements: [literal "{", binding "expr" (thunk), literal "}"]
//   body: "expr<local: local>; local"
//
// Example: {`(`, expr: *, `)`} => expr
//   elements: [literal "(", binding "expr" (*), literal ")"]
//   body: "expr"
//
// Returns null if the tokens don't form a valid pattern definition.
// inClass: true when this definition is inside a class body (postfix by default)
function parsePatternDef(node: ASTNode, inClass: boolean = false): PatternRule | null {
  const tokens = node.tokens.filter(t => t.type !== TokenType.Comment);
  if (tokens.length === 0) return null;

  let isPostfix = inClass;
  let startIdx = 0;

  // Skip leading modifiers (external, static, etc.)
  while (startIdx < tokens.length && isModifier(tokens[startIdx].value)) startIdx++;

  // Must start with { — the ONE hardcoded construct (pattern definition delimiters).
  // String literals like `{` have value '{' but type String — exclude them.
  const isBrace = (t: Token, v: string) => t.value === v && t.type !== TokenType.String;

  if (startIdx >= tokens.length || !isBrace(tokens[startIdx], '{')) return null;

  // Parse consecutive {block} groups. Patterns can span multiple blocks:
  //   {"."}{property: \S[]}   — literal "." then binding
  //   {.}{block: (): *}       — {.} postfix marker then binding
  //   {`(`, expr: *, `)`}     — single block with open/close delimiters
  const elements: PatternElement[] = [];
  let lastBlockEnd = startIdx;

  while (startIdx < tokens.length && isBrace(tokens[startIdx], '{')) {
    // Find matching }
    let depth = 0;
    let endIdx = startIdx;
    for (let k = startIdx; k < tokens.length; k++) {
      if (isBrace(tokens[k], '{')) depth++;
      if (isBrace(tokens[k], '}')) {
        depth--;
        if (depth === 0) { endIdx = k; break; }
      }
    }
    if (depth !== 0) return null;

    // Check for {.} postfix marker: single non-string "." inside braces
    const blockTokens = tokens.slice(startIdx + 1, endIdx);
    if (blockTokens.length === 1 && blockTokens[0].value === '.' && blockTokens[0].type !== TokenType.String) {
      isPostfix = true;
      lastBlockEnd = endIdx;
      startIdx = endIdx + 1;
      continue;
    }

    // Parse elements inside this block
    let i = startIdx + 1;
    while (i < endIdx) {
      const t = tokens[i];

      if (t.value === ',') { i++; continue; }

      // String literal → literal element
      if (t.type === TokenType.String) {
        elements.push({ kind: 'literal', literal: t.value });
        i++;
        continue;
      }

      // Check for binding: a word followed by : (type annotation) or standalone
      // Bindings are identifiers — not operators, not delimiters
      if (t.type === TokenType.Word) {
        const name = t.value;
        i++;

        if (i < endIdx && tokens[i].value === ':') {
          i++; // skip :

          let typeStr = '';
          let isThunk = false;
          let isArray = false;

          // Check for (): pattern (thunk type) — by value, not token type
          if (i + 2 < endIdx && isDelim(tokens[i], '(') && isDelim(tokens[i + 1], ')') && tokens[i + 2].value === ':') {
            isThunk = true;
            i += 3; // skip ( ) :
          }

          // Collect type tokens until comma or end of block
          while (i < endIdx && tokens[i].value !== ',') {
            typeStr += tokens[i].value;
            i++;
          }
          typeStr = typeStr.trim();

          // *[] means array binding (comma-separated list)
          if (typeStr === '*[]') {
            isArray = true;
            typeStr = '*';
          }

          elements.push({ kind: 'binding', name, type: typeStr || '*', isThunk, isArray });
        } else {
          elements.push({ kind: 'binding', name, type: '*' });
        }
        continue;
      }

      i++;
    }

    lastBlockEnd = endIdx;
    startIdx = endIdx + 1;
  }

  // Need at least one element
  if (elements.length === 0) return null;

  // For delimiter patterns (like `(`...`)`) require open+close literals and a binding.
  // For non-delimiter patterns (like `"."`+binding), just need a literal and a binding.
  const literals = elements.filter(e => e.kind === 'literal');
  const bindings = elements.filter(e => e.kind === 'binding');
  if (literals.length === 0 || bindings.length === 0) return null;

  const triggerToken = literals[0].literal!;
  const closingToken = literals.length > 1 ? literals[literals.length - 1].literal : undefined;

  // Find => body (everything after last } =>)
  let body: string | null = null;
  let bodyIdx = lastBlockEnd + 1;
  while (bodyIdx < tokens.length && tokens[bodyIdx].value !== '=>') bodyIdx++;
  if (bodyIdx < tokens.length && tokens[bodyIdx].value === '=>') {
    bodyIdx++;
    const bodyParts: string[] = [];
    while (bodyIdx < tokens.length) {
      bodyParts.push(tokens[bodyIdx].value);
      bodyIdx++;
    }
    body = bodyParts.join(' ').trim() || null;
  }

  return {
    elements,
    body,
    position: isPostfix ? 'postfix' : 'prefix',
    triggerToken,
    closingToken,
    line: node.line,
  };
}

function buildGrammarFromAST(ast: ASTNode[]): Grammar {
  const g = new Grammar();
  const nodeChildren = findClassChildren(ast, ['*', 'Node']);

  const registerOp = (name: string, line: number, hasParams: boolean) => {
    if (!name) return;
    // Skip multi-word names (can't match single tokens) and structural chars
    if (!name.startsWith('{') && (name.includes(' ') || '{}()[]'.includes(name))) return;

    // Extract operators from {pattern} definitions (e.g., {"=>"?, ...} → =>)
    // Token values are already unquoted, so split the name to find operator parts
    if (name.startsWith('{')) {
      const structural = new Set(['.', ' ', '{', '}', '(', ')', '[', ']']);
      const parts = name.split(/[\s{},?:]+/).filter(Boolean);
      for (const part of parts) {
        if (!structural.has(part) && isOperatorName(part)) {
          g.binaryOps.set(part, { prec: line, assoc: 'left' });
        }
      }
      return;
    }

    // Non-operator word names: become postfix keywords if they have params
    if (!isOperatorName(name)) {
      if (hasParams) {
        g.postfixKeywords.add(name);
      }
      return;
    }

    // Operator: use latest definition's line as precedence (later = tighter)
    g.binaryOps.set(name, { prec: line, assoc: 'left' });

    // Also prefix candidate if no params (could be unary)
    if (!hasParams) {
      g.prefixOps.add(name);
    }
  };

  const registerPattern = (node: ASTNode, inClass: boolean) => {
    const rule = parsePatternDef(node, inClass);
    if (!rule) return;
    const map = rule.position === 'postfix' ? g.postfixPatterns : g.prefixPatterns;
    const existing = map.get(rule.triggerToken) || [];
    existing.push(rule);
    map.set(rule.triggerToken, existing);
  };

  const scanDefs = (nodes: ASTNode[], inClass: boolean = false) => {
    for (const node of nodes) {
      if (node.kind === 'class') {
        // Class children are scanned recursively (inside class body)
        scanDefs(node.children, true);
        continue;
      }
      if (node.kind !== 'definition') continue;
      const names = node.names || [node.name || ''];
      const hasParams = !!(node.rawText && node.rawText.includes('('));
      for (const name of names) {
        registerOp(name, node.line, hasParams);
      }
      // Try to register as a pattern definition (e.g., {`(`, expr: *, `)`} => expr)
      if (names.some(n => n.startsWith('{'))) {
        registerPattern(node, inClass);

        // Extract operators from String literals in pattern definitions.
        // e.g., {" "}({"=>"?, *}) has "=>" as a String token representing syntax.
        for (const tok of node.tokens) {
          if (tok.type === TokenType.String && tok.value.trim() && isOperatorName(tok.value)) {
            // Don't register structural delimiters as binary ops
            if ('{}()[]'.includes(tok.value)) continue;
            if (!g.binaryOps.has(tok.value)) {
              g.binaryOps.set(tok.value, { prec: node.line, assoc: 'left' });
            }
          }
        }
      }
      // Recurse into children for nested definitions
      if (node.children.length > 0) scanDefs(node.children);
    }
  };

  // Scan ALL definitions: global-level patterns + Node class body + other classes
  // (scanDefs recurses into class children, so this covers everything)
  scanDefs(ast);

  // Discover operators from externals on * (Node) class
  // When no .ray definitions exist, assign standard precedences
  if (Node._NODE_CLASS) {
    for (const [key] of Node._NODE_CLASS.methods()) {
      const name = typeof key === 'string' ? key : null;
      if (!name || g.binaryOps.has(name)) continue;
      if (name.includes(' ') || '{}()[]'.includes(name)) continue;
      if (isOperatorName(name)) {
        const prec = defaultOperatorPrec(name);
        const assoc = name === '=' || name === '=>' ? 'right' as const : 'left' as const;
        g.binaryOps.set(name, { prec, assoc });
        g.prefixOps.add(name);
      }
    }
  }

  // Compound assignment pattern (Node.ray line 152: {operator}=)
  // Generate {op}= for each discovered operator
  const assignInfo = g.binaryOps.get('=');
  if (assignInfo) {
    const compounds: string[] = [];
    for (const [op] of g.binaryOps) {
      if (op.includes('=') || op === ';') continue;
      const compound = op + '=';
      if (!g.binaryOps.has(compound)) compounds.push(compound);
    }
    for (const cop of compounds) {
      g.binaryOps.set(cop, { prec: assignInfo.prec, assoc: 'left' });
    }
  }

  // Derive sequencePrec from ';' definition
  const semi = g.binaryOps.get(';');
  if (semi) g.sequencePrec = semi.prec;

  // Postfix keywords (if/unless) → register as binary ops (body left, condition right)
  for (const kw of g.postfixKeywords) {
    for (const node of nodeChildren) {
      if (node.kind === 'definition' && node.names?.includes(kw)) {
        g.binaryOps.set(kw, { prec: node.line, assoc: 'right' });
        if (g.conditionalPrec === 0) g.conditionalPrec = node.line;
        break;
      }
    }
  }

  // Break keywords: derived from postfix keywords only (no hardcoded keywords)
  for (const kw of g.postfixKeywords) g.breakKeywords.add(kw);

  // Dot `.` is defined as a postfix pattern in Node.ray: {"."}{property: \S[]}
  // If the pattern registered successfully, no need for a binary op fallback.
  // Only register as binary op if no postfix pattern was found for '.'.
  if (!g.postfixPatterns.has('.') && !g.binaryOps.has('.')) {
    g.binaryOps.set('.', { prec: Grammar.POSTFIX, assoc: 'left' });
  }

  return g;
}

function findClassChildren(ast: ASTNode[], names: string[]): ASTNode[] {
  for (const node of ast) {
    if (node.kind === 'class' && node.names && node.names.some(n => names.includes(n)))
      return node.children;
    if (node.children.length > 0) {
      const found = findClassChildren(node.children, names);
      if (found.length > 0) return found;
    }
  }
  return [];
}

class ExprParser {
  private tokens: Token[];
  private pos: number = 0;
  private file: string;
  private lineOffset: number;
  private colOffset: number;

  constructor(tokens: Token[], file: string = '<eval>', lineOffset: number = 0, colOffset: number = 0) {
    this.tokens = tokens.filter(t =>
      t.type !== TokenType.Comment && t.type !== TokenType.Newline
    );
    this.file = file;
    this.lineOffset = lineOffset;
    this.colOffset = colOffset;
  }

  private loc(): SourceLoc {
    const t = this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1];
    const line = (t?.line ?? 0) + this.lineOffset;
    // Only apply col offset on the first line of the body
    const col = (t?.col ?? 0) + ((t?.line ?? 0) === 1 ? this.colOffset : 0);
    return { file: this.file, line, col };
  }

  private stamp<T extends Expr>(expr: T, loc: SourceLoc): T {
    expr.loc = loc;
    return expr;
  }

  parse(): Expr {
    if (this.tokens.length === 0 || (this.tokens.length === 1 && this.tokens[0].type === TokenType.EOF)) {
      return { kind: 'ident', name: 'None' };
    }
    const expr = this.parseExpr(Grammar.NONE);
    return expr;
  }

  private peek(): Token {
    return this.tokens[this.pos] ?? { type: TokenType.EOF, value: '', line: 0, col: 0, indent: 0 };
  }

  private advance(): Token {
    return this.tokens[this.pos++] ?? { type: TokenType.EOF, value: '', line: 0, col: 0, indent: 0 };
  }

  private at(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private atV(value: string): boolean {
    return this.peek().value === value;
  }

  private eat(type: TokenType): Token | null {
    if (this.at(type)) return this.advance();
    return null;
  }

  private eatV(value: string): Token | null {
    if (this.atV(value)) return this.advance();
    return null;
  }

  private expectV(value: string): Token {
    const t = this.advance();
    if (t.value !== value) throw new Error(`Expected "${value}" but got "${t.value}"`);
    return t;
  }

  private parseExpr(minPrec: number): Expr {
    let left = this.parseAtom();

    while (true) {
      const tok = this.peek();
      if (tok.type === TokenType.EOF) break;

      // --- Postfix operators (highest precedence) ---

      const ol = this.loc();  // operator location

      // Try postfix patterns FIRST (e.g., {.}{`(`, args: *[], `)`} => this(args))
      if (Grammar.POSTFIX >= minPrec) {
        const postfixMatch = this.tryPostfixPattern(left);
        if (postfixMatch) { left = postfixMatch; continue; }
      }

      // --- Binary operators (discovered from .ray grammar) ---
      const binEntry = activeGrammar.binaryOps.get(tok.value);
      if (binEntry) {
        const { prec, assoc } = binEntry;
        if (prec < minPrec) break;
        this.advance();
        const nextPrec = assoc === 'left' ? prec + 1 : prec;
        const right = this.parseExpr(nextPrec);
        left = this.stamp({ kind: 'binary', op: tok.value, left, right }, ol);
        continue;
      }

      // --- Line break as implicit sequence separator ---
      // If the next token is on a different source line than the previous one,
      // treat the line boundary as a statement separator (like `;`).
      {
        const prevTok = this.tokens[this.pos - 1];
        if (prevTok && tok.line !== prevTok.line && canStartExpr(tok) && activeGrammar.sequencePrec >= minPrec) {
          const right = this.parseExpr(activeGrammar.sequencePrec + 1);
          if (left.kind === 'sequence') { left.exprs.push(right); }
          else { left = this.stamp({ kind: 'sequence', exprs: [left, right] }, ol); }
          continue;
        }
      }

      // --- Juxtaposition: space as property access (same line only) ---
      // `a b` → property access: evaluate b, use as key, get on a
      if (canStartExpr(tok) && Grammar.JUXTAPOSITION >= minPrec) {
        if (activeGrammar.breakKeywords.has(tok.value)) break;
        const prevTok = this.tokens[this.pos - 1];
        if (prevTok && tok.line !== prevTok.line) break;
        const arg = this.parseExpr(Grammar.JUXTAPOSITION + 1);
        left = this.stamp({ kind: 'access', object: left, property: arg } as Expr, ol);
        continue;
      }

      break;
    }

    return left;
  }

  // Try to match a prefix pattern rule at the current position (atom position).
  // Returns the parsed expression if a pattern matches, or null if none match.
  private tryPrefixPattern(): Expr | null {
    const tok = this.peek();
    const patterns = activeGrammar.prefixPatterns.get(tok.value);
    if (!patterns) return null;

    for (const rule of patterns) {
      const savedPos = this.pos;
      try {
        const match = this.tryMatchPattern(rule);
        if (match) return match;
      } catch (e) {
        // Pattern match threw (e.g., unexpected token) — backtrack
      }
      this.pos = savedPos; // backtrack
    }
    return null;
  }

  // Try to match a postfix pattern rule at the current position.
  // 'left' is the already-parsed left-hand expression (becomes 'this' in the pattern).
  private tryPostfixPattern(left: Expr): Expr | null {
    const tok = this.peek();
    const patterns = activeGrammar.postfixPatterns.get(tok.value);
    if (!patterns) return null;

    for (const rule of patterns) {
      const savedPos = this.pos;
      try {
        const match = this.tryMatchPattern(rule, left);
        if (match) return match;
      } catch (e) {
        // Pattern match threw — backtrack
      }
      this.pos = savedPos; // backtrack
    }
    return null;
  }

  // Try to match a single pattern rule's elements against the token stream.
  // For postfix rules, leftExpr is the already-parsed expression before the trigger.
  private tryMatchPattern(rule: PatternRule, leftExpr?: Expr): Expr | null {
    const l = this.loc();
    const bindings: Map<string, Expr> = new Map();

    for (let ei = 0; ei < rule.elements.length; ei++) {
      const elem = rule.elements[ei];

      if (elem.kind === 'literal') {
        const tok = this.peek();
        if (tok.value !== elem.literal) return null;
        this.advance();
        continue;
      }

      if (elem.kind === 'binding') {
        // Determine what stops this binding: the next literal element's token
        let stopToken: string | null = null;
        for (let j = ei + 1; j < rule.elements.length; j++) {
          if (rule.elements[j].kind === 'literal') {
            stopToken = rule.elements[j].literal!;
            break;
          }
        }

        // Empty delimiter: stop token is the very next token → bind to None ident
        if (stopToken && this.peek().value === stopToken) {
          bindings.set(elem.name!, { kind: 'ident', name: 'None' } as Expr);
          continue;
        }

        if (elem.isArray) {
          // Parse comma-separated list until stop token
          const elements: Expr[] = [];
          while (!this.at(TokenType.EOF)) {
            if (stopToken && this.peek().value === stopToken) break;
            elements.push(this.parseExpr(activeGrammar.sequencePrec + 1));
            this.eatV(',');
          }
          bindings.set(elem.name!, { kind: 'sequence', exprs: elements, loc: l } as Expr);
        } else if (stopToken) {
          // Parse sequence of expressions until stop token (respecting nesting)
          const exprs: Expr[] = [];
          while (!this.at(TokenType.EOF) && this.peek().value !== stopToken) {
            exprs.push(this.parseExpr(Grammar.NONE));
            this.eatV(';');
          }
          if (exprs.length === 0) {
            bindings.set(elem.name!, { kind: 'ident', name: 'None' } as Expr);
          } else if (exprs.length === 1) {
            bindings.set(elem.name!, exprs[0]);
          } else {
            bindings.set(elem.name!, { kind: 'sequence', exprs, loc: l } as Expr);
          }
        } else {
          // No stop token and no closing delimiter — parse just one atom.
          // This handles patterns like {"."}{property: \S[]} where the binding
          // should capture only the next token, not chain into further operators.
          const expr = this.parseAtom();
          bindings.set(elem.name!, expr);
        }
        continue;
      }
    }

    // Pattern matched! Now produce the appropriate Expr based on the rule's body.
    // Strategy: produce existing Expr kinds to avoid evalExpr changes.

    if (rule.position === 'prefix') {
      return this.patternToExpr(rule, bindings, l);
    } else {
      // Postfix: leftExpr is implicitly 'this'
      return this.postfixPatternToExpr(rule, bindings, leftExpr!, l);
    }
  }

  // Convert a matched prefix pattern to an Expr, using the pattern's body.
  private patternToExpr(rule: PatternRule, bindings: Map<string, Expr>, l: SourceLoc): Expr {
    // Find the bound expression
    let bound: Expr | null = null;
    if (rule.body && bindings.size === 1) {
      const bodyName = rule.body.split(/[^a-zA-Z_]/)[0];
      bound = bindings.get(bodyName) ?? null;
    }
    if (!bound) {
      for (const [, expr] of bindings) { bound = expr; break; }
    }
    if (!bound) return this.stamp({ kind: 'ident', name: 'None' } as Expr, l);

    // () is grouping — just return the inner expression
    if (rule.triggerToken === '(' && rule.closingToken === ')') return bound;

    // Everything else: wrap in unary with the delimiter pair as op
    // e.g., [elements] → unary('[]', sequence), {body} → unary('{}', body)
    const op = (rule.triggerToken || '') + (rule.closingToken || '');
    return this.stamp({ kind: 'unary', op, operand: bound } as Expr, l);
  }

  // Convert a matched postfix pattern to an Expr.
  // All postfix patterns are property access — evaluate the binding, use as key, get on left.
  private postfixPatternToExpr(rule: PatternRule, bindings: Map<string, Expr>, left: Expr, l: SourceLoc): Expr {
    const values = [...bindings.values()];
    const right: Expr = values.length === 1 ? values[0] : { kind: 'sequence', exprs: values };
    return this.stamp({ kind: 'access', object: left, property: right } as Expr, l);
  }

  private parseAtom(): Expr {
    const tok = this.peek();
    const l = this.loc();

    // Prefix patterns from grammar (e.g., {`(`, expr: *, `)`} => expr)
    const prefixMatch = this.tryPrefixPattern();
    if (prefixMatch) return prefixMatch;

    // String literal (the one parser-level literal besides {PATTERN})
    if (tok.type === TokenType.String) {
      this.advance();
      return this.stamp({ kind: 'string', value: tok.value }, l);
    }

    // Everything else — identifier (resolved through scope + method dispatch)
    // Numbers, parens, brackets, braces — all handled by grammar patterns or dispatch.
    if (tok.type !== TokenType.EOF) {
      this.advance();
      return this.stamp({ kind: 'ident', name: tok.value }, l);
    }

    return this.stamp({ kind: 'ident', name: 'None' }, l);
  }
}

function canStartExpr(tok: Token): boolean {
  if (tok.type === TokenType.EOF) return false;
  // Closing delimiters don't start expressions — they terminate patterns
  if (activeGrammar.closerToOpener.has(tok.value)) return false;
  // Binary operators don't start expressions (they're infix)
  // Exception: operators that are also prefix ops, or prefix patterns
  if (activeGrammar.binaryOps.has(tok.value) &&
      !activeGrammar.prefixOps.has(tok.value) &&
      !activeGrammar.prefixPatterns.has(tok.value)) return false;
  return true;
}

// --- Expression Evaluator ---

// ANSI color helpers
const c = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  boldRed: (s: string) => `\x1b[1;31m${s}\x1b[0m`,
  boldYellow: (s: string) => `\x1b[1;33m${s}\x1b[0m`,
  underline: (s: string) => `\x1b[4m${s}\x1b[0m`,
};

// Runtime error log — collected during evaluation
interface RuntimeError {
  level: 'error' | 'warning';
  category: string;
  message: string;
  loc?: SourceLoc;
}
const _runtimeErrors: RuntimeError[] = [];
const _runtimeErrorKeys = new Set<string>();
// Cascade suppression: track the line of the first unresolved ident error.
function errorKey(level: string, category: string, msg: string, loc?: SourceLoc): string {
  const l = loc ? `${loc.file}:${loc.line}:${loc.col}` : '';
  return `${level}|${category}|${l}|${msg}`;
}

function runtimeError(category: string, msg: string, loc?: SourceLoc): void {
  const key = errorKey('error', category, msg, loc);
  if (_runtimeErrorKeys.has(key)) return;
  _runtimeErrorKeys.add(key);
  _runtimeErrors.push({ level: 'error', category, message: msg, loc });
}
function runtimeWarning(category: string, msg: string, loc?: SourceLoc): void {
  const key = errorKey('warning', category, msg, loc);
  if (_runtimeErrorKeys.has(key)) return;
  _runtimeErrorKeys.add(key);
  _runtimeErrors.push({ level: 'warning', category, message: msg, loc });
}

function clearRuntimeErrors(): void {
  _runtimeErrors.length = 0;
  _runtimeErrorKeys.clear();
}

function hasRuntimeErrors(): boolean {
  return _runtimeErrors.some(e => e.level === 'error');
}

function printRuntimeErrors(label?: string): void {
  const errors = _runtimeErrors.filter(e => e.level === 'error');
  const warnings = _runtimeErrors.filter(e => e.level === 'warning');
  if (errors.length > 0 || warnings.length > 0) {
    console.log('');
    for (const err of _runtimeErrors) {
      console.log(formatError(err));
    }
    console.log('');
    const summary: string[] = [];
    if (label) summary.push(c.bold(label) + ':');
    if (errors.length > 0) summary.push(c.boldRed(`${errors.length} error${errors.length > 1 ? 's' : ''}`));
    if (warnings.length > 0) summary.push(c.boldYellow(`${warnings.length} warning${warnings.length > 1 ? 's' : ''}`));
    console.log(summary.join(' '));
    console.log('');
  } else {
    if (label) console.log(c.gray(`${label}: No runtime errors.\n`));
    else console.log(c.gray('No runtime errors.\n'));
  }
}

function formatLoc(loc?: SourceLoc): string {
  if (!loc) return '';
  return `${loc.file}:${loc.line}:${loc.col}`;
}

function formatError(err: RuntimeError): string {
  const label = err.level === 'error' ? c.boldRed('error') : c.boldYellow('warning');
  const cat = c.gray(`[${err.category}]`);
  const locLine = err.loc ? c.cyan(formatLoc(err.loc)) : '';
  return `${locLine}\n  ${label}${cat}: ${err.message}`;
}

function nodeDesc(n: Node): string {
  if (n.isClass) return `class(${n.name || '?'})`;
  if (n.isNone) return 'None';
  if (n.program) return `program("${n.program.expression.slice(0, 40)}")`;
  if (typeof n.encoded === 'string') return `"${n.encoded}"`;
  if (typeof n.encoded === 'number') return String(n.encoded);
  if (typeof n.encoded === 'boolean') return String(n.encoded);
  if (typeof n.encoded === 'object' && n.encoded?.__external) return `external(${n.name || '?'})`;
  if (n.encoded === UNKNOWN) return n.name ? `<${n.name}>` : '<Node>';
  return String(n.encoded);
}

function evalExpr(expr: Expr, ctx: Context): Node {
  switch (expr.kind) {
    case 'string': return Node.string(expr.value);

    case 'ident': {
      const resolved = ctx.resolve(expr.name);
      if (resolved !== null) return resolved;
      // Numeric literal: ident name that looks like a number
      if (/^[0-9]/.test(expr.name)) {
        const num = Number(expr.name);
        if (!isNaN(num)) return Node.number(num);
      }
      runtimeError('ident', `Unresolved identifier "${expr.name}" — returning as string`, expr.loc);
      const s = Node.string(expr.name);
      s._unresolved = true;
      return s;
    }

    case 'binary': {
      const op = expr.op;

      // --- Generic method dispatch ---
      const left = evalExpr(expr.left, ctx);
      const right = evalExpr(expr.right, ctx);
      // Suppress the op error if either side is unresolved, but both sides are still evaluated
      if (left._unresolved || right._unresolved) return left._unresolved ? left : right;
      const method = left.get(op);
      if (method) {
        if (method.encoded && typeof method.encoded === 'object' && method.encoded.__external) {
          return method.encoded.fn(left, [right]);
        }
        if (method.program) {
          return method.program.eval(left, [right]);
        }
        runtimeError('binary', `Method "${op}" found on ${nodeDesc(left)} but has no body in: ${exprToString(expr)}`, expr.loc);
      } else {
        runtimeError('binary', `No method "${op}" on ${nodeDesc(left)} in: ${exprToString(expr)}`, expr.loc);
      }
      return Node.NONE;
    }

    case 'unary': {
      // Array construction: [elements]
      if (expr.op === '[]') {
        if (expr.operand.kind === 'sequence') {
          if (expr.operand.exprs.length === 0) return Node.NONE;
          const first = evalExpr(expr.operand.exprs[0], ctx);
          let current = first;
          for (let i = 1; i < expr.operand.exprs.length; i++) {
            const next = evalExpr(expr.operand.exprs[i], ctx);
            current.push(next);
            current = next;
          }
          return first;
        }
        // Single element or ident
        return evalExpr(expr.operand, ctx);
      }

      // Block scope: {body}
      if (expr.op === '{}') {
        return evalExpr(expr.operand, ctx);
      }

      // Generic unary method dispatch
      const operand = evalExpr(expr.operand, ctx);
      if (operand._unresolved) return operand; // Propagate unresolved tag
      const unaryMethod = operand.get(expr.op);
      if (unaryMethod) {
        if (unaryMethod.encoded && typeof unaryMethod.encoded === 'object' && unaryMethod.encoded.__external) {
          return unaryMethod.encoded.fn(operand, []);
        }
        if (unaryMethod.program) {
          return unaryMethod.program.eval(operand, []);
        }
        runtimeError('unary', `Method "${expr.op}" found on ${nodeDesc(operand)} but has no body`, expr.loc);
      } else {
        runtimeError('unary', `No method "${expr.op}" on ${nodeDesc(operand)}`, expr.loc);
      }
      return Node.NONE;
    }

    case 'access': {
      // Property access: evaluate object, evaluate property key, do object.get(key)
      // If direct get fails, fall through to () external (default call mechanism)
      const obj = evalExpr(expr.object, ctx);
      const key = evalExpr(expr.property, ctx);
      // Suppress the access error if either side is unresolved/None, but both are still evaluated
      if (obj._unresolved || obj.isNone) return obj;
      if (key._unresolved || key.isNone) return key;
      const keyStr = typeof key.encoded === 'string' ? key.encoded
                   : typeof key.encoded === 'number' ? String(key.encoded)
                   : key.className ?? key.name ?? exprToString(expr.property);
      // 1. Direct property lookup
      const result = obj.get(keyStr);
      if (result) return result;
      // 2. Fallback: call via () external (method dispatch)
      const callMethod = obj.get('()');
      if (callMethod) {
        if (callMethod.encoded && typeof callMethod.encoded === 'object' && callMethod.encoded.__external) {
          return callMethod.encoded.fn(obj, [key]);
        }
        if (callMethod.program) {
          return callMethod.program.eval(obj, [key]);
        }
      }
      const objName = obj.isClass ? (obj.className || obj.name || nodeDesc(obj)) : nodeDesc(obj);
      runtimeError('access', `Key "${keyStr}" not found on ${objName}`, expr.loc);
      return Node.NONE;
    }

    case 'sequence': {
      let result: Node = Node.NONE;
      for (const e of expr.exprs) {
        result = evalExpr(e, ctx);
      }
      return result;
    }
  }
}

// Pretty-print an Expr (for debugging)
function exprToString(expr: Expr): string {
  switch (expr.kind) {
    case 'string': return `"${expr.value}"`;
    case 'ident': return expr.name;
    case 'access': return `${exprToString(expr.object)} ${exprToString(expr.property)}`;
    case 'binary': {
      if (expr.op === '()') return `${exprToString(expr.left)}(${exprToString(expr.right)})`;
      if (expr.op === '[]') return `${exprToString(expr.left)}[${exprToString(expr.right)}]`;
      if (expr.op === '{}') return `${exprToString(expr.left)}{${exprToString(expr.right)}}`;
      if (expr.op === '.') return `${exprToString(expr.left)}.${exprToString(expr.right)}`;
      return `(${exprToString(expr.left)} ${expr.op} ${exprToString(expr.right)})`;
    }
    case 'unary': {
      if (expr.op === '[]') return `[${exprToString(expr.operand)}]`;
      if (expr.op === '{}') return `{${exprToString(expr.operand)}}`;
      return `${expr.op}${exprToString(expr.operand)}`;
    }
    case 'sequence': return expr.exprs.map(exprToString).join('; ');
  }
}


// ============================================================================
// Bootstrap — Semantic Registration
// ============================================================================

class Bootstrap {
  global: Context;
  classes: Map<string, Node> = new Map();
  _classTrace: string[] = [];

  constructor() {
    const globalProgram = new Program('', null);
    this.global = new Context(globalProgram, null);
  }

  registerBuiltins(): void {
    // Minimal kernel: only * (Node) class + externals + singletons
    // Create * (Node) class — the kernel
    const NodeClass = new Node();
    NodeClass.set('static', NodeClass);  // static === self → is a class
    NodeClass.name = '*';
    NodeClass.set('name', Node.string('*'));
    this.classes.set('*', NodeClass);
    this.classes.set('Node', NodeClass);
    Node._NODE_CLASS = NodeClass;

    // === Structural externals (Node.ray: external) ===

    this.registerExternal(NodeClass, '=', (self, args) => {
      if (args.length > 0) { self.encoded = args[0].encoded; return args[0]; }
      return self;
    });
    this.registerExternal(NodeClass, '#', (self) => {
      const result = new Node();
      let first = true;
      for (const s of self.superposed()) {
        if (first) { result.encoded = s.encoded; result.type = s.type; first = false; }
        else result.or(s);
      }
      return result;
    });
    this.registerExternal(NodeClass, '##', (self) => {
      const result = new Node();
      let first = true;
      for (const c of self.classComponents()) {
        if (first) { result.encoded = c.encoded; result.type = c.type; first = false; }
        else result.push(c);
      }
      return first ? Node.NONE : result;
    });
    this.registerExternal(NodeClass, '###', (self) => {
      const result = new Node();
      let first = true;
      for (const c of self.classComponents()) {
        if (first) { result.encoded = c.encoded; result.type = c.type; first = false; }
        else result.push(c);
      }
      return first ? Node.NONE : result;
    });
    // * with no args = methods list; * with args = multiply/repeat (Node.ray line 204)
    this.registerExternal(NodeClass, '*', (self, args) => {
      if (args.length > 0) {
        if (typeof self.encoded === 'number' && typeof args[0].encoded === 'number')
          return Node.number(self.encoded * args[0].encoded);
        return Node.NONE;
      }
      const result = new Node();
      for (const [key] of self.methods()) {
        result.push(new Node(typeof key === 'string' ? key : key.encoded));
      }
      return result;
    });
    this.registerExternal(NodeClass, '**', (self) => {
      return self.program ? (self.program as Node) : Node.NONE;
    });

    // 'external' modifier defined on Node
    NodeClass.set('external', Node.string('external'));

    // Every object is constructed from a Context — add as silent component on Node
    const nodeCtx = new Node();
    nodeCtx.set('local', NodeClass);
    NodeClass.addSilentComponent(nodeCtx);

    // Global = Node + [global overrides]
    // Add NodeClass as a component (no eager copy — resolve follows component chain).
    // Global's own defines override Node methods.
    this.global.local.addComponent(NodeClass);
    this.global.define('*', NodeClass);
    this.global.define('Node', NodeClass);
  }

  registerMethod(cls: Node, name: string, body: string | null, file?: string, lineOffset: number = 0, colOffset: number = 0): void {
    // Don't overwrite an external with a stub (no body)
    if (body === null) {
      const existing = cls.getDirect(name);
      if (existing?.encoded && typeof existing.encoded === 'object' && existing.encoded.__external) {
        return;
      }
    }
    // Also protect externals from .ray definitions — externals are the runtime truth
    const existing = cls.getDirect(name);
    if (existing?.encoded && typeof existing.encoded === 'object' && existing.encoded.__external) {
      return;
    }
    const method = new Node();
    if (body !== null) {
      method.program = new Program(body, this.global);
      if (file) method.program.file = file;
      method.program.lineOffset = lineOffset;
      method.program.colOffset = colOffset;
    }
    method.name = name;
    cls.set(name, method);
  }

  registerExternal(cls: Node, name: string, fn: (self: Node, args: Node[]) => Node): void {
    const method = new Node();
    method.encoded = { __external: true, fn };
    method.name = name;
    cls.set(name, method);
  }

  loadFile(filePath: string): ASTNode[] {
    const nodes = buildAST(tokenize(fs.readFileSync(filePath, 'utf-8')));
    const stamp = (n: ASTNode) => { n.file = filePath; for (const c of n.children) stamp(c); };
    for (const n of nodes) stamp(n);
    return nodes;
  }

  loadDirectory(dirPath: string): ASTNode[] {
    const allNodes: ASTNode[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(fullPath);
        else if (entry.name.endsWith('.ray')) allNodes.push(...this.loadFile(fullPath));
      }
    };
    walk(dirPath);
    return allNodes;
  }

  // --- New bootstrap methods: expression-based evaluation ---

  extractFirstName(tokens: Token[]): string | null {
    for (const t of tokens) {
      if (t.type === TokenType.Word || t.type === TokenType.Symbol) return t.value;
    }
    return null;
  }

  constructMethodBody(methodNode: ASTNode): { body: string, params: string[], bodyLine: number, bodyCol: number } | null {
    if (methodNode.children.length === 0) return null;

    const firstChild = methodNode.children[0];
    const paramTokens = firstChild.tokens.filter(t => t.type !== TokenType.Comment);
    let params: string[] = [];

    // Extract param names from {name: *} pattern or simple word params
    for (const t of paramTokens) {
      if (t.type === TokenType.Word && t.value !== 'def' && !['Args', 'Array'].includes(t.value)) {
        params.push(t.value);
        break;  // first word in pattern is the param name
      }
    }

    // Body = grandchildren (children of first child) + remaining children
    const bodyParts: ASTNode[] = [];
    for (const grandchild of firstChild.children) {
      if (grandchild.rawText) bodyParts.push(grandchild);
    }
    for (let i = 1; i < methodNode.children.length; i++) {
      if (methodNode.children[i].rawText) bodyParts.push(methodNode.children[i]);
    }

    if (bodyParts.length === 0) return null;
    const bodyLine = bodyParts[0].line;
    const firstBodyToken = bodyParts[0].tokens.find(t => t.type !== TokenType.Comment);
    const bodyCol = firstBodyToken ? firstBodyToken.col - 1 : 0;
    return { body: bodyParts.map(p => p.rawText!).join('; '), params, bodyLine, bodyCol };
  }

  preloadNodeRay(ast: ASTNode[]): void {
    const nodeChildren = findClassChildren(ast, ['*', 'Node']);
    for (const child of nodeChildren) {
      const tokens = child.tokens.filter(t => t.type !== TokenType.Comment);
      if (tokens.length === 0) continue;

      const name = this.extractFirstName(tokens);
      if (!name) continue;

      // Don't overwrite externals
      const existing = Node._NODE_CLASS!.getDirect(name);
      if (existing?.encoded && typeof existing.encoded === 'object' && existing.encoded.__external) continue;

      const constructed = this.constructMethodBody(child);
      if (constructed) {
        // Multi-line method → callable Program
        const method = new Node();
        method.program = new Program(constructed.body, this.global);
        method.program._paramNames = constructed.params;
        if (child.file) method.program.file = child.file;
        // Offset so errors map back to original .ray file lines
        method.program.lineOffset = constructed.bodyLine - 1;
        method.program.colOffset = constructed.bodyCol;
        method.name = name;
        Node._NODE_CLASS!.set(name, method);
      } else {
        // Single-line with => or no body
        this.handleDefinition(tokens, Node._NODE_CLASS!, child.file);
      }
    }
  }

  createScopeContext(scope: Node): Context {
    const prog = new Program('', this.global);
    return new Context(prog, this.global, scope);
  }

  handleDefinition(tokens: Token[], scope: Node, file?: string): void {
    // Skip leading modifiers (e.g., 'external')
    let startIdx = 0;
    while (startIdx < tokens.length && isModifier(tokens[startIdx].value)) {
      startIdx++;
    }
    if (startIdx >= tokens.length) return;

    const defTokens = tokens.slice(startIdx);
    const node: ASTNode = {
      kind: 'definition', tokens: defTokens, children: [], indent: 0,
      line: defTokens[0]?.line || 0, rawText: defTokens.map(t => t.value).join(' ')
    };
    parseDefinition(node, defTokens, 0);
    const names = node.names || [node.name || ''];
    const body = node.defaultValue || null;
    // Find line/col offset: locate => or = token, body starts after it
    let bodyLineOffset = 0;
    let bodyColOffset = 0;
    if (body !== null) {
      for (let i = 0; i < defTokens.length; i++) {
        if (defTokens[i].value === '=>' || defTokens[i].value === '=') {
          if (i + 1 < defTokens.length) {
            bodyLineOffset = defTokens[i + 1].line - 1;
            bodyColOffset = defTokens[i + 1].col - 1;
          }
          break;
        }
      }
    }
    for (const name of names) {
      if (name) this.registerMethod(scope, name, body, file, bodyLineOffset, bodyColOffset);
    }
  }

  // Collect all tokens from an AST node's children (depth-first),
  // preserving original file locations.
  private collectChildTokens(node: ASTNode): Token[] {
    const result: Token[] = [];
    for (const child of node.children) {
      for (const t of child.tokens) {
        if (t.type !== TokenType.Comment) result.push(t);
      }
      result.push(...this.collectChildTokens(child));
    }
    return result;
  }

  // Assemble a balanced token stream starting from nodes[startIdx].
  // Starts with only the node's own line tokens. If delimiters are unbalanced,
  // pulls tokens from children (depth-first) then subsequent siblings until
  // balanced. Returns { tokens, endIdx } where endIdx is the last sibling consumed.
  private assembleBalancedTokens(nodes: ASTNode[], startIdx: number): { tokens: Token[], endIdx: number } {
    const node = nodes[startIdx];
    const tokens: Token[] = node.tokens.filter(t => t.type !== TokenType.Comment);

    // Check delimiter balance on just the line tokens
    const stack = activeGrammar.balanceStack(tokens);

    // Already balanced — return just the line tokens, don't pull children
    if (stack.length === 0) return { tokens, endIdx: startIdx };

    // Unbalanced — first pull from children (depth-first)
    const childToks = this.collectChildTokens(node);
    tokens.push(...childToks);
    for (const t of childToks) activeGrammar.trackToken(stack, t);
    if (stack.length === 0) return { tokens, endIdx: startIdx };

    // Still unbalanced — pull from subsequent siblings (and their children)
    let endIdx = startIdx;
    for (let si = startIdx + 1; si < nodes.length && stack.length > 0; si++) {
      const sibNode = nodes[si];
      const sibToks = sibNode.tokens.filter(t => t.type !== TokenType.Comment);
      tokens.push(...sibToks);
      for (const t of sibToks) activeGrammar.trackToken(stack, t);
      const sibChildToks = this.collectChildTokens(sibNode);
      tokens.push(...sibChildToks);
      for (const t of sibChildToks) activeGrammar.trackToken(stack, t);
      endIdx = si;
    }

    return { tokens, endIdx };
  }

  evaluateStatements(nodes: ASTNode[], scope: Node, pass: 1 | 2 = 2): void {
    const scopeName = scope.name || (scope === this.global.local ? 'Global' : '<anon>');
    for (let ni = 0; ni < nodes.length; ni++) {
      const node = nodes[ni];
      const lineToks = node.tokens.filter(t => t.type !== TokenType.Comment);
      if (lineToks.length === 0) continue;

      const indent = '  '.repeat(Math.max(0, Math.floor((node.indent || 0) / 2)));
      const prefix = `${indent}[pass ${pass}] [scope: ${scopeName}]`;

      // Skip pattern definitions — they are grammar rules, already handled by buildGrammarFromAST
      const firstNonMod = lineToks.find(t => !isModifier(t.value));
      if (firstNonMod && isDelim(firstNonMod, '{')) {
        const hasStringLiteral = lineToks.some(t => t.type === TokenType.String);
        if (hasStringLiteral) {
          const raw = lineToks.map(t => t.value).join(' ');
          const stmt = raw.length > 80 ? raw.slice(0, 80) + '...' : raw;
          console.log(`${prefix} "${stmt}" → skipped (pattern definition)`);
          continue;
        }
      }

      // Assemble balanced token stream — pulls from children and closing
      // siblings when delimiters are unbalanced (multi-line {}/[]/() blocks)
      const { tokens, endIdx } = this.assembleBalancedTokens(nodes, ni);
      const consumed = endIdx > ni;
      if (consumed) ni = endIdx;

      const raw = tokens.map(t => t.value).join(' ');
      const stmt = raw.length > 80 ? raw.slice(0, 80) + '...' : raw;

      // Everything is evaluated as an expression
      let result: Node | null = null;
      let parseError: string | null = null;
      let parsedExpr: Expr | null = null;
      try {
        parsedExpr = new ExprParser(tokens, node.file).parse();
        if (!(parsedExpr.kind === 'ident' && parsedExpr.name === 'None')) {
          const ctx = this.createScopeContext(scope);
          result = evalExpr(parsedExpr, ctx);
        }
      } catch (e: any) {
        parseError = e.message || String(e);
      }

      // Log what happened
      if (parseError) {
        const firstTok = tokens[0];
        const parseLoc: SourceLoc | undefined = node.file ? { file: node.file, line: firstTok?.line ?? node.line, col: firstTok?.col ?? 0 } : undefined;
        runtimeError('parse', `${parseError}  in: ${stmt}`, parseLoc);
        console.log(`${prefix} "${stmt}" → PARSE ERROR: ${parseError}`);
      } else if (parsedExpr) {
        const exprDesc = exprToString(parsedExpr);
        const resultDesc = result
          ? (result.isClass ? `class(${result.name || '?'})`
            : result.program ? `lazy program: "${result.program.expression}"`
            : result.isNone ? 'None'
            : typeof result.encoded === 'string' ? `"${result.encoded}"`
            : typeof result.encoded === 'object' && result.encoded?.__external ? `external(${result.name || '?'})`
            : String(result.encoded))
          : 'null';
        console.log(`${prefix} "${stmt}" → parsed: ${exprDesc} → result: ${resultDesc}`);
      }

      // If result is a class/scope, register it and recurse into children
      if (result && result.isClass) {
        const nameNode = result.getDirect('name');
        if (nameNode && typeof nameNode.encoded === 'string') {
          const name = nameNode.encoded;
          if (!this.classes.has(name)) {
            this.classes.set(name, result);
            result.name = result.name || name;
            console.log(`${prefix}   → registered class "${name}"`);
          }
        }
        if (result.name && !this.classes.has(result.name)) {
          this.classes.set(result.name, result);
          console.log(`${prefix}   → registered class "${result.name}"`);
        }
        if (!consumed && node.children.length > 0) {
          console.log(`${prefix}   → recursing into ${node.children.length} children with scope: ${result.name || '?'}`);
          this.evaluateStatements(node.children, result, pass);
        }
        continue;
      }

      // Pass 1: only interested in class creation, skip definitions
      if (pass === 1) {
        console.log(`${prefix}   → pass 1: skipping definition`);
        continue;
      }

      // Pass 2: handle as definition (space syntax behavior)
      // Skip handleDefinition for reassembled blocks — already fully parsed above
      if (!consumed) {
        this.handleDefinition(tokens, scope, node.file);
        console.log(`${prefix}   → handleDefinition on scope "${scopeName}"`);
      }

      // Process nested definitions (only if children weren't consumed by balancing)
      if (!consumed && node.children.length > 0 && result === null) {
        const defName = this.extractFirstName(lineToks.filter(t => !isModifier(t.value)));
        if (defName) {
          const methodNode = scope.get(defName);
          if (methodNode) {
            console.log(`${prefix}   → recursing into ${node.children.length} children for def "${defName}"`);
            this.evaluateStatements(node.children, methodNode, pass);
          }
        }
      }
    }
  }

  bootstrap(etherPath: string): void {
    console.log('=== Ray v0.1 Bootstrap ===\n');

    // Step 1: Kernel — * class + externals (|, <, =, #, etc.) + singletons
    console.log('Step 1: Registering kernel (*/Node + externals + singletons)...');
    this.registerBuiltins();
    console.log(`  Kernel: ${this.classes.size} class, ${Node._NODE_CLASS!.methodCount} externals`);

    // Step 2: Load .ray files → AST
    const rayDir = path.join(etherPath, '.ray');
    console.log(`\nStep 2: Loading .ray files from ${rayDir}...`);
    const ast = this.loadDirectory(rayDir);
    console.log(`  Parsed ${ast.length} top-level statements`);

    // Step 3: Build grammar EARLY (needs classification, uses AST structure only)
    console.log('\nStep 3: Building grammar from .ray definitions...');
    activeGrammar = buildGrammarFromAST(ast);
    // Ensure short-circuit and sequence operators are in the grammar
    if (!activeGrammar.binaryOps.has('||')) {
      const orPrec = activeGrammar.binaryOps.get('|')?.prec ?? 20;
      activeGrammar.binaryOps.set('||', { prec: orPrec - 1, assoc: 'left' });
    }
    if (!activeGrammar.binaryOps.has('&&')) {
      const andPrec = activeGrammar.binaryOps.get('&')?.prec ?? 25;
      activeGrammar.binaryOps.set('&&', { prec: andPrec - 1, assoc: 'left' });
    }
    if (!activeGrammar.binaryOps.has(';')) {
      activeGrammar.binaryOps.set(';', { prec: 5, assoc: 'left' });
    }
    // Arrow function operator
    if (!activeGrammar.binaryOps.has('=>')) {
      activeGrammar.binaryOps.set('=>', { prec: 10, assoc: 'right' });
    }
    // Ensure sequencePrec is set
    const semiEntry = activeGrammar.binaryOps.get(';');
    if (semiEntry) activeGrammar.sequencePrec = semiEntry.prec;
    console.log(`  ${activeGrammar.binaryOps.size} binary ops, ${activeGrammar.prefixOps.size} prefix ops, ${activeGrammar.postfixKeywords.size} postfix keywords`);
    console.log(`  ${activeGrammar.prefixPatterns.size} prefix patterns, ${activeGrammar.postfixPatterns.size} postfix patterns`);
    activeGrammar.rebuildDelimiters();
    console.log(`  ${activeGrammar.openerToCloser.size} delimiter pairs: ${[...activeGrammar.openerToCloser.entries()].map(([o,c]) => `${o}${c}`).join(' ')}`);

    // Step 4: Pre-load Node.ray definitions onto * (including multi-line method bodies)
    console.log('\nStep 4: Pre-loading Node.ray definitions onto *...');
    this.preloadNodeRay(ast);
    console.log(`  * class now has ${Node._NODE_CLASS!.methodCount} methods`);

    // Step 5: PASS 1 — evaluate all expressions (forward-declares classes)
    // Top-level scope is global, not Node — class children recurse with class as scope
    console.log('\nStep 5: Pass 1 — evaluating expressions (forward-declare classes)...');
    this.evaluateStatements(ast, this.global.local, 1);
    console.log(`  Classes after pass 1: ${this.classes.size}`);

    // Step 6: PASS 2 on Node.ray children — register methods on * first
    console.log('\nStep 6: Pass 2 — processing Node.ray methods...');
    const nodeChildren = findClassChildren(ast, ['*', 'Node']);
    this.evaluateStatements(nodeChildren, Node._NODE_CLASS!, 2);
    console.log(`  * class now has ${Node._NODE_CLASS!.methodCount} methods`);

    // Step 7: PASS 2 on everything — full evaluation (inheritance + definitions)
    console.log('\nStep 7: Pass 2 — full evaluation (all classes)...');
    this.evaluateStatements(ast, this.global.local, 2);

    // Step 8: Inject all classes into global scope
    console.log('\nStep 8: Injecting globals...');
    for (const [name, cls] of this.classes) this.global.define(name, cls);
    console.log(`  ${this.classes.size} classes: ${[...this.classes.keys()].join(', ')}`);

    console.log('\n=== Bootstrap Complete ===\n');

    console.log('');

    // Compute hierarchy for display
    const seen = new Set<Node>();
    const classEntries: { names: string[]; cls: Node; parents: string[] }[] = [];
    for (const [name, cls] of this.classes) {
      if (seen.has(cls)) continue;
      seen.add(cls);
      const aliases = [...this.classes.entries()].filter(([, c]) => c === cls).map(([n]) => n);
      const parents: string[] = [];
      for (const comp of cls.classComponents()) {
        const parentNames = [...this.classes.entries()].filter(([, c]) => c === comp).map(([n]) => n);
        if (parentNames.length > 0) parents.push(parentNames[0]);
      }
      classEntries.push({ names: aliases, cls, parents });
    }

    console.log(`${classEntries.length} classes registered:\n`);
    for (const entry of classEntries) {
      const nameStr = entry.names.join(' | ');
      const parentStr = entry.parents.length > 0 ? ` < ${entry.parents.join(' &+ ')}` : '';
      console.log(`  ${nameStr}${parentStr} (${entry.cls.methodCount} methods)`);
    }

    // Print what's defined on Node (*)
    console.log(`\nNode (*) methods:`);
    for (const [key] of Node._NODE_CLASS!.methods()) {
      const label = typeof key === 'string' ? key : String(key);
      console.log(`  .${label}`);
    }
    for (const comp of Node._NODE_CLASS!.silentComponents()) {
      for (const [key] of comp.methods()) {
        const label = typeof key === 'string' ? key : String(key);
        console.log(`  .${label}  (from Context)`);
      }
    }

    // Print what's defined on global scope, showing component origin.
    // A method is "from component" if its value is the same object as on the component.
    // If global overrides it (different value), it's own.
    const globalLocal = this.global.local;
    const componentValue = new Map<string, { value: Node, origin: string }>();
    for (const comp of globalLocal.classComponents()) {
      const compName = comp.name || '?';
      for (const [key, value] of comp.methods()) {
        const label = typeof key === 'string' ? key : String(key);
        if (!componentValue.has(label)) componentValue.set(label, { value, origin: compName });
      }
    }
    console.log(`\nGlobal scope:`);
    for (const [key] of globalLocal.methods()) {
      const label = typeof key === 'string' ? key : String(key);
      // Directly set on global → always own, never show component origin
      console.log(`  ${label}`);
    }
    // Methods only on visible components (not directly on global)
    for (const comp of globalLocal.classComponents()) {
      const compName = comp.name || '?';
      for (const [key] of comp.methods()) {
        const label = typeof key === 'string' ? key : String(key);
        if (!globalLocal.getDirect(label)) {
          console.log(`  ${label}  (from ${compName})`);
        }
      }
    }
    // Methods from silent components (e.g., Context provides 'local')
    for (const comp of globalLocal.silentComponents()) {
      for (const [key] of comp.methods()) {
        const label = typeof key === 'string' ? key : String(key);
        if (!globalLocal.getDirect(label)) {
          console.log(`  ${label}  (from Context)`);
        }
      }
    }
    console.log('');

    printRuntimeErrors('Bootstrap');
  }
}


// ============================================================================
// Entry Point
// ============================================================================

export namespace Ether {
  export type PartialArgs = { [key: string]: string[] }

  // Evaluate a single expression string against a bootstrapped context
  export function evaluate(expression: string, bootstrap: Bootstrap): Node {
    const tokens = tokenize(expression);
    const parser = new ExprParser(tokens);
    const expr = parser.parse();
    const prog = new Program(expression, bootstrap.global);
    prog._parsedExpr = expr;
    return evalExpr(expr, prog.context);
  }

  // Evaluate all statements from an AST against a bootstrapped context
  export function evalStatements(ast: ASTNode[], bootstrap: Bootstrap): Node {
    let lastResult: Node = Node.NONE;
    for (const node of ast) {
      if (node.kind === 'class') {
        // Already registered during bootstrap
        continue;
      }
      if (node.kind === 'definition') {
        // Evaluate as an expression
        const text = node.rawText || '';
        if (text.trim()) {
          try {
            lastResult = evaluate(text, bootstrap);
          } catch (e) {
            // Skip unparseable statements
          }
        }
      }
    }
    return lastResult;
  }

  // Pretty-print a Node result
  function formatAtom(node: Node): string | null {
    if (node === Node.NONE || node.isNone) return 'None';
    if (node === Node.TRUE || node.encoded === true) return 'true';
    if (node === Node.FALSE || node.encoded === false) return 'false';
    if (typeof node.encoded === 'number') return String(node.encoded);
    if (typeof node.encoded === 'string') return `"${node.encoded}"`;
    // Classes: show with all known aliases (skip superposition check for classes)
    if (node.isClass) return `<class ${node.name || '*'}>`;
    if (node.name) return `<${node.name}>`;
    return null;
  }

  // Check for sequential chain (untyped edges only)
  function hasSeqChain(node: Node): boolean {
    for (const _ of node.terminal.continuationVertices(e => e.value !== '|' && e.value !== '&')) return true;
    return false;
  }

  function formatResult(node: Node, depth: number = 0): string {
    if (depth > 5) return '...';

    // Check for superposition first: a | b or a & b (skip for classes — aliases stored as superposed)
    if (!node.isClass) {
      const edges: [Node, EdgeKind | null][] = [...node.superposedWithEdges()];
      if (edges.length > 1) {
        // Build result with per-edge separators to show mixed | and & correctly
        let result = '';
        for (let i = 0; i < edges.length && i <= 10; i++) {
          const [n, e] = edges[i];
          if (i > 0) result += e === '&' ? ' & ' : ' | ';
          result += formatAtom(n) || formatResult(n, depth + 1);
        }
        if (edges.length > 10) result += ' | ...';
        return result;
      }
    }

    // Check for sequential Ray chain: [a, b, c] (untyped edges)
    if (hasSeqChain(node)) {
      const elements: string[] = [];
      let count = 0;
      // Follow only untyped (sequential) edges
      const visited = new Set<Node>();
      const walk = (n: Node) => {
        if (visited.has(n) || count > 10) { if (count > 10) elements.push('...'); return; }
        visited.add(n);
        elements.push(formatAtom(n) || formatResult(n, depth + 1));
        count++;
        for (const nxt of n.terminal.continuationVertices(e => e.value !== '|' && e.value !== '&')) {
          walk(nxt);
        }
      };
      walk(node);
      return `[${elements.join(', ')}]`;
    }

    // Simple value
    return formatAtom(node) || '<Node>';
  }

  export const run = async (defaultPath: string, args: PartialArgs) => {
    if ((args['@'] ?? []).length === 0) args['@'] = [defaultPath];
    if (args['@'].length !== 1) throw new Error('In order to run multiple instances, for now run them in separate terminals.');

    defaultPath = path.resolve(defaultPath);
    const location = path.resolve(args['@'][0]);
    const stat = fs.statSync(location);
    delete args['@'];

    const evalExprs = args['eval'] || [];
    delete args['eval'];

    const bootstrap = new Bootstrap();

    if (stat.isFile()) {
      const etherDir = path.dirname(path.dirname(location));
      bootstrap.bootstrap(etherDir);
      console.log(`Loading file: ${location}`);
      const ast = bootstrap.loadFile(location);
      console.log(`Parsed ${ast.length} statements from file\n`);
      evalStatements(ast, bootstrap);
    } else if (stat.isDirectory()) {
      bootstrap.bootstrap(location);
      if (!hasRuntimeErrors()) {
        const entrypoint = path.join(location, 'Ether.ray');
        if (fs.existsSync(entrypoint)) {
          console.log(`Loading entrypoint: ${entrypoint}`);
          clearRuntimeErrors();
          const ast = bootstrap.loadFile(entrypoint);
          bootstrap.evaluateStatements(ast, bootstrap.global.local, 2);
          console.log(`Parsed ${ast.length} statements from entrypoint\n`);
          printRuntimeErrors('Entrypoint');
        }
      }
    } else {
      throw new Error(`"${location}": Unknown Ether instance directory or Ray file.`);
    }

    // Evaluate --eval expressions
    if (evalExprs.length > 0) {
      console.log('--- Evaluation ---\n');
      for (const expr of evalExprs) {
        try {
          const result = evaluate(expr, bootstrap);
          console.log(`  ${expr}  →  ${formatResult(result)}`);
        } catch (e: any) {
          console.log(`  ${expr}  →  Error: ${e.message}`);
        }
      }
      console.log('');
    }

    // Interactive REPL if --repl flag is set
    if (args['repl']) {
      delete args['repl'];
      const { createInterface } = await import('readline');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const prompt = () => {
        rl.question('ray> ', (line: string) => {
          if (!line || line === 'exit' || line === 'quit') { rl.close(); return; }
          try {
            const result = evaluate(line.trim(), bootstrap);
            console.log(`  ${formatResult(result)}`);
          } catch (e: any) {
            console.log(`  Error: ${e.message}`);
          }
          prompt();
        });
      };
      prompt();
    }
  }
}

export { Node, Boundary, BoundaryEdge, Program, Context, Bootstrap, Grammar, activeGrammar, tokenize, buildAST, ExprParser, evalExpr, Expr };
