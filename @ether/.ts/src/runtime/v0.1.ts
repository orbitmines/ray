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

  // === Lazy program (**) ===
  program: Program | null = null;

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
    if (this.className === name) return true;
    for (const sup of this.superposed()) {
      if (sup !== this && (sup.encoded === name || sup.className === name)) return true;
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
    if (type.isClass && (type.className === '*' || type.className === 'Node')) return true;

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
      if (type.className) {
        if (this.className === type.className) return true;
        if (this.type?.className === type.className) return true;
      }
    }

    // String type checking: "hello" instanceof String
    if (type.className === 'String' && typeof this.encoded === 'string') return true;
    if (type.className === 'Number' && typeof this.encoded === 'number') return true;
    if (type.className === 'boolean' && typeof this.encoded === 'boolean') return true;

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
    if (targetType.className === 'boolean' || targetType.matchesName('boolean')) {
      return this.isNone ? Node.FALSE : Node.TRUE;
    }
    if (targetType.className === 'String' || targetType.matchesName('String')) {
      return new Node(String(this.encoded));
    }
    if (targetType.className === 'Number' || targetType.matchesName('Number')) {
      return new Node(Number(this.encoded));
    }
    return null;
  }

  // --- Utility ---

  toString(): string {
    if (this.isNone) return 'None';
    if (this.className) return `<class ${this.className}>`;
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
    head.className = a.className;
    if (a.isClass) head.set('static', head);

    // Clone a's existing superposition chain
    let tail = head;
    let first = true;
    for (const [node, e] of a.superposedWithEdges()) {
      if (first) { first = false; continue; } // skip head (already cloned)
      const clone = new Node(node.encoded);
      clone.type = node.type;
      clone.className = node.className;
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
Node.NONE.className = 'None';
Node.TRUE = new Node(true);
Node.TRUE.className = 'true';
Node.FALSE = new Node(false);
Node.FALSE.className = 'false';


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
    this.local.set('local', this.local);  // local is always accessible
    this.program = program;
    this.parent = parent;
    this.self = self || this.local;
  }

  resolve(name: string): Node | null {
    if (name === 'this') return this.self;
    if (name === '&') return this.program as Node;
    // Use direct lookup only — don't fall through to class hierarchy
    // This prevents Node class methods from shadowing scope variables
    const local = this.local.getDirect(name);
    if (local !== null) return local;
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
        this._parsedExpr = new ExprParser(tokens).parse();
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
  } else if (first.value === 'namespace') {
    node.kind = 'namespace';
    parseNamespaceHeader(node, tokens.slice(i));
  } else if (first.value === 'end') {
    node.kind = 'end';
  } else {
    node.kind = 'definition';
    parseDefinition(node, tokens, i);
  }
}

function isModifier(value: string): boolean {
  return ['external', 'dynamically', 'static', 'internal', 'protected', 'delegate'].includes(value);
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
    if (t.value === '<' || t.type === TokenType.LParen ||
        t.value === '=' || t.type === TokenType.LBrace ||
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
  if (i < tokens.length && tokens[i].type === TokenType.LParen) {
    let depth = 0;
    while (i < tokens.length) {
      if (tokens[i].type === TokenType.LParen) depth++;
      if (tokens[i].type === TokenType.RParen) depth--;
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

function parseNamespaceHeader(node: ASTNode, tokens: Token[]): void {
  const names: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    // Stop at delimiters that indicate end of namespace name
    if (t.type === TokenType.LParen || t.type === TokenType.LBrace ||
        t.type === TokenType.LBracket || t.value === '=' ||
        t.value === '=>' || t.value === '<' ||
        t.value === ':' || t.type === TokenType.Newline) break;
    if (t.value === '|') { continue; }
    if (t.type === TokenType.Word || t.type === TokenType.Symbol) {
      names.push(t.value);
    }
  }
  node.names = names;
  node.name = names[0] || '';
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
    if (t.type === TokenType.LParen) break;
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

  if (i < tokens.length && tokens[i].type === TokenType.LParen) {
    let depth = 0, paramStr = '';
    while (i < tokens.length) {
      if (tokens[i].type === TokenType.LParen) depth++;
      if (tokens[i].type === TokenType.RParen) depth--;
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

type Expr =
  | { kind: 'none' }
  | { kind: 'string', value: string }
  | { kind: 'number', value: number }
  | { kind: 'boolean', value: boolean }
  | { kind: 'ident', name: string }
  | { kind: 'this' }
  | { kind: 'context' }                          // &
  | { kind: 'dot', object: Expr, property: string }
  | { kind: 'index', object: Expr, index: Expr }
  | { kind: 'call', callee: Expr, args: Expr[] }
  | { kind: 'binary', op: string, left: Expr, right: Expr }
  | { kind: 'unary', op: string, operand: Expr }
  | { kind: 'assign', target: Expr, value: Expr }
  | { kind: 'compound_assign', op: string, target: Expr, value: Expr }
  | { kind: 'sequence', exprs: Expr[] }
  | { kind: 'if', condition: Expr, body: Expr, else_body?: Expr }
  | { kind: 'arrow', params: string[], body: Expr }
  | { kind: 'array', elements: Expr[] }
  | { kind: 'filter', target: Expr, predicate: Expr }

// ============================================================================
// Grammar — built entirely from .ray files + externals during bootstrap
// ============================================================================
//
// Zero hardcoded operators. All grammar is discovered from:
//   1. Method definitions in .ray files (precedence = line number)
//   2. External methods registered on * (Node) class
//   3. Compound assignments generated from {operator}= pattern (Node.ray line 152)
//
// Precedence comes directly from definition line numbers in Node.ray.
// Higher line number = tighter binding. Structural levels (postfix, unary,
// juxtaposition) are set above the line-number range.

class Grammar {
  binaryOps: Map<string, { prec: number, assoc: 'left' | 'right' }> = new Map();
  prefixOps: Set<string> = new Set();
  postfixKeywords: Set<string> = new Set();
  breakKeywords: Set<string> = new Set();

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

function buildGrammarFromAST(ast: ASTNode[]): Grammar {
  const g = new Grammar();
  const nodeChildren = findClassChildren(ast, ['*', 'Node']);

  const registerOp = (name: string, line: number, hasParams: boolean, inNamespace: boolean = false) => {
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
      if (inNamespace) return;  // Don't promote namespace children to keywords
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

  const scanDefs = (nodes: ASTNode[], inNamespace: boolean = false) => {
    for (const node of nodes) {
      if (node.kind === 'namespace') {
        // Namespace name = binary operator (e.g., namespace ==)
        if (node.name) registerOp(node.name, node.line, true, false);
        scanDefs(node.children, true);
        continue;
      }
      if (node.kind !== 'definition') continue;
      const names = node.names || [node.name || ''];
      const hasParams = !!(node.rawText && node.rawText.includes('('));
      for (const name of names) {
        registerOp(name, node.line, hasParams, inNamespace);
      }
      // Extract operators from String literals in pattern definitions.
      // e.g., {" "}({"=>"?, *}) has "=>" as a String token representing syntax.
      if (names.some(n => n.startsWith('{'))) {
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
      if (node.children.length > 0) scanDefs(node.children, inNamespace);
    }
  };

  // Scan Node class body only — all grammar is defined on Node
  scanDefs(nodeChildren);

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

  // Derive conditionalPrec from first postfix keyword (if/unless)
  for (const kw of g.postfixKeywords) {
    for (const node of nodeChildren) {
      if (node.kind === 'definition' && node.names?.includes(kw)) {
        g.conditionalPrec = node.line;
        break;
      }
    }
    if (g.conditionalPrec !== 0) break;
  }

  // Break keywords: derived from postfix keywords only (no hardcoded keywords)
  for (const kw of g.postfixKeywords) g.breakKeywords.add(kw);

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

  constructor(tokens: Token[]) {
    this.tokens = tokens.filter(t =>
      t.type !== TokenType.Comment && t.type !== TokenType.Newline
    );
  }

  parse(): Expr {
    if (this.tokens.length === 0 || (this.tokens.length === 1 && this.tokens[0].type === TokenType.EOF)) {
      return { kind: 'none' };
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

  private expect(type: TokenType): Token {
    const t = this.peek();
    // Tolerate EOF in place of closing delimiters — multiline content may be truncated
    if (t.type === TokenType.EOF && (type === TokenType.RParen || type === TokenType.RBracket || type === TokenType.RBrace)) {
      return t;
    }
    const consumed = this.advance();
    if (consumed.type !== type) throw new Error(`Expected ${type} but got ${consumed.type} "${consumed.value}"`);
    return consumed;
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

      // Property access: .property
      if (tok.value === '.' && Grammar.POSTFIX >= minPrec) {
        this.advance();
        const prop = this.advance();
        left = { kind: 'dot', object: left, property: prop.value };
        continue;
      }

      // Function call: expr(args)
      if (tok.type === TokenType.LParen && Grammar.POSTFIX >= minPrec) {
        this.advance();
        const args: Expr[] = [];
        while (!this.at(TokenType.RParen) && !this.at(TokenType.EOF)) {
          args.push(this.parseExpr(activeGrammar.sequencePrec + 1));
          this.eatV(',');
        }
        this.expect(TokenType.RParen);
        left = { kind: 'call', callee: left, args };
        continue;
      }

      // Index: expr[index] or empty expr[] (type array syntax)
      if (tok.type === TokenType.LBracket && Grammar.POSTFIX >= minPrec) {
        this.advance();
        if (this.at(TokenType.RBracket)) {
          // Empty brackets: Foo[] — type array syntax
          this.advance();
          left = { kind: 'index', object: left, index: { kind: 'none' } };
        } else {
          const index = this.parseExpr(Grammar.NONE);
          this.expect(TokenType.RBracket);
          left = { kind: 'index', object: left, index };
        }
        continue;
      }

      // Filter: expr{predicate}
      if (tok.type === TokenType.LBrace && Grammar.POSTFIX >= minPrec) {
        this.advance();
        const predicate = this.parseExpr(Grammar.NONE);
        this.expect(TokenType.RBrace);
        left = { kind: 'filter', target: left, predicate };
        continue;
      }

      // --- Postfix keywords (discovered from .ray grammar) ---
      if (activeGrammar.postfixKeywords.has(tok.value) && tok.value === 'if' && activeGrammar.conditionalPrec >= minPrec) {
        this.advance();
        const condition = this.parseExpr(activeGrammar.conditionalPrec + 1);
        let else_body: Expr | undefined;
        if (this.peek().value === 'else') {
          this.advance();
          else_body = this.parseExpr(activeGrammar.conditionalPrec);
        }
        left = { kind: 'if', condition, body: left, else_body };
        continue;
      }
      if (activeGrammar.postfixKeywords.has(tok.value) && tok.value === 'unless' && activeGrammar.conditionalPrec >= minPrec) {
        this.advance();
        const condition = this.parseExpr(activeGrammar.conditionalPrec + 1);
        left = { kind: 'if', condition: { kind: 'unary', op: '!', operand: condition }, body: left };
        continue;
      }

      // --- Binary operators (discovered from .ray grammar) ---
      const binEntry = activeGrammar.binaryOps.get(tok.value);
      if (binEntry) {
        const { prec, assoc } = binEntry;
        if (prec < minPrec) break;
        this.advance();

        // Assignment: target = value
        if (tok.value === '=') {
          const right = this.parseExpr(prec);
          left = { kind: 'assign', target: left, value: right };
          continue;
        }

        // Compound assignment: target &= value, target |= value, etc.
        if (tok.value.endsWith('=') && tok.value.length > 1 && tok.value !== '=>' && tok.value !== '==' && tok.value !== '!=' && tok.value !== '<=' && tok.value !== '>=') {
          const op = tok.value.slice(0, -1);
          const right = this.parseExpr(prec);
          left = { kind: 'compound_assign', op, target: left, value: right };
          continue;
        }

        // Arrow: params => body
        if (tok.value === '=>') {
          const body = this.parseExpr(prec);
          const params = exprToParamNames(left);
          left = { kind: 'arrow', params, body };
          continue;
        }

        const nextPrec = assoc === 'left' ? prec + 1 : prec;
        const right = this.parseExpr(nextPrec);

        // Sequence: a; b; c → sequence node
        if (tok.value === ';') {
          if (left.kind === 'sequence') { left.exprs.push(right); }
          else { left = { kind: 'sequence', exprs: [left, right] }; }
          continue;
        }

        left = { kind: 'binary', op: tok.value, left, right };
        continue;
      }

      // --- Juxtaposition: space as function call ---
      // Two adjacent atoms (identifier followed by another atom) = function call
      if (canStartExpr(tok) && Grammar.JUXTAPOSITION >= minPrec) {
        // Don't treat keywords as juxtaposed calls (from grammar)
        if (activeGrammar.breakKeywords.has(tok.value)) break;
        const arg = this.parseExpr(Grammar.JUXTAPOSITION + 1);
        left = { kind: 'call', callee: left, args: [arg] };
        continue;
      }

      break;
    }

    return left;
  }

  private parseAtom(): Expr {
    const tok = this.peek();

    // String literal
    if (tok.type === TokenType.String) {
      this.advance();
      return { kind: 'string', value: tok.value };
    }

    // Number literal
    if (tok.type === TokenType.Number) {
      this.advance();
      return { kind: 'number', value: Number(tok.value) };
    }

    // Boolean/None keywords
    if (tok.value === 'None') { this.advance(); return { kind: 'none' }; }
    if (tok.value === 'true') { this.advance(); return { kind: 'boolean', value: true }; }
    if (tok.value === 'false') { this.advance(); return { kind: 'boolean', value: false }; }

    // this
    if (tok.value === 'this') { this.advance(); return { kind: 'this' }; }

    // & (context/current program reference)
    if (tok.value === '&') {
      this.advance();
      // &caller → &.caller, &parent → &.parent
      if (this.at(TokenType.Word)) {
        const prop = this.advance();
        return { kind: 'dot', object: { kind: 'context' }, property: prop.value };
      }
      return { kind: 'context' };
    }

    // Prefix operators (discovered from .ray grammar)
    if (activeGrammar.prefixOps.has(tok.value)) {
      const op = tok.value === '¬' || tok.value === 'not' ? '!' : tok.value;
      this.advance();
      const operand = this.parseExpr(Grammar.UNARY);
      return { kind: 'unary', op, operand };
    }

    // Prefix dot: .property (shorthand for this.property)
    if (tok.value === '.') {
      this.advance();
      const prop = this.advance();
      return { kind: 'dot', object: { kind: 'this' }, property: prop.value };
    }

    // Grouped expression: (expr)
    if (tok.type === TokenType.LParen) {
      this.advance();
      if (this.at(TokenType.RParen)) { this.advance(); return { kind: 'none' }; }
      const expr = this.parseExpr(Grammar.NONE);
      // Check for comma-separated list (tuple/args)
      if (this.atV(',')) {
        const elements = [expr];
        while (this.eatV(',')) {
          if (this.at(TokenType.RParen)) break;
          elements.push(this.parseExpr(activeGrammar.sequencePrec + 1));
        }
        this.expect(TokenType.RParen);
        return { kind: 'array', elements };
      }
      this.expect(TokenType.RParen);
      return expr;
    }

    // Array literal: [a, b, c]
    if (tok.type === TokenType.LBracket) {
      this.advance();
      const elements: Expr[] = [];
      while (!this.at(TokenType.RBracket) && !this.at(TokenType.EOF)) {
        elements.push(this.parseExpr(activeGrammar.sequencePrec + 1));
        this.eatV(',');
      }
      this.expect(TokenType.RBracket);
      return { kind: 'array', elements };
    }

    // Hash/superposition: #, ##, ###
    if (tok.value === '#' || tok.value === '##' || tok.value === '###') {
      this.advance();
      return { kind: 'ident', name: tok.value };
    }

    // Star: * (wildcard/Node type)
    if (tok.value === '*') {
      this.advance();
      return { kind: 'ident', name: '*' };
    }

    // @ (at-expressions)
    if (tok.value === '@') {
      this.advance();
      if (this.at(TokenType.Word)) {
        const name = this.advance();
        return { kind: 'ident', name: '@' + name.value };
      }
      return { kind: 'ident', name: '@' };
    }

    // Word token (identifier/variable/class reference)
    if (tok.type === TokenType.Word) {
      this.advance();
      return { kind: 'ident', name: tok.value };
    }

    // Any remaining single token — treat as identifier
    if (tok.type !== TokenType.EOF) {
      this.advance();
      return { kind: 'ident', name: tok.value };
    }

    return { kind: 'none' };
  }
}

function canStartExpr(tok: Token): boolean {
  return tok.type === TokenType.Word || tok.type === TokenType.String ||
    tok.type === TokenType.Number || tok.type === TokenType.LParen ||
    tok.type === TokenType.LBracket ||
    tok.value === '*' || tok.value === '.' || tok.value === '&' ||
    tok.value === '@' || tok.value === '#' || tok.value === '##' || tok.value === '###' ||
    tok.value === 'true' || tok.value === 'false' || tok.value === 'None' ||
    tok.value === 'this' || activeGrammar.prefixOps.has(tok.value);
}

function exprToParamNames(expr: Expr): string[] {
  if (expr.kind === 'ident') return [expr.name];
  if (expr.kind === 'none') return [];
  if (expr.kind === 'array') return expr.elements.flatMap(e => exprToParamNames(e));
  if (expr.kind === 'binary' && expr.op === ':') {
    // name: Type → just the name
    return exprToParamNames(expr.left);
  }
  return ['_'];
}

// --- Expression Evaluator ---

function evalExpr(expr: Expr, ctx: Context): Node {
  switch (expr.kind) {
    case 'none': return Node.NONE;
    case 'string': return Node.string(expr.value);
    case 'number': return Node.number(expr.value);
    case 'boolean': return Node.boolean(expr.value);
    case 'this': return ctx.self;
    case 'context': return ctx.program as Node;

    case 'ident': {
      const resolved = ctx.resolve(expr.name);
      if (resolved !== null) return resolved;
      return Node.string(expr.name);  // Unresolved → name string (for class Foo → class("Foo"))
    }

    case 'dot': {
      const obj = evalExpr(expr.object, ctx);
      // Special: ==.instance_of, ==.isomorphic, etc.
      if (expr.property === 'instance_of' || expr.property === 'isomorphic') {
        // Return a callable node that performs the check
        const checker = new Node();
        checker.program = new Program('', ctx);
        checker.program._paramNames = ['_target'];
        checker.encoded = { __builtin: `==.${expr.property}`, receiver: obj };
        return checker;
      }
      const prop = obj.get(expr.property);
      if (prop !== null) {
        // If the property has a program body, it could be evaluated
        // but we return the property node itself (lazy evaluation)
        return prop;
      }
      return Node.NONE;
    }

    case 'index': {
      const obj = evalExpr(expr.object, ctx);
      const idx = evalExpr(expr.index, ctx);
      if (typeof idx.encoded === 'number') {
        // Numeric index into a Ray/list
        let i = 0;
        for (const node of obj.forward()) {
          if (i === idx.encoded) return node;
          i++;
        }
        return Node.NONE;
      }
      // Key-based index
      const result = obj.get(idx);
      return result || Node.NONE;
    }

    case 'call': {
      const callee = evalExpr(expr.callee, ctx);
      const args = expr.args.map(a => evalExpr(a, ctx));

      // Builtin ==.instance_of check
      if (callee.encoded && typeof callee.encoded === 'object' && callee.encoded.__builtin) {
        if (callee.encoded.__builtin === '==.instance_of' && args.length > 0) {
          return Node.boolean(callee.encoded.receiver.instanceOf(args[0]));
        }
      }

      // External method dispatch
      if (callee.encoded && typeof callee.encoded === 'object' && callee.encoded.__external) {
        return callee.encoded.fn(ctx.self, args);
      }

      // Class instantiation: ClassName(args) — execute constructor
      if (callee.isClass) {
        const instance = new Node();
        instance.type = callee;

        // Set .static pointing back to class
        instance.set('static', callee);

        // Look for constructor (() method on class)
        const ctor = callee.get('()');
        if (ctor && ctor.program) {
          // Execute constructor body with instance as 'this' and 'local'
          const ctorCtx = ctor.program.context.child(instance);
          ctorCtx.define('this', instance);
          ctorCtx.define('local', instance);
          // Bind args
          for (let i = 0; i < Math.min(args.length, ctor.program._paramNames.length); i++) {
            ctorCtx.define(ctor.program._paramNames[i], args[i]);
          }
          if (ctor.program._parsedExpr) {
            evalExpr(ctor.program._parsedExpr, ctorCtx);
          } else if (ctor.program.expression) {
            const tokens = tokenize(ctor.program.expression);
            ctor.program._parsedExpr = new ExprParser(tokens).parse();
            evalExpr(ctor.program._parsedExpr, ctorCtx);
          }
        } else if (args.length === 1) {
          instance.encoded = args[0].encoded;
        }

        return instance;
      }

      // Function call: callee has a program body
      if (callee.program) {
        return callee.program.eval(ctx.self, args);
      }

      // If callee is a method name node, look it up on ctx.self
      if (typeof callee.encoded === 'string') {
        const method = ctx.self.get(callee.encoded);
        if (method && method.program) {
          return method.program.eval(ctx.self, args);
        }
      }

      // Fallback: if one arg, treat as property access (space operator)
      if (args.length === 1 && typeof args[0].encoded === 'string') {
        const prop = callee.get(args[0].encoded);
        if (prop !== null) return prop;
      }

      return callee;
    }

    case 'binary': {
      // Short-circuit: || and && must be handled before evaluating both sides
      if (expr.op === '||') {
        const left = evalExpr(expr.left, ctx);
        if (!left.isNone && left.encoded !== false) return left;
        return evalExpr(expr.right, ctx);
      }
      if (expr.op === '&&') {
        const left = evalExpr(expr.left, ctx);
        if (left.isNone || left.encoded === false) return left;
        return evalExpr(expr.right, ctx);
      }

      // Evaluate both sides
      const left = evalExpr(expr.left, ctx);
      const right = evalExpr(expr.right, ctx);

      // Method dispatch FIRST — look up operator on left node, dispatch to external or program
      const method = left.get(expr.op);
      if (method) {
        if (method.encoded && typeof method.encoded === 'object' && method.encoded.__external) {
          return method.encoded.fn(left, [right]);
        }
        if (method.program) {
          return method.program.eval(left, [right]);
        }
      }

      return Node.NONE;
    }

    case 'unary': {
      const operand = evalExpr(expr.operand, ctx);
      // Method dispatch: look up unary operator on operand
      const unaryMethod = operand.get(expr.op);
      if (unaryMethod) {
        if (unaryMethod.encoded && typeof unaryMethod.encoded === 'object' && unaryMethod.encoded.__external) {
          return unaryMethod.encoded.fn(operand, []);
        }
        if (unaryMethod.program) {
          return unaryMethod.program.eval(operand, []);
        }
      }
      return Node.NONE;
    }

    case 'assign': {
      const value = evalExpr(expr.value, ctx);
      if (expr.target.kind === 'ident') {
        ctx.define(expr.target.name, value);
        return value;
      }
      if (expr.target.kind === 'dot') {
        const obj = evalExpr(expr.target.object, ctx);
        obj.set(expr.target.property, value);
        return value;
      }
      return value;
    }

    case 'compound_assign': {
      // Node.ray lines 152-153: {operator}= (x) => this = this[operator](x)
      // All compound assignment dispatches through the operator method
      const target = expr.target;
      const value = evalExpr(expr.value, ctx);
      const current = evalExpr(target, ctx);

      // Look up the operator method on current and call it: this[operator](x)
      let combined: Node = current;
      const opMethod = current.get(expr.op);
      if (opMethod) {
        if (opMethod.encoded && typeof opMethod.encoded === 'object' && opMethod.encoded.__external) {
          combined = opMethod.encoded.fn(current, [value]);
        } else if (opMethod.program) {
          combined = opMethod.program.eval(current, [value]);
        }
      }
      // Re-assign
      if (target.kind === 'ident') { ctx.define(target.name, combined); return combined; }
      if (target.kind === 'dot') {
        const obj = evalExpr(target.object, ctx);
        obj.set(target.property, combined);
        return combined;
      }
      return combined;
    }

    case 'sequence': {
      let result: Node = Node.NONE;
      for (const e of expr.exprs) {
        result = evalExpr(e, ctx);
      }
      return result;
    }

    case 'if': {
      const condition = evalExpr(expr.condition, ctx);
      if (!condition.isNone && condition.encoded !== false) {
        return evalExpr(expr.body, ctx);
      }
      if (expr.else_body) return evalExpr(expr.else_body, ctx);
      return Node.NONE;
    }

    case 'arrow': {
      const fn = new Node();
      const prog = new Program('', ctx);
      prog._parsedExpr = expr.body;
      prog._paramNames = expr.params;
      fn.program = prog;
      return fn;
    }

    case 'array': {
      if (expr.elements.length === 0) return Node.NONE;
      const first = evalExpr(expr.elements[0], ctx);
      let current = first;
      for (let i = 1; i < expr.elements.length; i++) {
        const next = evalExpr(expr.elements[i], ctx);
        current.push(next);
        current = next;
      }
      return first;
    }

    case 'filter': {
      const target = evalExpr(expr.target, ctx);
      // Apply filter predicate to each superposed value
      // For now, just return target (filter is complex to implement fully)
      return target;
    }
  }
}

// Pretty-print an Expr (for debugging)
function exprToString(expr: Expr): string {
  switch (expr.kind) {
    case 'none': return 'None';
    case 'string': return `"${expr.value}"`;
    case 'number': return String(expr.value);
    case 'boolean': return String(expr.value);
    case 'ident': return expr.name;
    case 'this': return 'this';
    case 'context': return '&';
    case 'dot': return `${exprToString(expr.object)}.${expr.property}`;
    case 'index': return `${exprToString(expr.object)}[${exprToString(expr.index)}]`;
    case 'call': return `${exprToString(expr.callee)}(${expr.args.map(exprToString).join(', ')})`;
    case 'binary': return `(${exprToString(expr.left)} ${expr.op} ${exprToString(expr.right)})`;
    case 'unary': return `${expr.op}${exprToString(expr.operand)}`;
    case 'assign': return `${exprToString(expr.target)} = ${exprToString(expr.value)}`;
    case 'compound_assign': return `${exprToString(expr.target)} ${expr.op}= ${exprToString(expr.value)}`;
    case 'sequence': return expr.exprs.map(exprToString).join('; ');
    case 'if': return `${exprToString(expr.body)} if ${exprToString(expr.condition)}`;
    case 'arrow': return `(${expr.params.join(', ')}) => ${exprToString(expr.body)}`;
    case 'array': return `[${expr.elements.map(exprToString).join(', ')}]`;
    case 'filter': return `${exprToString(expr.target)}{${exprToString(expr.predicate)}}`;
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
    this.global.define('global', this.global.local);
  }

  registerBuiltins(): void {
    // Minimal kernel: only * (Node) class + externals + singletons
    // Create * (Node) class — the kernel
    const NodeClass = new Node();
    NodeClass.set('static', NodeClass);  // static === self → is a class
    NodeClass.className = '*';
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

    // === Superposition / composition (Node.ray lines 134-135, 144) ===

    // | — non-destructive superposition for expressions, mutating for &=
    // Also handles class alias: class * | Node → register "Node" as alias for * class
    this.registerExternal(NodeClass, '|', (self, args) => {
      if (args.length === 0) return self;
      const arg = args[0];
      // Class alias: when called on a class with a string argument, register as alias
      if (self.isClass && typeof arg.encoded === 'string') {
        const name = arg.encoded;
        this.classes.set(name, self);
        this.global.define(name, self);
        return self;  // return the class, not a superposition
      }
      // Regular OR superposition
      return Node.superpose(self, arg, '|');
    });
    this.registerExternal(NodeClass, '&', (self, args) => {
      if (args.length > 0) return Node.superpose(self, args[0], '&');
      return self;
    });
    this.registerExternal(NodeClass, '&+', (self, args) => {
      if (args.length > 0 && self !== Node._NODE_CLASS) return self.compose(args[0]);
      return self;
    });
    this.registerExternal(NodeClass, '&-', (self, _args) => self); // TODO: remove components
    this.registerExternal(NodeClass, '|+', (self, args) => {
      if (args.length > 0) return self.or(args[0]); // merge properties via |
      return self;
    });
    this.registerExternal(NodeClass, '|-', (self, _args) => self); // TODO: remove via |

    // === Type system (Node.ray lines 167-174, 212-246) ===

    this.registerExternal(NodeClass, '==.instance_of', (self, args) => {
      if (args.length > 0) return Node.boolean(self.instanceOf(args[0]));
      return Node.FALSE;
    });
    // : | ∈ (type) => this ~~ .type = type (Node.ray line 168)
    this.registerExternal(NodeClass, ':', (self, args) => {
      if (args.length > 0) { self.type = args[0]; }
      return self;
    });

    // === Arithmetic (primitive runtime operations) ===

    this.registerExternal(NodeClass, '+', (self, args) => {
      if (args.length === 0) return self;
      const r = args[0];
      if (typeof self.encoded === 'number' && typeof r.encoded === 'number')
        return Node.number(self.encoded + r.encoded);
      if (typeof self.encoded === 'string' || typeof r.encoded === 'string')
        return Node.string(String(self.encoded ?? '') + String(r.encoded ?? ''));
      return Node.NONE;
    });
    this.registerExternal(NodeClass, '-', (self, args) => {
      if (args.length === 0) {
        if (typeof self.encoded === 'number') return Node.number(-self.encoded);
        return Node.NONE;
      }
      if (typeof self.encoded === 'number' && typeof args[0].encoded === 'number')
        return Node.number(self.encoded - args[0].encoded);
      return Node.NONE;
    });
    this.registerExternal(NodeClass, '/', (self, args) => {
      if (args.length > 0 && typeof self.encoded === 'number' && typeof args[0].encoded === 'number')
        return args[0].encoded !== 0 ? Node.number(self.encoded / args[0].encoded) : Node.NONE;
      return Node.NONE;
    });
    this.registerExternal(NodeClass, '%', (self, args) => {
      if (args.length > 0 && typeof self.encoded === 'number' && typeof args[0].encoded === 'number')
        return Node.number(self.encoded % args[0].encoded);
      return Node.NONE;
    });

    // === Comparison (primitive runtime operations) ===

    this.registerExternal(NodeClass, '==', (self, args) => {
      if (args.length === 0) return Node.FALSE;
      const r = args[0];
      if (self === r) return Node.TRUE;
      if (self.encoded !== UNKNOWN && r.encoded !== UNKNOWN && self.encoded === r.encoded) return Node.TRUE;
      return Node.FALSE;
    });
    this.registerExternal(NodeClass, '!=', (self, args) => {
      if (args.length === 0) return Node.TRUE;
      const r = args[0];
      if (self === r) return Node.FALSE;
      if (self.encoded !== UNKNOWN && r.encoded !== UNKNOWN && self.encoded === r.encoded) return Node.FALSE;
      return Node.TRUE;
    });
    this.registerExternal(NodeClass, '<', (self, args) => {
      if (args.length === 0) return Node.FALSE;
      const arg = args[0];
      // Class inheritance: extends | < does &+ (compose)
      if (self.isClass) {
        if (self !== Node._NODE_CLASS) {
          // Compose with each superposed class in the argument
          for (const comp of arg.superposed()) {
            if (comp.isClass && comp !== self) self.compose(comp);
          }
          if (arg.isClass && arg !== self) self.compose(arg);
        }
        return self;
      }
      // Numeric comparison
      if (typeof self.encoded === 'number' && typeof arg.encoded === 'number')
        return Node.boolean(self.encoded < arg.encoded);
      return Node.FALSE;
    });
    this.registerExternal(NodeClass, '>', (self, args) => {
      if (args.length > 0 && typeof self.encoded === 'number' && typeof args[0].encoded === 'number')
        return Node.boolean(self.encoded > args[0].encoded);
      return Node.FALSE;
    });
    this.registerExternal(NodeClass, '<=', (self, args) => {
      if (args.length > 0 && typeof self.encoded === 'number' && typeof args[0].encoded === 'number')
        return Node.boolean(self.encoded <= args[0].encoded);
      return Node.FALSE;
    });
    this.registerExternal(NodeClass, '>=', (self, args) => {
      if (args.length > 0 && typeof self.encoded === 'number' && typeof args[0].encoded === 'number')
        return Node.boolean(self.encoded >= args[0].encoded);
      return Node.FALSE;
    });

    // === Pipelines (Node.ray lines 44-45) ===
    // ~~ (call: (: this): T): this => call(this); this
    this.registerExternal(NodeClass, '~~', (self, args) => {
      if (args.length > 0 && args[0].program) args[0].program.eval(self);
      return self;
    });
    // -- (call: (: this): T): T => call(this) ?? this
    this.registerExternal(NodeClass, '--', (self, args) => {
      if (args.length > 0 && args[0].program) {
        const result = args[0].program.eval(self);
        return result.isNone ? self : result;
      }
      return self;
    });

    // === Generator (Node.ray line 180) ===
    // -> creates lazy chain
    this.registerExternal(NodeClass, '->', (self, args) => {
      if (args.length > 0 && args[0].program) {
        // Apply closure to generate next value
        const next = args[0].program.eval(self);
        self.push(next);
        return self;
      }
      const result = new Node();
      result.encoded = self.encoded;
      self.push(result);
      return self;
    });

    // === Negation (boolean.ray) ===
    this.registerExternal(NodeClass, '!', (self) => {
      return (self.isNone || self.encoded === false) ? Node.TRUE : Node.FALSE;
    });

    // === Conversion (Node.ray line 257) ===
    this.registerExternal(NodeClass, 'as', (self, args) => {
      if (args.length === 0) return self;
      const target = args[0];
      if (target.className === 'boolean' || target.matchesName('boolean'))
        return self.isNone ? Node.FALSE : Node.TRUE;
      if (target.className === 'String' || target.matchesName('String'))
        return new Node(String(self.encoded));
      if (target.className === 'Number' || target.matchesName('Number'))
        return new Node(Number(self.encoded));
      return Node.NONE;
    });

    // === Modifier: `static` as pass-through in globals (NOT on * — would overwrite static=self) ===
    const staticMethod = new Node();
    staticMethod.encoded = { __external: true, fn: (_self: Node, args: Node[]) => args.length > 0 ? args[0] : _self };
    staticMethod.className = 'static';
    this.global.define('static', staticMethod);

    // === Class creation (Node.ray lines 5-36) ===
    this.registerExternal(NodeClass, 'class', (_self, args) => {
      if (args.length === 0) return Node.NONE;
      const arg = args[0];
      // console.log(`  [class external] arg.encoded=${String(arg.encoded)} arg.isClass=${arg.isClass} arg.className=${arg.className}`);
      // If arg is already a class, return it (idempotent)
      if (arg.isClass) { this._classTrace?.push(`  class(${arg.className}) → idempotent`); return arg; }
      const name = typeof arg.encoded === 'string' ? arg.encoded : null;
      if (!name) return Node.NONE;
      // Idempotent: return existing class if it exists
      if (this.classes.has(name)) { this._classTrace?.push(`  class("${name}") → existing`); return this.classes.get(name)!; }
      this._classTrace?.push(`  class("${name}") → NEW`);
      const cls = new Node();
      cls.set('static', cls);  // static === self → is a class
      cls.className = name;
      cls.set('name', Node.string(name));
      this.classes.set(name, cls);
      this.global.define(name, cls);
      return cls;
    });

    // === Namespace creation (Node.ray lines 34-41) ===
    this.registerExternal(NodeClass, 'namespace', (_self, args) => {
      if (args.length === 0) return Node.NONE;
      const arg = args[0];
      if (arg.isClass) { this._classTrace?.push(`  namespace(${arg.className}) → idempotent`); return arg; }
      const name = typeof arg.encoded === 'string' ? arg.encoded : null;
      if (!name) return Node.NONE;
      if (this.classes.has(name)) { this._classTrace?.push(`  namespace("${name}") → existing`); return this.classes.get(name)!; }
      this._classTrace?.push(`  namespace("${name}") → NEW`);
      const cls = new Node();
      cls.set('static', cls);  // static === self → is a class
      cls.className = name;
      cls.set('name', Node.string(name));
      cls.set('static', cls);
      this.classes.set(name, cls);
      this.global.define(name, cls);
      return cls;
    });

    // Singletons
    this.global.define('None', Node.NONE);
    this.global.define('true', Node.TRUE);
    this.global.define('false', Node.FALSE);

    // Make Node class available
    this.global.define('*', NodeClass);
    this.global.define('Node', NodeClass);
  }

  registerMethod(cls: Node, name: string, body: string | null): void {
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
    if (body !== null) method.program = new Program(body, this.global);
    method.className = name;
    cls.set(name, method);
  }

  registerExternal(cls: Node, name: string, fn: (self: Node, args: Node[]) => Node): void {
    const method = new Node();
    method.encoded = { __external: true, fn };
    method.className = name;
    cls.set(name, method);
  }

  loadFile(filePath: string): ASTNode[] {
    return buildAST(tokenize(fs.readFileSync(filePath, 'utf-8')));
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

  constructMethodBody(methodNode: ASTNode): { body: string, params: string[] } | null {
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
    const bodyParts: string[] = [];
    for (const grandchild of firstChild.children) {
      if (grandchild.rawText) bodyParts.push(grandchild.rawText);
    }
    for (let i = 1; i < methodNode.children.length; i++) {
      if (methodNode.children[i].rawText) bodyParts.push(methodNode.children[i].rawText);
    }

    if (bodyParts.length === 0) return null;
    return { body: bodyParts.join('; '), params };
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
        method.className = name;
        Node._NODE_CLASS!.set(name, method);
      } else {
        // Single-line with => or no body
        this.handleDefinition(tokens, Node._NODE_CLASS!);
      }
    }
  }

  createScopeContext(scope: Node): Context {
    const prog = new Program('', this.global);
    return new Context(prog, this.global, scope);
  }

  handleDefinition(tokens: Token[], scope: Node): void {
    // Skip tokens that are just identifiers resolving to globals (like 'external', 'end')
    let startIdx = 0;
    while (startIdx < tokens.length) {
      const val = tokens[startIdx].value;
      if (isModifier(val) || val === 'end') {
        startIdx++;
      } else break;
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
    for (const name of names) {
      if (name) this.registerMethod(scope, name, body);
    }
  }

  evaluateStatements(nodes: ASTNode[], scope: Node, pass: 1 | 2 = 2): void {
    for (const node of nodes) {
      const tokens = node.tokens.filter(t => t.type !== TokenType.Comment);
      if (tokens.length === 0) continue;

      // Everything is evaluated as an expression — no AST fallback
      let result: Node | null = null;
      let parseError: string | null = null;
      try {
        const expr = new ExprParser(tokens).parse();
        if (expr.kind !== 'none') {
          const ctx = this.createScopeContext(scope);
          result = evalExpr(expr, ctx);
        }
      } catch (e: any) {
        parseError = e.message || String(e);
      }

      // Trace: if this was classified as class/namespace by AST but expression
      // didn't produce a class, log why
      if (pass === 1 && (node.kind === 'class' || node.kind === 'namespace') && (!result || !result.isClass)) {
        const raw = tokens.map(t => t.value).join(' ');
        const truncated = raw.length > 80 ? raw.slice(0, 80) + '...' : raw;
        if (parseError) {
          this._classTrace.push(`  [MISS] ${truncated}  ERROR: ${parseError}`);
        } else if (result) {
          this._classTrace.push(`  [MISS] ${truncated}  GOT: ${String(result.encoded)} (isClass=${result.isClass})`);
        } else {
          this._classTrace.push(`  [MISS] ${truncated}  GOT: null`);
        }
      }

      // If result is a class/scope, register it and recurse into children
      if (result && result.isClass) {
        const nameNode = result.getDirect('name');
        if (nameNode && typeof nameNode.encoded === 'string') {
          const name = nameNode.encoded;
          if (!this.classes.has(name)) {
            this.classes.set(name, result);
            result.className = result.className || name;
          }
        }
        if (result.className && !this.classes.has(result.className)) {
          this.classes.set(result.className, result);
        }
        if (node.children.length > 0) {
          this.evaluateStatements(node.children, result, pass);
        }
        continue;
      }

      // If expression eval didn't produce a class result, but the AST node
      // is classified as class/namespace with known names, look up the
      // existing class (e.g., * created by registerBuiltins) and recurse
      // into children using it as scope.
      if ((!result || !result.isClass) && (node.kind === 'class' || node.kind === 'namespace') && node.names) {
        let existingClass: Node | null = null;
        for (const name of node.names) {
          existingClass = this.classes.get(name) || null;
          if (existingClass) break;
        }
        if (existingClass && node.children.length > 0) {
          this.evaluateStatements(node.children, existingClass, pass);
          continue;
        }
      }

      // Pass 1: only interested in class/namespace creation, skip definitions
      if (pass === 1) continue;

      // Pass 2: handle as definition (space syntax behavior)
      // If the class wasn't created by expression eval, definitions are called
      // on None (the unresolved scope) and nothing happens.
      this.handleDefinition(tokens, scope);

      // Process nested definitions
      if (node.children.length > 0 && result === null) {
        const defName = this.extractFirstName(tokens.filter(t => !isModifier(t.value) && t.value !== 'end'));
        if (defName) {
          const methodNode = scope.get(defName);
          if (methodNode) this.evaluateStatements(node.children, methodNode, pass);
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

    // Step 4: Pre-load Node.ray definitions onto * (including multi-line method bodies)
    console.log('\nStep 4: Pre-loading Node.ray definitions onto *...');
    this.preloadNodeRay(ast);
    console.log(`  * class now has ${Node._NODE_CLASS!.methodCount} methods`);

    // Step 5: Add class/namespace to global scope + modifier keywords
    console.log('\nStep 5: Setting up global scope...');
    this.global.define('class', Node._NODE_CLASS!.get('class')!);
    this.global.define('namespace', Node._NODE_CLASS!.get('namespace')!);
    // static is already in globals from registerBuiltins
    for (const word of ['external', 'dynamically', 'internal', 'protected', 'delegate', 'end']) {
      this.global.define(word, Node.string(word));
    }

    // Step 6: PASS 1 — evaluate all expressions (forward-declares classes)
    console.log('\nStep 6: Pass 1 — evaluating expressions (forward-declare classes)...');
    this.evaluateStatements(ast, Node._NODE_CLASS!, 1);
    console.log(`  Classes after pass 1: ${this.classes.size}`);

    // Step 7: PASS 2 on Node.ray children — register methods on * first
    console.log('\nStep 7: Pass 2 — processing Node.ray methods...');
    const nodeChildren = findClassChildren(ast, ['*', 'Node']);
    this.evaluateStatements(nodeChildren, Node._NODE_CLASS!, 2);
    console.log(`  * class now has ${Node._NODE_CLASS!.methodCount} methods`);

    // Step 8: PASS 2 on everything — full evaluation (inheritance + definitions)
    console.log('\nStep 8: Pass 2 — full evaluation (all classes)...');
    this.evaluateStatements(ast, Node._NODE_CLASS!, 2);

    // Step 9: Inject all classes into global scope
    console.log('\nStep 9: Injecting globals...');
    for (const [name, cls] of this.classes) this.global.define(name, cls);
    console.log(`  ${this.classes.size} classes: ${[...this.classes.keys()].join(', ')}`);

    console.log('\n=== Bootstrap Complete ===\n');

    // Print class creation trace
    const newClasses = this._classTrace.filter(t => t.includes('→ NEW'));
    const misses = this._classTrace.filter(t => t.includes('[MISS]'));
    console.log(`Class creation trace: ${newClasses.length} created, ${misses.length} missed`);
    if (misses.length > 0) {
      console.log(`\n  Missed class/namespace definitions:`);
      for (const t of misses) console.log(t);
    }
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
    console.log('');
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
      if (node.kind === 'class' || node.kind === 'namespace') {
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
    if (node.isClass) return `<class ${node.className || '*'}>`;
    if (node.className) return `<${node.className}>`;
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
      const entrypoint = path.join(location, 'Ether.ray');
      if (fs.existsSync(entrypoint)) {
        console.log(`Loading entrypoint: ${entrypoint}`);
        const ast = bootstrap.loadFile(entrypoint);
        console.log(`Parsed ${ast.length} statements from entrypoint\n`);
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
