// ============================================================
// Ether UI Framework — Temporary Runtime
// ============================================================

import source from './index.ray?raw';

// --- CSS ---
const _s = document.createElement('style');
_s.textContent = [
  `*, *::before, *::after { box-sizing: border-box; }`,
  `.block { display: block; }`,
  `.inline { display: inline; }`,
  `.ether-center { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; }`,
  `.ether-center-h { display: flex; justify-content: center; }`,
  `.ether-center-v { display: flex; flex-direction: column; justify-content: center; height: 100%; }`,
  `.ether-between { display: flex; justify-content: space-between; }`,
  `.ether-start { display: flex; justify-content: flex-start; }`,
  `.ether-end { display: flex; justify-content: flex-end; }`,
].join('\n');
document.head.appendChild(_s);

const _userStyles = document.createElement('style');
document.head.appendChild(_userStyles);

const LAYOUT: Record<string, string> = {
  'Center': 'ether-center',
  'Center.Horizontally': 'ether-center-h',
  'Center.Vertically': 'ether-center-v',
  'Between': 'ether-between',
  'Start': 'ether-start',
  'End': 'ether-end',
};

const PAD: Record<string, (r: number) => string> = {
  'pt': (r) => `padding-top:${r}rem;`,
  'pb': (r) => `padding-bottom:${r}rem;`,
  'pl': (r) => `padding-left:${r}rem;`,
  'pr': (r) => `padding-right:${r}rem;`,
  'px': (r) => `padding-left:${r}rem;padding-right:${r}rem;`,
  'py': (r) => `padding-top:${r}rem;padding-bottom:${r}rem;`,
};

const DOT_STYLE: Record<string, string> = {
  'italic': 'font-style:italic;',
  'bold': 'font-weight:bold;',
  'underline': 'text-decoration:underline;',
  'strikethrough': 'text-decoration:line-through;',
  'uppercase': 'text-transform:uppercase;',
  'lowercase': 'text-transform:lowercase;',
  'mono': 'font-family:monospace;',
  'small': 'font-size:0.875rem;',
  'large': 'font-size:1.25rem;',
  'center': 'text-align:center;',
  'nowrap': 'white-space:nowrap;',
};

interface ComponentDef { children: INode[]; }
const COMPONENTS: Record<string, ComponentDef> = {};

// ============================================================
// Reactive System
// ============================================================

type Effect = () => void;
let _tracking: Effect | null = null;
let _batching = false;
const _queue = new Set<Effect>();

export function signal<T>(init: T): [() => T, (v: T) => void] {
  let val = init;
  const deps = new Set<Effect>();
  return [
    () => { if (_tracking) deps.add(_tracking); return val; },
    (v: T) => {
      if (Object.is(val, v)) return;
      val = v;
      if (_batching) deps.forEach(d => _queue.add(d));
      else { for (const d of [...deps]) d(); }
    }
  ];
}

export function effect(fn: Effect): () => void {
  const run = () => { const prev = _tracking; _tracking = run; fn(); _tracking = prev; };
  run();
  return () => {};
}

export function batch(fn: () => void) {
  _batching = true;
  fn();
  _batching = false;
  const fns = [..._queue];
  _queue.clear();
  fns.forEach(f => f());
}

// ============================================================
// Virtual DOM
// ============================================================

interface VEl { t: 'e'; tag: string; props: Record<string, any>; ch: VN[]; dom?: HTMLElement; }
interface VTx { t: 't'; v: string; dom?: Text; }
type VN = VEl | VTx;

function ve(tag: string, props: Record<string, any>, ch: VN[]): VEl {
  return { t: 'e', tag, props, ch };
}
function vt(v: string): VTx { return { t: 't', v }; }
function vblock(ch: VN[]): VEl { return ve('div', { className: 'block' }, ch); }
function vspan(ch: VN[]): VEl { return ve('div', { className: 'inline' }, ch); }

function addClassName(v: VN, cls: string): VN {
  if (v.t === 't') return ve('div', { className: 'inline ' + cls }, [v]);
  const cur = v.props.className || '';
  return { ...v, props: { ...v.props, className: cur ? cur + ' ' + cls : cls } };
}

function addStyle(v: VN, style: string): VN {
  if (v.t === 't') return ve('div', { className: 'inline', style }, [v]);
  const cur = v.props.style || '';
  return { ...v, props: { ...v.props, style: cur + style } };
}

function addWidth(v: VN, frac: number): VN {
  const pct = (frac * 100).toFixed(4).replace(/\.?0+$/, '');
  return addStyle(v, `width:${pct}%;min-width:0;`);
}

// ============================================================
// DOM Operations
// ============================================================

function applyProps(d: HTMLElement, o: Record<string, any>, n: Record<string, any>) {
  for (const k of Object.keys(o)) {
    if (!(k in n)) {
      if (k.startsWith('on')) d.removeEventListener(k.slice(2).toLowerCase(), o[k]);
      else if (k === 'className') d.className = '';
      else if (k === 'style') d.style.cssText = '';
      else d.removeAttribute(k);
    }
  }
  for (const [k, v] of Object.entries(n)) {
    if (o[k] === v) continue;
    if (k.startsWith('on')) {
      if (o[k]) d.removeEventListener(k.slice(2).toLowerCase(), o[k]);
      d.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'className') { d.className = v; }
    else if (k === 'style') { d.style.cssText = v; }
    else d.setAttribute(k, String(v));
  }
}

function createDom(v: VN): Node {
  if (v.t === 't') { const d = document.createTextNode(v.v); v.dom = d; return d; }
  const d = document.createElement(v.tag);
  v.dom = d;
  applyProps(d, {}, v.props);
  v.ch.forEach(c => d.appendChild(createDom(c)));
  return d;
}

function patch(par: Node, ov: VN | null, nv: VN | null, idx: number) {
  const ch = par.childNodes[idx];
  if (!ov && nv) { par.appendChild(createDom(nv)); return; }
  if (ov && !nv) { if (ch) par.removeChild(ch); return; }
  if (!ov || !nv) return;
  if (ov.t !== nv.t || (ov.t === 'e' && nv.t === 'e' && ov.tag !== nv.tag)) {
    par.replaceChild(createDom(nv), ch); return;
  }
  if (ov.t === 't' && nv.t === 't') {
    nv.dom = ov.dom;
    if (ov.v !== nv.v && ch) ch.textContent = nv.v;
    return;
  }
  if (ov.t === 'e' && nv.t === 'e') {
    nv.dom = ov.dom;
    applyProps(ch as HTMLElement, ov.props, nv.props);
    const oc = ov.ch, nc = nv.ch;
    const mx = Math.max(oc.length, nc.length);
    for (let i = mx - 1; i >= 0; i--) patch(ch, oc[i] ?? null, nc[i] ?? null, i);
  }
}

// ============================================================
// Mount
// ============================================================

export function mount(container: HTMLElement, render: () => VN): () => void {
  let prev: VN | null = null;
  return effect(() => {
    const next = render();
    if (prev) {
      patch(container, prev, next, 0);
    } else {
      container.innerHTML = '';
      container.appendChild(createDom(next));
    }
    prev = next;
  });
}

// ============================================================
// Tokenizer
// ============================================================

type Tk =
  | { t: 'id'; v: string }
  | { t: 'str'; v: string }
  | { t: 'num'; v: number }
  | { t: '(' } | { t: ')' }
  | { t: ',' } | { t: '+' } | { t: '*' } | { t: '/' }
  | { t: ':' } | { t: 'val'; v: string }
  | { t: '.' } | { t: '%' }
  | { t: 'constraint'; v: string }
  | { t: 'bsep' };

function tokenize(s: string): Tk[] {
  const r: Tk[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === ' ') {
      let n = 0; while (i < s.length && s[i] === ' ') { n++; i++; }
      if (n >= 2 && r.length > 0) r.push({ t: 'bsep' });
      continue;
    }
    if (s[i] === '(') { r.push({ t: '(' }); i++; continue; }
    if (s[i] === ')') { r.push({ t: ')' }); i++; continue; }
    if (s[i] === ',') { r.push({ t: ',' }); i++; continue; }
    if (s[i] === '+') { r.push({ t: '+' }); i++; continue; }
    if (s[i] === '*') { r.push({ t: '*' }); i++; continue; }
    if (s[i] === '/') { r.push({ t: '/' }); i++; continue; }
    if (s[i] === '%') { r.push({ t: '%' }); i++; continue; }
    if (s[i] === '{') {
      i++;
      let content = '';
      while (i < s.length && s[i] !== '}') { content += s[i]; i++; }
      if (i < s.length) i++;
      r.push({ t: 'constraint', v: content.trim() });
      continue;
    }
    if (s[i] === '.') { r.push({ t: '.' }); i++; continue; }
    if (s[i] === ':') {
      r.push({ t: ':' }); i++;
      while (i < s.length && s[i] === ' ') i++;
      let val = '';
      while (i < s.length && s[i] !== ',' && s[i] !== ')') { val += s[i]; i++; }
      val = val.trimEnd();
      if (val) r.push({ t: 'val', v: val });
      continue;
    }
    if (s[i] === '"' || s[i] === "'") {
      const q = s[i]; i++;
      let str = '';
      while (i < s.length && s[i] !== q) {
        if (s[i] === '\\') { i++; str += s[i] || ''; } else str += s[i];
        i++;
      }
      i++;
      r.push({ t: 'str', v: str });
      continue;
    }
    if (/[0-9]/.test(s[i])) {
      let num = '';
      while (i < s.length && /[0-9.]/.test(s[i])) { num += s[i]; i++; }
      r.push({ t: 'num', v: parseFloat(num) });
      continue;
    }
    if (/[a-zA-Z_$]/.test(s[i])) {
      let id = '';
      while (i < s.length && /[a-zA-Z0-9_$]/.test(s[i])) { id += s[i]; i++; }
      // Allow dots in identifiers only for known compound names (e.g. Center.Horizontally)
      while (i < s.length && s[i] === '.' && i + 1 < s.length && /[a-zA-Z]/.test(s[i + 1])) {
        let j = i + 1;
        while (j < s.length && /[a-zA-Z0-9_$]/.test(s[j])) j++;
        const full = id + '.' + s.slice(i + 1, j);
        if (full in LAYOUT) { id = full; i = j; }
        else break;
      }
      r.push({ t: 'id', v: id });
      continue;
    }
    i++;
  }
  return r;
}

// ============================================================
// Pre-processor: join multi-line parentheses
// ============================================================

function joinMultiLineParens(src: string): string {
  const lines = src.split('\n');
  const result: string[] = [];
  let buffer = '';
  let depth = 0;
  for (const line of lines) {
    if (depth > 0) {
      buffer += ' ' + line.trimStart();
    } else {
      if (buffer) result.push(buffer);
      buffer = line;
    }
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '"' || c === "'") {
        const q = c; j++;
        while (j < line.length && line[j] !== q) {
          if (line[j] === '\\') j++;
          j++;
        }
      } else if (c === '(') depth++;
      else if (c === ')') depth = Math.max(0, depth - 1);
    }
  }
  if (buffer) result.push(buffer);
  return result.join('\n');
}

// ============================================================
// Indentation Tree
// ============================================================

interface INode { indent: number; content: string; children: INode[]; }

function buildIndentTree(src: string): INode[] {
  const lines: { indent: number; content: string }[] = [];
  for (const raw of src.split('\n')) {
    const m = raw.match(/^( *)(.*)/);
    if (!m) continue;
    const c = m[2].trimEnd();
    if (!c || c.startsWith('//')) continue;
    lines.push({ indent: m[1].length, content: c });
  }
  const root: INode[] = [];
  const stack: { indent: number; children: INode[] }[] = [{ indent: -1, children: root }];
  for (const { indent, content } of lines) {
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const node: INode = { indent, content, children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push({ indent, children: node.children });
  }
  return root;
}

// ============================================================
// Constraint Parsing: {width <= 1240px} → max-width:1240px;
// ============================================================

function parseConstraints(raw: string): string {
  return raw.split(',').map(part => {
    const m = part.trim().match(/^([\w.-]+)\s*([<>=!]+)\s*(.+)$/);
    if (!m) return '';
    const cssProp = m[1].replace(/\./g, '-');
    const op = m[2];
    const v = m[3].trim();
    if (op === '==' || op === '=') return `${cssProp}:${v};`;
    if (op === '<=' || op === '<') return `max-${cssProp}:${v};`;
    if (op === '>=' || op === '>') return `min-${cssProp}:${v};`;
    return '';
  }).join('');
}

// ============================================================
// Class Definition Processing
// ============================================================

function processClassDefs(nodes: INode[]) {
  let css = '';
  for (const k of Object.keys(COMPONENTS)) delete COMPONENTS[k];
  for (const node of nodes) {
    const name = node.content.replace(/^class\s+/, '').trim();
    const rules: string[] = [];
    const contentChildren: INode[] = [];
    for (const child of node.children) {
      const idx = child.content.indexOf(':');
      if (idx !== -1 && !/[("']/.test(child.content.slice(0, idx))) {
        const key = child.content.slice(0, idx).trim().replace(/\./g, '-');
        const val = child.content.slice(idx + 1).trim();
        rules.push(`${key}: ${val}`);
      } else {
        contentChildren.push(child);
      }
    }
    if (rules.length) css += `.${name} { ${rules.join('; ')}; }\n`;
    if (contentChildren.length > 0) {
      COMPONENTS[name] = { children: contentChildren };
    }
  }
  _userStyles.textContent = css;
}

// ============================================================
// Token Parser
// ============================================================

class TkParser {
  tks: Tk[]; pos: number; raw: string;
  constructor(tks: Tk[], raw = '') { this.tks = tks; this.pos = 0; this.raw = raw; }
  peek(off = 0): Tk | null { const i = this.pos + off; return i < this.tks.length ? this.tks[i] : null; }
  next(): Tk | null { return this.pos < this.tks.length ? this.tks[this.pos++] : null; }

  // Check if there are any top-level commas from current pos onward
  hasTopLevelComma(): boolean {
    let depth = 0;
    for (let i = this.pos + 1; i < this.tks.length; i++) {
      if (this.tks[i].t === '(') depth++;
      else if (this.tks[i].t === ')') depth--;
      else if (this.tks[i].t === ',' && depth === 0) return true;
    }
    return false;
  }

  // Check if id( or id{...}( at current position is a root call
  isRootCall(): boolean {
    let i = this.pos + 1;
    if (i < this.tks.length && this.tks[i].t === 'constraint') i++;
    if (i >= this.tks.length || this.tks[i].t !== '(') {
      // id{constraint} without parens — treat as root if no comma after
      while (i < this.tks.length) {
        if (this.tks[i].t === '+') { i++; if (i < this.tks.length && this.tks[i].t === 'id') i++; }
        else if (this.tks[i].t === '.') { i++; if (i < this.tks.length) i++; }
        else break;
      }
      return !(i < this.tks.length && this.tks[i].t === ',');
    }
    let depth = 0;
    for (; i < this.tks.length; i++) {
      if (this.tks[i].t === '(') depth++;
      else if (this.tks[i].t === ')') { depth--; if (depth === 0) { i++; break; } }
    }
    while (i < this.tks.length) {
      if (this.tks[i].t === '+') { i++; if (i < this.tks.length && this.tks[i].t === 'id') i++; }
      else if (this.tks[i].t === '.') { i++; if (i < this.tks.length) i++; }
      else break;
    }
    return !(i < this.tks.length && this.tks[i].t === ',');
  }

  parseLine(indentCh: VN[]): VN {
    const first = this.peek();
    if (!first) return vblock(indentCh);

    // Layout keyword
    if (first.t === 'id' && first.v in LAYOUT) {
      return this.parseLayoutLine(LAYOUT[first.v], indentCh);
    }

    // Component at line start (bare, no parens/constraint next, no sibling commas)
    if (first.t === 'id' && first.v in COMPONENTS) {
      const nx = this.peek(1);
      if ((!nx || (nx.t !== '(' && nx.t !== 'constraint')) && !this.hasTopLevelComma()) {
        return this.parseComponentLine(indentCh);
      }
    }

    // Root call: id(...) or id{...}(...) at start — only if no commas after
    // Exclude Image — it's an inline element, not a container
    if (first.t === 'id' && first.v !== 'Image') {
      const nx = this.peek(1);
      if ((nx?.t === '(' || nx?.t === 'constraint') && this.isRootCall()) {
        return this.parseRootCall(indentCh);
      }
    }

    return this.parseRegularLine(indentCh);
  }

  // Image args: properties + a path (quoted string or unquoted tokens)
  parseImageCallArgs(): { src: string; style: string } {
    let src = '';
    let style = '';
    while (this.peek() && this.peek()!.t !== ')') {
      if (this.peek()?.t === ',') { this.next(); continue; }
      // Property: id : val
      if (this.peek()?.t === 'id' && this.peek(1)?.t === ':') {
        const key = (this.next() as { v: string }).v.replace(/\./g, '-');
        this.next();
        const val = this.peek()?.t === 'val' ? (this.next() as { v: string }).v : '';
        style += `${key}: ${val}; `;
      } else if (this.peek()?.t === 'str') {
        src = (this.next() as { v: string }).v;
      } else {
        // Unquoted path — collect tokens until , or ) or property
        let path = '';
        while (this.peek()) {
          const pk = this.peek()!;
          if (pk.t === ',' || pk.t === ')') break;
          if (pk.t === 'id' && this.peek(1)?.t === ':') break;
          const tk = this.next()!;
          if (tk.t === 'id') path += tk.v;
          else if (tk.t === '.') path += '.';
          else if (tk.t === '/') path += '/';
          else if (tk.t === 'num') path += String(tk.v);
        }
        if (path) src = path;
      }
    }
    return { src, style: style.trim() };
  }

  parseLayoutLine(cls: string, indentCh: VN[]): VN {
    this.next();
    let style = '';
    if (this.peek()?.t === 'constraint') {
      style += parseConstraints((this.next() as { v: string }).v);
    }
    let args: VN[] = [];
    if (this.peek()?.t === '(') {
      this.next();
      const r = this.parseCallArgs();
      args = r.items; style += r.style;
      if (this.peek()?.t === ')') this.next();
    }
    const rest = this.parseItemList(true);
    let node = ve('div', { className: cls }, [...args, ...rest, ...indentCh]);
    if (style) node = addStyle(node, style) as VEl;
    return this.applyPostfix(node);
  }

  parseComponentLine(indentCh: VN[]): VN {
    const name = (this.next() as { v: string }).v;
    let style = '';
    if (this.peek()?.t === 'constraint') {
      style += parseConstraints((this.next() as { v: string }).v);
    }
    const def = COMPONENTS[name];
    const defCh = def.children.map(c => iNodeToVN(c));
    const rest = this.parseItemList(true);
    let node = vblock([...defCh, ...rest, ...indentCh]);
    node = addClassName(node, name) as VEl;

    if (style) node = addStyle(node, style) as VEl;
    return this.applyPostfix(node);
  }

  parseRootCall(indentCh: VN[]): VN {
    const name = (this.next() as { v: string }).v;
    let style = '';
    if (this.peek()?.t === 'constraint') {
      style += parseConstraints((this.next() as { v: string }).v);
    }
    let callItems: VN[] = [];
    if (this.peek()?.t === '(') {
      this.next();
      const r = this.parseCallArgs();
      callItems = r.items; style += r.style;
      if (this.peek()?.t === ')') this.next();
    }
    const rest = this.parseItemList(true);
    if (name in COMPONENTS) {
      const def = COMPONENTS[name];
      const defCh = def.children.map(c => iNodeToVN(c));
      let node = vblock([...defCh, ...callItems, ...rest, ...indentCh]);
      node = addClassName(node, name) as VEl;
  
      if (style) node = addStyle(node, style) as VEl;
      return this.applyPostfix(node);
    }
    let node = vblock([...callItems, ...rest, ...indentCh]);
    if (style) node = addStyle(node, style) as VEl;
    return this.applyPostfix(node);
  }

  parseRegularLine(indentCh: VN[]): VN {
    const segs = this.parseSegments();
    const blockCh: VN[] = [];
    for (const seg of segs) {
      for (const item of seg) blockCh.push(mergeIntoBlock(item));
    }
    if (indentCh.length > 0 && blockCh.length > 0) {
      const last = blockCh[blockCh.length - 1];
      if (last.t === 'e' && last.props.className?.includes('block')) {
        blockCh[blockCh.length - 1] = { ...last, ch: [...last.ch, ...indentCh] };
      } else {
        blockCh.push(...indentCh);
      }
    } else {
      blockCh.push(...indentCh);
    }
    if (blockCh.length === 0) return vblock([]);
    if (blockCh.length === 1) return blockCh[0];
    return ve('div', { style: 'display:inline-flex' }, blockCh);
  }

  parseSegments(): VN[][] {
    const segs: VN[][] = [];
    while (this.peek()) {
      const items = this.parseItemList(true);
      if (items.length > 0) segs.push(items);
      if (this.peek()?.t === 'bsep') this.next();
      else break;
    }
    return segs;
  }

  parseItemList(stopAtBsep: boolean): VN[] {
    const items: VN[] = [];
    while (this.peek()) {
      const p = this.peek()!;
      if (p.t === ')' || p.t === '+' || p.t === '*' || p.t === '.') break;
      if (p.t === 'bsep' && stopAtBsep) break;
      if (p.t === ',') { this.next(); continue; }
      items.push(this.parseItem());
    }
    return items;
  }

  parseCallArgs(): { items: VN[]; style: string } {
    const items: VN[] = [];
    let style = '';
    while (this.peek() && this.peek()!.t !== ')') {
      if (this.peek()?.t === ',') { this.next(); continue; }
      if (this.peek()?.t === 'id' && this.peek(1)?.t === ':') {
        const key = (this.next() as { v: string }).v.replace(/\./g, '-');
        this.next();
        const val = this.peek()?.t === 'val' ? (this.next() as { v: string }).v : '';
        style += `${key}: ${val}; `;
      } else {
        items.push(this.parseItem());
      }
    }
    return { items, style: style.trim() };
  }

  parseItem(): VN {
    if (this.peek()?.t === 'num') {
      const saved = this.pos;
      const n = this.next() as { v: number };
      let frac = n.v;
      if (this.peek()?.t === '%') {
        this.next();
        frac = frac / 100;
      } else if (this.peek()?.t === '/') {
        this.next();
        const d = this.next();
        if (d && d.t === 'num' && d.v !== 0) frac = frac / d.v;
      }
      if (this.peek()?.t === '*') {
        this.next();
        let item = this.parseAtom();
        item = addWidth(item, frac);
        return this.applyPostfix(item);
      }
      // Just a number — if we consumed extra tokens (% or /), show the fraction
      if (this.pos !== saved + 1) {
        return this.applyPostfix(vt(String(frac)));
      }
      // Plain number
      return this.applyPostfix(vt(String(n.v)));
    }
    return this.applyPostfix(this.parseAtom());
  }

  parseAtom(): VN {
    const t = this.peek();
    if (!t) return vt('');

    if (t.t === 'str') { this.next(); return vt(t.v); }
    if (t.t === 'num') { this.next(); return vt(String(t.v)); }

    if (t.t === 'id') {
      this.next();

      // Image: Image(src, properties...) — src is the path argument
      if (t.v === 'Image') {
        let style = '';
        if (this.peek()?.t === 'constraint') {
          style = parseConstraints((this.next() as { v: string }).v);
        }
        if (this.peek()?.t === '(') {
          this.next();
          const r = this.parseImageCallArgs();
          if (r.style) style += r.style;
          if (this.peek()?.t === ')') this.next();
          const fileName = r.src.split('/').pop() || '';
          const alt = fileName.replace(/\.[^.]+$/, '');
          let node: VN = ve('img', { src: r.src, alt }, []);
          if (style) node = addStyle(node, style);
          return node;
        }
        return vspan([]);
      }

      // Layout keyword inline
      if (t.v in LAYOUT) return this.parseInlineLayout(LAYOUT[t.v]);

      // Component reference
      if (t.v in COMPONENTS) return this.parseComponentAtom(t.v);

      // Constraint on identifier
      let cStyle = '';
      if (this.peek()?.t === 'constraint') {
        cStyle = parseConstraints((this.next() as { v: string }).v);
      }

      // Call: Name(...)
      if (this.peek()?.t === '(') {
        this.next();
        const { items, style } = this.parseCallArgs();
        if (this.peek()?.t === ')') this.next();
        const trailing = this.parseTrailing();
        let node = vspan([...items, ...trailing]);
        if (style) node = addStyle(node, style) as VEl;
        if (cStyle) node = addStyle(node, cStyle) as VEl;
        return node;
      }

      // Plain identifier
      let node: VN = vspan([]);
      if (cStyle) node = addStyle(node, cStyle);
      return node;
    }

    // Grouping: (...)
    if (t.t === '(') {
      this.next();
      const r = this.parseCallArgs();
      if (this.peek()?.t === ')') this.next();
      let node = r.items.length > 1
        ? ve('div', { style: 'display:inline-flex' }, r.items)
        : vspan(r.items);
      if (r.style) node = addStyle(node, r.style) as VEl;
      return node;
    }

    this.next();
    return vt('');
  }

  parseComponentAtom(name: string): VN {
    let cStyle = '';
    if (this.peek()?.t === 'constraint') {
      cStyle = parseConstraints((this.next() as { v: string }).v);
    }
    const def = COMPONENTS[name];
    const defCh = def.children.map(c => iNodeToVN(c));
    if (this.peek()?.t === '(') {
      this.next();
      const { items, style } = this.parseCallArgs();
      if (this.peek()?.t === ')') this.next();
      let node = ve('div', { className: name }, [...defCh, ...items]);
  
      if (style) node = addStyle(node, style) as VEl;
      if (cStyle) node = addStyle(node, cStyle) as VEl;
      return node;
    }
    let node = ve('div', { className: name }, defCh);

    if (cStyle) node = addStyle(node, cStyle) as VEl;
    return node;
  }

  parseInlineLayout(cls: string): VN {
    let style = '';
    if (this.peek()?.t === 'constraint') {
      style += parseConstraints((this.next() as { v: string }).v);
    }
    let args: VN[] = [];
    if (this.peek()?.t === '(') {
      this.next();
      const r = this.parseCallArgs();
      args = r.items; style += r.style;
      if (this.peek()?.t === ')') this.next();
    }
    const trailing = this.parseTrailing();
    let node = ve('div', { className: cls }, [...args, ...trailing]);
    if (style) node = addStyle(node, style) as VEl;
    return node;
  }

  parseTrailing(): VN[] {
    const items: VN[] = [];
    while (this.peek()) {
      const p = this.peek()!;
      if (p.t === ',' || p.t === 'bsep' || p.t === ')' || p.t === '+' || p.t === '*' || p.t === '.') break;
      items.push(this.parseItem());
    }
    return items;
  }

  applyPostfix(item: VN): VN {
    while (this.peek()) {
      const p = this.peek()!;
      if (p.t === '+') {
        this.next();
        const id = this.peek();
        if (id && id.t === 'id') {
          // Padding shortcut: + pt 5
          if (id.v in PAD && this.peek(1)?.t === 'num') {
            this.next();
            const n = (this.next() as { v: number }).v;
            item = addStyle(item, PAD[id.v](n * 0.125));
          } else {
            this.next();
            item = addClassName(item, id.v);
          }
        }
      } else if (p.t === '*') {
        this.next();
        item = addWidth(item, this.parseFractionRaw());
      } else if (p.t === '.') {
        // Peek ahead: need . followed by id
        const nxt = this.peek(1);
        if (!nxt || nxt.t !== 'id') break;
        this.next(); // consume .
        const prop = this.peek()!;
        if (prop.t === 'id' && prop.v === 'map' && this.peek(1)?.t === '(') {
          this.next(); // consume 'map'
          this.next(); // consume '('
          item = this.applyMapToChildren(item);
          if (this.peek()?.t === ')') this.next();
        } else if (prop.t === 'id' && prop.v in DOT_STYLE) {
          this.next();
          item = addStyle(item, DOT_STYLE[prop.v]);
        } else {
          break;
        }
      } else break;
    }
    return item;
  }

  applyMapToChildren(item: VN): VN {
    if (item.t !== 'e') return item;
    const ops: Array<{ type: 'class'; cls: string } | { type: 'style'; style: string }> = [];
    while (this.peek() && this.peek()!.t !== ')') {
      if (this.peek()?.t === '+') {
        this.next();
        const id = this.peek();
        if (id?.t === 'id') {
          if (id.v in PAD && this.peek(1)?.t === 'num') {
            this.next();
            const n = (this.next() as { v: number }).v;
            ops.push({ type: 'style', style: PAD[id.v](n * 0.125) });
          } else {
            this.next();
            ops.push({ type: 'class', cls: id.v });
          }
        }
      } else if (this.peek()?.t === '.') {
        this.next();
        const prop = this.peek();
        if (prop?.t === 'id' && prop.v in DOT_STYLE) {
          this.next();
          ops.push({ type: 'style', style: DOT_STYLE[prop.v] });
        }
      } else {
        this.next();
      }
    }
    const newCh = item.ch.map(child => {
      let c = child;
      for (const op of ops) {
        if (op.type === 'class') c = addClassName(c, op.cls);
        else c = addStyle(c, op.style);
      }
      return c;
    });
    return { ...item, ch: newCh };
  }

  parseFractionRaw(): number {
    const n = this.next();
    if (!n || n.t !== 'num') return 0;
    let val = n.v;
    if (this.peek()?.t === '%') { this.next(); return val / 100; }
    if (this.peek()?.t === '/') {
      this.next();
      const d = this.next();
      if (d && d.t === 'num' && d.v !== 0) val = val / d.v;
    }
    return val;
  }
}

// ============================================================
// INode → VNode
// ============================================================

function iNodeToVN(node: INode): VN {
  const tks = tokenize(node.content);
  const indentCh = node.children.map(c => iNodeToVN(c));
  const p = new TkParser(tks, node.content);
  return p.parseLine(indentCh);
}

function mergeIntoBlock(item: VN): VN {
  if (item.t === 'e' && item.tag === 'div') {
    const cur = item.props.className || '';
    const cls = cur ? 'block ' + cur : 'block';
    return { ...item, props: { ...item.props, className: cls } };
  }
  if (item.t === 't') return vblock([item]);
  return item;
}

// ============================================================
// Main Parse
// ============================================================

export function parse(src: string): VN {
  const preprocessed = joinMultiLineParens(src);
  const tree = buildIndentTree(preprocessed);

  const classDefs: INode[] = [];
  const content: INode[] = [];
  for (const node of tree) {
    if (node.content.startsWith('class ')) classDefs.push(node);
    else content.push(node);
  }
  processClassDefs(classDefs);

  if (content.length === 0) return vblock([]);
  if (content.length === 1) return iNodeToVN(content[0]);
  return vblock(content.map(n => iNodeToVN(n)));
}

// ============================================================
// Expose API
// ============================================================

export { ve, vt, vblock, vspan, patch, createDom };

(window as any).Ether = {
  signal, effect, batch, mount, parse,
  ve, vt, vblock, vspan, addClassName, addStyle, addWidth,
};

// ============================================================
// Bootstrap
// ============================================================

function boot() {
  const container = document.getElementById('root');
  if (!container) return;
  mount(container, () => parse(source));
}

boot();
