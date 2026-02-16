// ============================================================
// DummyData.ts — Mock file tree for @ether (player = repository)
// ============================================================

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  modified: string;
  children?: TreeEntry[];
  content?: string;
}

export interface CompoundEntry {
  op: '&' | '|';
  entries: TreeEntry[];
}

export type TreeEntry = FileEntry | CompoundEntry;

export function isCompound(entry: TreeEntry): entry is CompoundEntry {
  return 'op' in entry;
}

export function flattenEntries(tree: TreeEntry[]): FileEntry[] {
  const result: FileEntry[] = [];
  for (const entry of tree) {
    if (isCompound(entry)) {
      result.push(...flattenEntries(entry.entries));
    } else {
      result.push(entry);
    }
  }
  return result;
}

export interface Repository {
  user: string;
  description: string;
  tree: TreeEntry[];
}

const README_CONTENT = `# @ether/library

A **Ray-based** library for compositional abstractions over equivalences.

## Overview

This library provides the foundational primitives for working with
*vertices*, *edges*, and *rays* in the Ether runtime.

> "Every sufficiently advanced abstraction is indistinguishable from a ray."

---

## Installation

\`\`\`sh
ether add @ether/library
\`\`\`

## Quick Start

\`\`\`ts
import { Ray, Vertex, Edge } from '@ether/library';

const vertex = Ray.vertex();
const edge = vertex.compose(Ray.vertex());

console.log(edge.is_equivalent(edge)); // true
\`\`\`

## API Reference

| Export | Type | Description |
|--------|------|-------------|
| \`Ray\` | class | The fundamental compositional primitive |
| \`Vertex\` | type | A zero-dimensional ray |
| \`Edge\` | type | A one-dimensional composition of rays |
| \`Orbit\` | type | A cyclic equivalence class |
| \`Mine\` | function | Constructs a ray from a perspective |

### Ray Methods

1. \`Ray.vertex()\` — create a vertex
2. \`Ray.edge(a, b)\` — compose two rays
3. \`Ray.orbit(rays)\` — create a cyclic structure
4. \`Ray.equivalent(a, b)\` — test equivalence

### Features

- [x] Zero-cost vertex abstraction
- [x] Compositional edge construction
- [x] Equivalence testing
- [ ] Parallel orbit resolution
- [ ] Distributed ray tracing

## Examples

See the [\`examples/\`](examples) directory for usage patterns:

- **basic.ray** — A minimal vertex composition
- **composition.ray** — Chaining edges
- **orbit.ray** — Cyclic structures

## License

~~MIT~~ — *Unlicensed*. This is free and unencumbered software released into the public domain.

![Ether Logo](images/Ether.svg)
`;

const ALT_README = `# @ether/library (Draft)

An **experimental** rewrite of the core library using Ray v2 primitives.

## Status

This is an alternative README reflecting the in-progress v2 branch.

> "All rays are equivalent — some are just more equivalent than others."

---

## Changes from v1

- \`Ray.vertex()\` is now \`Ray.point()\`
- \`Ray.edge(a, b)\` replaced by \`Ray.connect(a, b)\`
- New: \`Ray.superpose(rays)\` — quantum-style superposition

## Migration Guide

\`\`\`ts
// v1
const v = Ray.vertex();
const e = v.compose(Ray.vertex());

// v2
const p = Ray.point();
const c = p.connect(Ray.point());
\`\`\`

## License

~~MIT~~ — *Unlicensed*. This is free and unencumbered software released into the public domain.
`;

const DOCS_README = `# Documentation

Detailed guides for working with @ether/library.

## Contents

- \`getting-started.md\` — Setup and first steps
- \`api.md\` — Full API reference
- \`architecture.md\` — Internal design overview
`;

const RAY_TS_V1 = `// Ray.ts — The fundamental compositional primitive
// v1: Original implementation

import { Vertex } from './Vertex';
import { Edge } from './Edge';

export type Equivalence<T> = (a: T, b: T) => boolean;

export class Ray {
  private _initial: Ray | null = null;
  private _terminal: Ray | null = null;
  private _vertex: boolean;

  private constructor(vertex: boolean = false) {
    this._vertex = vertex;
  }

  static vertex(): Ray {
    const r = new Ray(true);
    r._initial = r;
    r._terminal = r;
    return r;
  }

  static edge(a: Ray, b: Ray): Ray {
    const r = new Ray(false);
    r._initial = a;
    r._terminal = b;
    return r;
  }

  static orbit(rays: Ray[]): Ray {
    if (rays.length === 0) return Ray.vertex();
    let current = rays[0];
    for (let i = 1; i < rays.length; i++) {
      current = Ray.edge(current, rays[i]);
    }
    return Ray.edge(current, rays[0]);
  }

  get initial(): Ray { return this._initial ?? this; }
  get terminal(): Ray { return this._terminal ?? this; }
  get is_vertex(): boolean { return this._vertex; }

  compose(other: Ray): Ray {
    return Ray.edge(this, other);
  }

  is_equivalent(other: Ray): boolean {
    if (this === other) return true;
    if (this._vertex && other._vertex) return true;
    return false;
  }

  static equivalent(a: Ray, b: Ray): boolean {
    return a.is_equivalent(b);
  }

  toString(): string {
    if (this._vertex) return '(*)';
    return \`(\${this._initial} -> \${this._terminal})\`;
  }
}`;

const RAY_TS_V2 = `// Ray.ts — The fundamental compositional primitive
// v2: Refactored with superposition support

import { Vertex } from './Vertex';
import { Edge } from './Edge';

export type Equivalence<T> = (a: T, b: T) => boolean;

export interface RayLike {
  readonly initial: RayLike;
  readonly terminal: RayLike;
  readonly is_vertex: boolean;
  compose(other: RayLike): RayLike;
}

export class Ray implements RayLike {
  private _initial: Ray | null = null;
  private _terminal: Ray | null = null;
  private _vertex: boolean;
  private _superposed: Ray[] = [];

  private constructor(vertex: boolean = false) {
    this._vertex = vertex;
  }

  static point(): Ray {
    const r = new Ray(true);
    r._initial = r;
    r._terminal = r;
    return r;
  }

  static vertex(): Ray {
    return Ray.point();
  }

  static connect(a: Ray, b: Ray): Ray {
    const r = new Ray(false);
    r._initial = a;
    r._terminal = b;
    return r;
  }

  static edge(a: Ray, b: Ray): Ray {
    return Ray.connect(a, b);
  }

  static superpose(...rays: Ray[]): Ray {
    const r = Ray.point();
    r._superposed = rays;
    return r;
  }

  get initial(): Ray { return this._initial ?? this; }
  get terminal(): Ray { return this._terminal ?? this; }
  get is_vertex(): boolean { return this._vertex; }
  get superpositions(): readonly Ray[] { return this._superposed; }

  compose(other: Ray): Ray {
    return Ray.connect(this, other);
  }

  is_equivalent(other: Ray): boolean {
    if (this === other) return true;
    if (this._vertex && other._vertex) return true;
    if (this._superposed.length > 0 || other._superposed.length > 0) {
      return this._superposed.some(s => s.is_equivalent(other))
        || other._superposed.some(s => this.is_equivalent(s));
    }
    return false;
  }

  toString(): string {
    if (this._superposed.length > 0) {
      return \`(\${this._superposed.map(s => s.toString()).join(' | ')})\`;
    }
    if (this._vertex) return '(*)';
    return \`(\${this._initial} -> \${this._terminal})\`;
  }
}`;

const VERTEX_TS_CONTENT = `// Vertex.ts — Zero-dimensional ray abstraction

import { Ray } from './Ray';

export type Vertex = Ray;

export function isVertex(ray: Ray): ray is Vertex {
  return ray.is_vertex;
}

export function createVertex(): Vertex {
  return Ray.vertex();
}

export function vertexPair(): [Vertex, Vertex] {
  return [createVertex(), createVertex()];
}

export namespace VertexOps {
  export function merge(a: Vertex, b: Vertex): Vertex {
    if (a.is_equivalent(b)) return a;
    return Ray.edge(a, b);
  }

  export function split(v: Vertex): [Ray, Ray] {
    return [v.initial, v.terminal];
  }
}`;

const EDGE_TS_CONTENT = `// Edge.ts — One-dimensional composition of rays

import { Ray } from './Ray';

export type Edge = Ray;

export function isEdge(ray: Ray): boolean {
  return !ray.is_vertex;
}

export function createEdge(initial: Ray, terminal: Ray): Edge {
  return Ray.edge(initial, terminal);
}

export function chain(...rays: Ray[]): Edge {
  if (rays.length === 0) return Ray.vertex();
  let current = rays[0];
  for (let i = 1; i < rays.length; i++) {
    current = current.compose(rays[i]);
  }
  return current;
}

export function reverse(edge: Edge): Edge {
  return Ray.edge(edge.terminal, edge.initial);
}

export namespace EdgeOps {
  export function length(edge: Edge): number {
    let count = 0;
    let current: Ray = edge;
    while (!current.is_vertex) {
      count++;
      current = current.terminal;
    }
    return count;
  }
}`;

const ORBIT_TS_CONTENT = `// Orbit.ts — Cyclic equivalence class

import { Ray } from './Ray';
import { Edge, chain } from './Edge';

export class Orbit {
  private _rays: Ray[];
  private _cycle: Edge;

  constructor(rays: Ray[]) {
    if (rays.length === 0) {
      throw new Error('Orbit requires at least one ray');
    }
    this._rays = [...rays];
    this._cycle = Ray.orbit(rays);
  }

  get rays(): readonly Ray[] {
    return this._rays;
  }

  get cycle(): Edge {
    return this._cycle;
  }

  get size(): number {
    return this._rays.length;
  }

  contains(ray: Ray): boolean {
    return this._rays.some(r => r.is_equivalent(ray));
  }

  rotate(n: number = 1): Orbit {
    const len = this._rays.length;
    const shift = ((n % len) + len) % len;
    const rotated = [
      ...this._rays.slice(shift),
      ...this._rays.slice(0, shift),
    ];
    return new Orbit(rotated);
  }

  merge(other: Orbit): Orbit {
    return new Orbit([...this._rays, ...other._rays]);
  }

  toString(): string {
    return \`Orbit(\${this._rays.map(r => r.toString()).join(', ')})\`;
  }
}`;

const INDEX_TS_CONTENT = `// index.ts — Main entry point for @ether/library

export { Ray } from './Ray';
export type { Equivalence, RayLike } from './Ray';

export { isVertex, createVertex, vertexPair } from './Vertex';
export type { Vertex } from './Vertex';

export { isEdge, createEdge, chain, reverse } from './Edge';
export type { Edge } from './Edge';

export { Orbit } from './Orbit';

// Re-export convenience constructors
import { Ray } from './Ray';

export const vertex = Ray.vertex;
export const edge = Ray.edge;

export function mine(perspective: Ray): Ray {
  return perspective.compose(Ray.vertex());
}`;

function generateLargeFile(lines: number): string {
  const parts: string[] = [
    '// generated-test.ray — Auto-generated test file',
    '// This file is used to test virtual scrolling with large content',
    '',
    'import { Ray, Vertex, Edge, Orbit } from "../src";',
    '',
    '// ============================================================',
    '// Test harness: generate a mesh of rays for stress testing',
    '// ============================================================',
    '',
    'const MESH_SIZE = 1000;',
    'const vertices: Ray[] = [];',
    '',
    'for (let i = 0; i < MESH_SIZE; i++) {',
    '  vertices.push(Ray.vertex());',
    '}',
    '',
  ];
  for (let i = parts.length; i < lines; i++) {
    const mod = i % 20;
    if (mod === 0) {
      parts.push(`// ---- Block ${Math.floor(i / 20)} ----`);
    } else if (mod === 1) {
      parts.push(`const ray_${i} = Ray.vertex();`);
    } else if (mod === 2) {
      parts.push(`const edge_${i} = Ray.edge(ray_${i - 1}, Ray.vertex());`);
    } else if (mod === 3) {
      parts.push(`assert(edge_${i - 1}.is_equivalent(edge_${i - 1}));`);
    } else if (mod === 4) {
      parts.push(`assert(!ray_${i - 3}.is_equivalent(edge_${i - 2}));`);
    } else if (mod === 5) {
      parts.push(`const orbit_${i} = new Orbit([ray_${i - 4}, edge_${i - 3}]);`);
    } else if (mod === 6) {
      parts.push(`assert(orbit_${i - 1}.size === 2);`);
    } else if (mod === 7) {
      parts.push(`assert(orbit_${i - 2}.contains(ray_${i - 6}));`);
    } else if (mod === 8) {
      parts.push(`const composed_${i} = ray_${i - 7}.compose(edge_${i - 6});`);
    } else if (mod === 9) {
      parts.push(`assert(!composed_${i - 1}.is_vertex);`);
    } else if (mod === 10) {
      parts.push('');
    } else if (mod === 11) {
      parts.push(`// Verify vertex identity for block ${Math.floor(i / 20)}`);
    } else if (mod === 12) {
      parts.push(`const v_${i} = Ray.vertex();`);
    } else if (mod === 13) {
      parts.push(`assert(v_${i - 1}.is_vertex);`);
    } else if (mod === 14) {
      parts.push(`assert(v_${i - 2}.initial === v_${i - 2});`);
    } else if (mod === 15) {
      parts.push(`assert(v_${i - 3}.terminal === v_${i - 3});`);
    } else if (mod === 16) {
      parts.push(`const chain_${i} = v_${i - 4}.compose(ray_${i - 15});`);
    } else if (mod === 17) {
      parts.push(`assert(!chain_${i - 1}.is_vertex);`);
    } else if (mod === 18) {
      parts.push(`vertices.push(v_${i - 6});`);
    } else {
      parts.push('');
    }
  }
  return parts.slice(0, lines).join('\n');
}

let _largeFileCache: string | null = null;
const generatedTestEntry: FileEntry = { name: 'generated-test.ray', isDirectory: false, modified: '1 day ago' };
Object.defineProperty(generatedTestEntry, 'content', {
  get() {
    if (_largeFileCache === null) _largeFileCache = generateLargeFile(10000);
    return _largeFileCache;
  },
  enumerable: true,
  configurable: true,
});

const repository: Repository = {
  user: 'ether',
  description: 'The Ether runtime environment',
  tree: [
    {
      name: 'library',
      isDirectory: true,
      modified: 'yesterday',
      children: [
        {
          name: 'src',
          isDirectory: true,
          modified: '2 days ago',
          children: [
            { op: '|', entries: [
              { name: 'Ray.ts', isDirectory: false, modified: '2 days ago', content: RAY_TS_V1 },
              { name: 'Ray.ts', isDirectory: false, modified: '5 days ago', content: RAY_TS_V2 },
            ]},
            { name: 'Vertex.ts', isDirectory: false, modified: '5 days ago', content: VERTEX_TS_CONTENT },
            { name: 'Edge.ts', isDirectory: false, modified: '5 days ago', content: EDGE_TS_CONTENT },
            { name: 'Orbit.ts', isDirectory: false, modified: '3 days ago', content: ORBIT_TS_CONTENT },
            { name: 'index.ts', isDirectory: false, modified: '2 days ago', content: INDEX_TS_CONTENT, children: [
              { name: 'types', isDirectory: true, modified: '3 days ago', children: [
                { name: 'Ray.d.ts', isDirectory: false, modified: '3 days ago' },
                { name: 'index.d.ts', isDirectory: false, modified: '3 days ago' },
              ]},
            ]},
          ],
        },
        {
          name: 'docs',
          isDirectory: true,
          modified: '1 week ago',
          children: [
            { name: 'getting-started.md', isDirectory: false, modified: '1 week ago' },
            { name: 'api.md', isDirectory: false, modified: '1 week ago' },
            { name: 'architecture.md', isDirectory: false, modified: '2 weeks ago' },
            { name: 'README.md', isDirectory: false, modified: '1 week ago', content: DOCS_README },
          ],
        },
        {
          name: 'examples',
          isDirectory: true,
          modified: '4 days ago',
          children: [
            { name: 'basic.ray', isDirectory: false, modified: '1 week ago' },
            { name: 'composition.ray', isDirectory: false, modified: '4 days ago' },
            { name: 'orbit.ray', isDirectory: false, modified: '4 days ago' },
            generatedTestEntry,
          ],
        },
        {
          name: 'assets',
          isDirectory: true,
          modified: '2 weeks ago',
          children: [
            { name: 'logo.svg', isDirectory: false, modified: '2 weeks ago' },
            { name: 'banner.png', isDirectory: false, modified: '2 weeks ago' },
          ],
        },
        {
          op: '|',
          entries: [
            { name: 'README.md', isDirectory: false, modified: 'yesterday', content: README_CONTENT },
            { name: 'README.md', isDirectory: false, modified: '3 days ago', content: ALT_README },
          ],
        },
        { name: 'index.ray.js', isDirectory: false, modified: 'today', content: `document.body.style.background = '#0a0a0a';
document.body.style.color = '#fff';
document.body.style.fontFamily = "'Courier New', monospace";

window.addEventListener('ether:ready', async () => {
  const el = document.createElement('div');
  el.style.padding = '40px';

  const count = parseInt(await ether.storage.get('visits') || '0') + 1;
  await ether.storage.set('visits', String(count));

  el.innerHTML = \`<h1>@ether/library</h1>
    <p>Hello, <strong>@\${ether.user}</strong>.</p>
    <p>Visit #\${count}</p>\`;
  document.body.appendChild(el);
});
` },
        {
          op: '&',
          entries: [
            { name: 'package.json', isDirectory: false, modified: '3 days ago' },
            { name: 'tsconfig.json', isDirectory: false, modified: '1 week ago' },
          ],
        },
        { name: 'LICENSE', isDirectory: false, modified: '1 month ago' },
        { name: '.gitignore', isDirectory: false, modified: '1 month ago' },
      ],
    },
  ],
};

const genesisWorld: Repository = {
  user: 'genesis',
  description: 'The origin world — where it all began',
  tree: [
    {
      name: 'terrain',
      isDirectory: true,
      modified: '3 days ago',
      children: [
        { name: 'heightmap.ray', isDirectory: false, modified: '3 days ago' },
        { name: 'biomes.ray', isDirectory: false, modified: '1 week ago' },
      ],
    },
    {
      name: 'entities',
      isDirectory: true,
      modified: 'yesterday',
      children: [
        { name: 'player.ray', isDirectory: false, modified: 'yesterday' },
        { name: 'npc.ray', isDirectory: false, modified: '4 days ago' },
      ],
    },
    { name: 'world.config', isDirectory: false, modified: '2 days ago' },
    { name: 'README.md', isDirectory: false, modified: '1 week ago' },
  ],
};

const sandboxWorld: Repository = {
  user: 'sandbox',
  description: 'An experimental sandbox world',
  tree: [
    {
      name: 'experiments',
      isDirectory: true,
      modified: 'yesterday',
      children: [
        { name: 'gravity.ray', isDirectory: false, modified: 'yesterday' },
        { name: 'time-dilation.ray', isDirectory: false, modified: '3 days ago' },
      ],
    },
    { name: 'world.config', isDirectory: false, modified: '1 week ago' },
    { name: 'README.md', isDirectory: false, modified: '2 weeks ago' },
  ],
};

const aliceRepo: Repository = {
  user: 'alice',
  description: 'Alice — a genesis inhabitant',
  tree: [
    { name: 'notes.md', isDirectory: false, modified: '2 days ago' },
  ],
};

const bobRepo: Repository = {
  user: 'bob',
  description: 'Bob — a genesis builder',
  tree: [
    { name: 'blueprints', isDirectory: true, modified: 'yesterday', children: [
      { name: 'tower.ray', isDirectory: false, modified: 'yesterday' },
    ]},
  ],
};

const charlieRepo: Repository = {
  user: 'charlie',
  description: 'Charlie — sandbox tester',
  tree: [
    { name: 'logs', isDirectory: true, modified: '1 week ago', children: [
      { name: 'test-run-1.log', isDirectory: false, modified: '1 week ago' },
    ]},
  ],
};

const alphaWorld: Repository = {
  user: 'alpha',
  description: 'A nested sub-world within genesis',
  tree: [
    { name: 'seed.ray', isDirectory: false, modified: '5 days ago' },
  ],
};

const allRepositories: Repository[] = [repository, aliceRepo, bobRepo, charlieRepo];

const allWorlds: Map<string, Map<string, Repository>> = new Map([
  ['ether', new Map([
    ['genesis', genesisWorld],
    ['sandbox', sandboxWorld],
  ])],
  ['genesis', new Map([
    ['alpha', alphaWorld],
  ])],
]);

export function getRepository(user: string): Repository | null {
  return allRepositories.find(r => r.user === user) || null;
}

export function getReferencedUsers(user: string, world?: string | null): string[] {
  if (world === 'genesis') return ['alice', 'bob'];
  if (world === 'sandbox') return ['charlie'];
  if (world) return [];  // inside a world with no explicit entries
  if (user === 'ether') return ['ether'];
  return [];
}

export function getReferencedWorlds(user: string, world?: string | null): string[] {
  if (world === 'genesis') return ['alpha'];
  if (world === 'sandbox') return [];
  if (world) return [];  // inside a world with no explicit entries
  const worlds = allWorlds.get(user);
  return worlds ? [...worlds.keys()] : [];
}

export function getWorld(user: string, world: string): Repository | null {
  return allWorlds.get(user)?.get(world) || null;
}

export function resolveDirectory(tree: TreeEntry[], pathSegments: string[]): TreeEntry[] | null {
  let current = tree;
  for (const segment of pathSegments) {
    const flat = flattenEntries(current);
    const entry = flat.find(e => e.name === segment && e.isDirectory);
    if (!entry || !entry.children) return null;
    current = entry.children;
  }
  return current;
}

export function resolveFile(tree: TreeEntry[], pathSegments: string[]): FileEntry | null {
  if (pathSegments.length === 0) return null;
  const dirPath = pathSegments.slice(0, -1);
  const fileName = pathSegments[pathSegments.length - 1];
  const dir = dirPath.length > 0 ? resolveDirectory(tree, dirPath) : tree;
  if (!dir) return null;
  const flat = flattenEntries(dir);
  return flat.find(e => e.name === fileName && !e.isDirectory) || null;
}

/** Like resolveDirectory but also traverses file entries that have children. */
function resolveFlexible(tree: TreeEntry[], pathSegments: string[]): TreeEntry[] | null {
  let current = tree;
  for (const segment of pathSegments) {
    const flat = flattenEntries(current);
    const entry = flat.find(e => e.name === segment && (e.isDirectory || (e.children && e.children.length > 0)));
    if (!entry || !entry.children) return null;
    current = entry.children;
  }
  return current;
}

export function resolveFiles(tree: TreeEntry[], pathSegments: string[]): FileEntry[] {
  if (pathSegments.length === 0) return [];
  const dirPath = pathSegments.slice(0, -1);
  const fileName = pathSegments[pathSegments.length - 1];
  const dir = dirPath.length > 0 ? resolveFlexible(tree, dirPath) : tree;
  if (!dir) return [];
  const flat = flattenEntries(dir);
  return flat.filter(e => e.name === fileName && !e.isDirectory);
}
