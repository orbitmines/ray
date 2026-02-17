// ============================================================
// DummyData.ts — Mock file tree for @ether (player = repository)
// ============================================================

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  modified: string;
  children?: TreeEntry[];
  content?: string;
  access?: 'public' | 'local' | 'private' | 'npc' | 'player' | 'everyone';
  encrypted?: boolean;
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

// ---- Pull Request types ----

export type PRStatus = 'open' | 'closed' | 'merged';

export interface FileDiff {
  path: string;
  oldContent: string;
  newContent: string;
  type: 'added' | 'modified' | 'deleted';
}

export interface PRCommit {
  id: string;
  message: string;
  author: string;
  createdAt: string;
  diffs: FileDiff[];
}

export interface PRComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
}

export type ActivityItem =
  | { type: 'commit'; commit: PRCommit; createdAt: string }
  | { type: 'comment'; comment: PRComment; createdAt: string }
  | { type: 'status_change'; from: PRStatus; to: PRStatus; author: string; createdAt: string }
  | { type: 'merge'; author: string; createdAt: string };

export interface PullRequest {
  id: number;
  title: string;
  description: string;
  status: PRStatus;
  author: string;
  createdAt: string;
  updatedAt: string;
  sourceVersion: string;
  targetVersion: string;
  sourceLabel: string;
  targetLabel: string;
  commits: PRCommit[];
  comments: PRComment[];
  activity: ActivityItem[];
  mergeable: boolean;
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

![Ether Logo](images/avatar/2d.svg)
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
            { name: 'Orbit.ts', isDirectory: false, modified: '3 days ago', content: ORBIT_TS_CONTENT, access: 'player' },
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
            { name: 'architecture.md', isDirectory: false, modified: '2 weeks ago', access: 'npc' },
            { name: 'README.md', isDirectory: false, modified: '1 week ago', content: DOCS_README },
          ],
        },
        {
          name: 'examples',
          isDirectory: true,
          modified: '4 days ago',
          children: [
            { name: 'basic.ray', isDirectory: false, modified: '1 week ago', access: 'everyone' },
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
        { name: '.gitignore', isDirectory: false, modified: '1 month ago', access: 'private' },
        {
          name: '@annotations',
          isDirectory: true,
          modified: '1 day ago',
          access: 'local',
          children: [
            { name: 'design-notes.ray', isDirectory: false, modified: '1 day ago', content: '// @annotations: Design notes\n// This directory tests @-prefix escaping' },
          ],
        },
        {
          name: '~drafts',
          isDirectory: true,
          modified: '2 days ago',
          access: 'private',
          encrypted: true,
          children: [
            { name: 'wip.ray', isDirectory: false, modified: '2 days ago', content: '// ~drafts: Work in progress\n// This directory tests ~-prefix escaping' },
          ],
        },
        {
          name: '*',
          isDirectory: true,
          modified: '3 days ago',
          children: [
            { name: 'glob-match.ray', isDirectory: false, modified: '3 days ago', content: '// * directory: glob patterns\n// This tests *-exact escaping' },
          ],
        },
        {
          name: '-',
          isDirectory: true,
          modified: '4 days ago',
          children: [
            { name: 'archive.ray', isDirectory: false, modified: '4 days ago', content: '// - directory: archive\n// This tests dash-exact escaping' },
          ],
        },
        {
          name: '.ether',
          isDirectory: true,
          modified: 'today',
          access: 'private',
          children: [
            {
              name: '%',
              isDirectory: true,
              modified: 'today',
              children: [
                {
                  name: 'pull-requests',
                  isDirectory: true,
                  modified: 'today',
                  children: [
                    { name: '0.ray', isDirectory: false, modified: '3 days ago', content: '# PR #0: Add Orbit cyclic structure support\nstatus: merged\nauthor: @bob\nsource: @bob/orbit-support\ntarget: main' },
                    { name: '1.ray', isDirectory: false, modified: '1 week ago', content: '# PR #1: Refactor Edge to use generics\nstatus: closed\nauthor: @charlie\nsource: @charlie/edge-generics\ntarget: main' },
                    { name: '2.ray', isDirectory: false, modified: 'today', content: '# PR #2: Add superposition support to Ray\nstatus: open\nauthor: @alice\nsource: @alice/superposition\ntarget: main' },
                    { name: '3.ray', isDirectory: false, modified: 'today', content: '# PR #3: Improve documentation README\nstatus: open\nauthor: @alice\nsource: @alice/docs-update\ntarget: main' },
                  ],
                },
              ],
            },
          ],
        },
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
        { name: 'player.ray', isDirectory: false, modified: 'yesterday', access: 'player' },
        { name: 'npc.ray', isDirectory: false, modified: '4 days ago', access: 'npc' },
      ],
    },
    { name: 'world.config', isDirectory: false, modified: '2 days ago', access: 'everyone' },
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

const ALICE_PROFILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<circle cx="32" cy="32" r="30" fill="#1a1a2e"/>
<circle cx="32" cy="24" r="10" fill="#c084fc"/>
<ellipse cx="32" cy="48" rx="16" ry="12" fill="#c084fc"/>
<circle cx="28" cy="22" r="2" fill="#1a1a2e"/>
<circle cx="36" cy="22" r="2" fill="#1a1a2e"/>
</svg>`;

const aliceRepo: Repository = {
  user: 'alice',
  description: 'Alice — a genesis inhabitant',
  tree: [
    { name: 'avatar', isDirectory: true, modified: '1 week ago', children: [
      { name: '2d-square.svg', isDirectory: false, modified: '1 week ago', content: ALICE_PROFILE_SVG },
    ]},
    { name: 'notes.md', isDirectory: false, modified: '2 days ago', access: 'private' },
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

// ---- Pull Request dummy data ----

const dummyPullRequests: Map<string, PullRequest[]> = new Map();

// PRs for @ether/library
const etherLibraryPRs: PullRequest[] = [
  {
    id: 0,
    title: 'Add Orbit cyclic structure support',
    description: `Adds the \`Orbit\` class for representing cyclic equivalence classes of rays.\n\nThis introduces:\n- \`Orbit\` constructor from a list of rays\n- \`rotate()\`, \`merge()\`, \`contains()\` methods\n- Cycle edge construction via \`Ray.orbit()\``,
    status: 'merged',
    author: 'bob',
    createdAt: '2025-12-01T10:00:00Z',
    updatedAt: '2025-12-03T14:00:00Z',
    sourceVersion: 'a1b2c3d4-e5f6-11ee-b001-000000000001',
    targetVersion: 'a1b2c3d4-e5f6-11ee-b001-000000000000',
    sourceLabel: 'bob/orbit-support',
    targetLabel: 'main',
    commits: [
      {
        id: 'c0a1b2c3-d4e5-11ee-b001-000000000010',
        message: 'Add Orbit class with cyclic structure operations',
        author: 'bob',
        createdAt: '2025-12-01T10:30:00Z',
        diffs: [
          {
            path: 'src/Orbit.ts',
            oldContent: '',
            newContent: ORBIT_TS_CONTENT,
            type: 'added',
          },
        ],
      },
    ],
    comments: [
      { id: 0, author: 'alice', body: 'Looks great! The `rotate()` method is exactly what we needed for the cycle resolution algorithm.', createdAt: '2025-12-01T15:00:00Z' },
      { id: 1, author: 'bob', body: 'Thanks! I also added `merge()` for combining orbits — should help with the distributed case.', createdAt: '2025-12-02T09:00:00Z' },
    ],
    activity: [
      { type: 'commit', commit: { id: 'c0a1b2c3-d4e5-11ee-b001-000000000010', message: 'Add Orbit class with cyclic structure operations', author: 'bob', createdAt: '2025-12-01T10:30:00Z', diffs: [] }, createdAt: '2025-12-01T10:30:00Z' },
      { type: 'comment', comment: { id: 0, author: 'alice', body: 'Looks great! The `rotate()` method is exactly what we needed for the cycle resolution algorithm.', createdAt: '2025-12-01T15:00:00Z' }, createdAt: '2025-12-01T15:00:00Z' },
      { type: 'comment', comment: { id: 1, author: 'bob', body: 'Thanks! I also added `merge()` for combining orbits — should help with the distributed case.', createdAt: '2025-12-02T09:00:00Z' }, createdAt: '2025-12-02T09:00:00Z' },
      { type: 'status_change', from: 'open', to: 'merged', author: 'alice', createdAt: '2025-12-03T14:00:00Z' },
      { type: 'merge', author: 'alice', createdAt: '2025-12-03T14:00:00Z' },
    ],
    mergeable: false,
  },
  {
    id: 1,
    title: 'Refactor Edge to use generics',
    description: `Refactors the \`Edge\` module to use generic type parameters for better type inference.\n\nThis is a breaking change for downstream consumers that rely on the concrete \`Ray\` type in edge construction.`,
    status: 'closed',
    author: 'charlie',
    createdAt: '2025-12-05T08:00:00Z',
    updatedAt: '2025-12-08T12:00:00Z',
    sourceVersion: 'b2c3d4e5-f6a1-11ee-b002-000000000001',
    targetVersion: 'b2c3d4e5-f6a1-11ee-b002-000000000000',
    sourceLabel: 'charlie/edge-generics',
    targetLabel: 'main',
    commits: [
      {
        id: 'c1b2c3d4-e5f6-11ee-b002-000000000010',
        message: 'Refactor Edge module with generic type parameters',
        author: 'charlie',
        createdAt: '2025-12-05T09:00:00Z',
        diffs: [
          {
            path: 'src/Edge.ts',
            oldContent: EDGE_TS_CONTENT,
            newContent: `// Edge.ts — One-dimensional composition of rays (generic)

import { Ray } from './Ray';

export type Edge<T extends Ray = Ray> = T;

export function isEdge(ray: Ray): boolean {
  return !ray.is_vertex;
}

export function createEdge<T extends Ray>(initial: T, terminal: T): Edge<T> {
  return Ray.edge(initial, terminal) as Edge<T>;
}

export function chain<T extends Ray>(...rays: T[]): Edge<T> {
  if (rays.length === 0) return Ray.vertex() as Edge<T>;
  let current: Ray = rays[0];
  for (let i = 1; i < rays.length; i++) {
    current = current.compose(rays[i]);
  }
  return current as Edge<T>;
}

export function reverse<T extends Ray>(edge: Edge<T>): Edge<T> {
  return Ray.edge(edge.terminal, edge.initial) as Edge<T>;
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
}`,
            type: 'modified',
          },
        ],
      },
    ],
    comments: [
      { id: 2, author: 'alice', body: 'I think this introduces too much complexity for the current use case. Can we revisit after the v2 migration?', createdAt: '2025-12-06T10:00:00Z' },
    ],
    activity: [
      { type: 'commit', commit: { id: 'c1b2c3d4-e5f6-11ee-b002-000000000010', message: 'Refactor Edge module with generic type parameters', author: 'charlie', createdAt: '2025-12-05T09:00:00Z', diffs: [] }, createdAt: '2025-12-05T09:00:00Z' },
      { type: 'comment', comment: { id: 2, author: 'alice', body: 'I think this introduces too much complexity for the current use case. Can we revisit after the v2 migration?', createdAt: '2025-12-06T10:00:00Z' }, createdAt: '2025-12-06T10:00:00Z' },
      { type: 'status_change', from: 'open', to: 'closed', author: 'charlie', createdAt: '2025-12-08T12:00:00Z' },
    ],
    mergeable: false,
  },
  {
    id: 2,
    title: 'Add superposition support to Ray',
    description: `Introduces superposition semantics to the \`Ray\` class, enabling quantum-style composition.\n\n## Changes\n- New \`Ray.superpose(...rays)\` static method\n- New \`superpositions\` getter\n- Updated \`is_equivalent\` to handle superposed rays\n- Added \`RayLike\` interface for structural typing`,
    status: 'open',
    author: 'alice',
    createdAt: '2025-12-10T09:00:00Z',
    updatedAt: '2025-12-12T16:00:00Z',
    sourceVersion: 'c3d4e5f6-a1b2-11ee-b003-000000000001',
    targetVersion: 'c3d4e5f6-a1b2-11ee-b003-000000000000',
    sourceLabel: 'alice/superposition',
    targetLabel: 'main',
    commits: [
      {
        id: 'c2a1b2c3-d4e5-11ee-b003-000000000010',
        message: 'Add RayLike interface and superpose static method',
        author: 'alice',
        createdAt: '2025-12-10T10:00:00Z',
        diffs: [
          {
            path: 'src/Ray.ts',
            oldContent: RAY_TS_V1,
            newContent: `// Ray.ts — The fundamental compositional primitive
// v1.5: Adding superposition groundwork

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
}`,
            type: 'modified',
          },
        ],
      },
      {
        id: 'c2b1c2d3-e4f5-11ee-b003-000000000011',
        message: 'Implement full superposition with equivalence checks',
        author: 'alice',
        createdAt: '2025-12-11T14:00:00Z',
        diffs: [
          {
            path: 'src/Ray.ts',
            oldContent: RAY_TS_V1,
            newContent: RAY_TS_V2,
            type: 'modified',
          },
        ],
      },
    ],
    comments: [
      { id: 3, author: 'bob', body: 'The `RayLike` interface is a nice touch. Will this support cross-universe superposition eventually?', createdAt: '2025-12-10T14:00:00Z' },
      { id: 4, author: 'alice', body: 'That is the plan! This PR lays the groundwork. Cross-universe will come in a follow-up.', createdAt: '2025-12-10T16:00:00Z' },
      { id: 5, author: 'charlie', body: 'I tested the equivalence changes — they pass all existing test cases plus the new superposition ones.', createdAt: '2025-12-12T11:00:00Z' },
    ],
    activity: [
      { type: 'commit', commit: { id: 'c2a1b2c3-d4e5-11ee-b003-000000000010', message: 'Add RayLike interface and superpose static method', author: 'alice', createdAt: '2025-12-10T10:00:00Z', diffs: [] }, createdAt: '2025-12-10T10:00:00Z' },
      { type: 'comment', comment: { id: 3, author: 'bob', body: 'The `RayLike` interface is a nice touch. Will this support cross-universe superposition eventually?', createdAt: '2025-12-10T14:00:00Z' }, createdAt: '2025-12-10T14:00:00Z' },
      { type: 'comment', comment: { id: 4, author: 'alice', body: 'That is the plan! This PR lays the groundwork. Cross-universe will come in a follow-up.', createdAt: '2025-12-10T16:00:00Z' }, createdAt: '2025-12-10T16:00:00Z' },
      { type: 'commit', commit: { id: 'c2b1c2d3-e4f5-11ee-b003-000000000011', message: 'Implement full superposition with equivalence checks', author: 'alice', createdAt: '2025-12-11T14:00:00Z', diffs: [] }, createdAt: '2025-12-11T14:00:00Z' },
      { type: 'comment', comment: { id: 5, author: 'charlie', body: 'I tested the equivalence changes — they pass all existing test cases plus the new superposition ones.', createdAt: '2025-12-12T11:00:00Z' }, createdAt: '2025-12-12T11:00:00Z' },
    ],
    mergeable: true,
  },
  {
    id: 3,
    title: 'Improve documentation README',
    description: `Updates the README to reflect the v2 API changes and adds migration guide.\n\nThis aligns the documentation with the in-progress superposition branch.`,
    status: 'open',
    author: 'alice',
    createdAt: '2025-12-13T11:00:00Z',
    updatedAt: '2025-12-13T11:00:00Z',
    sourceVersion: 'd4e5f6a1-b2c3-11ee-b004-000000000001',
    targetVersion: 'd4e5f6a1-b2c3-11ee-b004-000000000000',
    sourceLabel: 'alice/docs-update',
    targetLabel: 'main',
    commits: [
      {
        id: 'c3a1b2c3-d4e5-11ee-b004-000000000010',
        message: 'Update README with v2 API changes and migration guide',
        author: 'alice',
        createdAt: '2025-12-13T11:30:00Z',
        diffs: [
          {
            path: 'README.md',
            oldContent: README_CONTENT,
            newContent: ALT_README,
            type: 'modified',
          },
        ],
      },
    ],
    comments: [],
    activity: [
      { type: 'commit', commit: { id: 'c3a1b2c3-d4e5-11ee-b004-000000000010', message: 'Update README with v2 API changes and migration guide', author: 'alice', createdAt: '2025-12-13T11:30:00Z', diffs: [] }, createdAt: '2025-12-13T11:30:00Z' },
    ],
    mergeable: true,
  },
];

dummyPullRequests.set('@ether/library', etherLibraryPRs);

// PRs for @ether/library/assets (nested sub-path)
const etherLibraryAssetsPRs: PullRequest[] = [
  {
    id: 100,
    title: 'Add high-res banner variants',
    description: 'Adds 2x and 3x resolution variants of the banner for retina displays.',
    status: 'open',
    author: 'bob',
    createdAt: '2025-12-14T09:00:00Z',
    updatedAt: '2025-12-14T09:00:00Z',
    sourceVersion: 'e5f6a1b2-c3d4-11ee-b005-000000000001',
    targetVersion: 'e5f6a1b2-c3d4-11ee-b005-000000000000',
    sourceLabel: 'bob/hires-assets',
    targetLabel: 'main',
    commits: [
      {
        id: 'c4a1b2c3-d4e5-11ee-b005-000000000010',
        message: 'Add banner@2x.png and banner@3x.png',
        author: 'bob',
        createdAt: '2025-12-14T09:30:00Z',
        diffs: [
          { path: 'banner@2x.png', oldContent: '', newContent: '(binary)', type: 'added' },
          { path: 'banner@3x.png', oldContent: '', newContent: '(binary)', type: 'added' },
        ],
      },
    ],
    comments: [
      { id: 10, author: 'alice', body: 'These look sharp! Can we also get an SVG version?', createdAt: '2025-12-14T12:00:00Z' },
    ],
    activity: [
      { type: 'commit', commit: { id: 'c4a1b2c3-d4e5-11ee-b005-000000000010', message: 'Add banner@2x.png and banner@3x.png', author: 'bob', createdAt: '2025-12-14T09:30:00Z', diffs: [] }, createdAt: '2025-12-14T09:30:00Z' },
      { type: 'comment', comment: { id: 10, author: 'alice', body: 'These look sharp! Can we also get an SVG version?', createdAt: '2025-12-14T12:00:00Z' }, createdAt: '2025-12-14T12:00:00Z' },
    ],
    mergeable: true,
  },
  {
    id: 101,
    title: 'Update logo color scheme',
    description: 'Changes the logo to match the new brand guidelines.',
    status: 'merged',
    author: 'alice',
    createdAt: '2025-12-08T10:00:00Z',
    updatedAt: '2025-12-09T15:00:00Z',
    sourceVersion: 'f6a1b2c3-d4e5-11ee-b006-000000000001',
    targetVersion: 'f6a1b2c3-d4e5-11ee-b006-000000000000',
    sourceLabel: 'alice/logo-update',
    targetLabel: 'main',
    commits: [
      {
        id: 'c5a1b2c3-d4e5-11ee-b006-000000000010',
        message: 'Update logo.svg with new color palette',
        author: 'alice',
        createdAt: '2025-12-08T10:30:00Z',
        diffs: [
          { path: 'logo.svg', oldContent: '<svg><!-- old --></svg>', newContent: '<svg><!-- new colors --></svg>', type: 'modified' },
        ],
      },
    ],
    comments: [],
    activity: [
      { type: 'commit', commit: { id: 'c5a1b2c3-d4e5-11ee-b006-000000000010', message: 'Update logo.svg with new color palette', author: 'alice', createdAt: '2025-12-08T10:30:00Z', diffs: [] }, createdAt: '2025-12-08T10:30:00Z' },
      { type: 'merge', author: 'bob', createdAt: '2025-12-09T15:00:00Z' },
    ],
    mergeable: false,
  },
];

dummyPullRequests.set('@ether/library/assets', etherLibraryAssetsPRs);

// PRs for @ether/genesis (world — separate from inline listing)
const etherGenesisPRs: PullRequest[] = [
  {
    id: 200,
    title: 'Update terrain heightmap generator',
    description: 'Improves terrain generation with Perlin noise for smoother landscapes.',
    status: 'open',
    author: 'alice',
    createdAt: '2025-12-15T09:00:00Z',
    updatedAt: '2025-12-15T09:00:00Z',
    sourceVersion: 'g1a1b2c3-d4e5-11ee-b010-000000000001',
    targetVersion: 'g1a1b2c3-d4e5-11ee-b010-000000000000',
    sourceLabel: 'alice/terrain-update',
    targetLabel: 'main',
    commits: [{
      id: 'cg1b2c3d-e4f5-11ee-b010-000000000010',
      message: 'Implement Perlin noise heightmap generation',
      author: 'alice',
      createdAt: '2025-12-15T09:30:00Z',
      diffs: [{ path: 'terrain/heightmap.ray', oldContent: '// old heightmap', newContent: '// new Perlin noise heightmap', type: 'modified' }],
    }],
    comments: [{ id: 20, author: 'bob', body: 'The noise parameters look good. Maybe add a seed option?', createdAt: '2025-12-15T14:00:00Z' }],
    activity: [
      { type: 'commit', commit: { id: 'cg1b2c3d-e4f5-11ee-b010-000000000010', message: 'Implement Perlin noise heightmap generation', author: 'alice', createdAt: '2025-12-15T09:30:00Z', diffs: [] }, createdAt: '2025-12-15T09:30:00Z' },
      { type: 'comment', comment: { id: 20, author: 'bob', body: 'The noise parameters look good. Maybe add a seed option?', createdAt: '2025-12-15T14:00:00Z' }, createdAt: '2025-12-15T14:00:00Z' },
    ],
    mergeable: true,
  },
  {
    id: 201,
    title: 'Add NPC dialogue system',
    description: 'Implements a basic dialogue tree system for world NPCs.',
    status: 'open',
    author: 'bob',
    createdAt: '2025-12-16T11:00:00Z',
    updatedAt: '2025-12-16T11:00:00Z',
    sourceVersion: 'g2a1b2c3-d4e5-11ee-b011-000000000001',
    targetVersion: 'g2a1b2c3-d4e5-11ee-b011-000000000000',
    sourceLabel: 'bob/npc-dialogue',
    targetLabel: 'main',
    commits: [{
      id: 'cg2b2c3d-e4f5-11ee-b011-000000000010',
      message: 'Add basic dialogue tree for NPCs',
      author: 'bob',
      createdAt: '2025-12-16T11:30:00Z',
      diffs: [{ path: 'entities/npc.ray', oldContent: '// basic npc', newContent: '// npc with dialogue', type: 'modified' }],
    }],
    comments: [],
    activity: [
      { type: 'commit', commit: { id: 'cg2b2c3d-e4f5-11ee-b011-000000000010', message: 'Add basic dialogue tree for NPCs', author: 'bob', createdAt: '2025-12-16T11:30:00Z', diffs: [] }, createdAt: '2025-12-16T11:30:00Z' },
    ],
    mergeable: true,
  },
];

// Store world PRs under ~genesis (world prefix), not the folder genesis
dummyPullRequests.set('@ether/~genesis', etherGenesisPRs);

// PRs for @ether/@alice (player sub-namespace)
const etherAlicePRs: PullRequest[] = [
  {
    id: 300,
    title: 'Update profile configuration',
    description: 'Reorganizes profile settings and adds new bio section.',
    status: 'open',
    author: 'alice',
    createdAt: '2025-12-17T10:00:00Z',
    updatedAt: '2025-12-17T10:00:00Z',
    sourceVersion: 'p1a1b2c3-d4e5-11ee-b020-000000000001',
    targetVersion: 'p1a1b2c3-d4e5-11ee-b020-000000000000',
    sourceLabel: 'alice/profile-update',
    targetLabel: 'main',
    commits: [{
      id: 'cp1b2c3d-e4f5-11ee-b020-000000000010',
      message: 'Add bio section to profile',
      author: 'alice',
      createdAt: '2025-12-17T10:30:00Z',
      diffs: [{ path: 'profile.ray', oldContent: '// basic profile', newContent: '// profile with bio', type: 'modified' }],
    }],
    comments: [],
    activity: [
      { type: 'commit', commit: { id: 'cp1b2c3d-e4f5-11ee-b020-000000000010', message: 'Add bio section to profile', author: 'alice', createdAt: '2025-12-17T10:30:00Z', diffs: [] }, createdAt: '2025-12-17T10:30:00Z' },
    ],
    mergeable: true,
  },
];

dummyPullRequests.set('@ether/@alice', etherAlicePRs);

// PRs for nested world ~alpha within ~genesis
const genesisAlphaPRs: PullRequest[] = [
  {
    id: 400,
    title: 'Initialize world seed parameters',
    description: 'Sets up the initial seed configuration for the alpha sub-world.',
    status: 'open',
    author: 'alice',
    createdAt: '2025-12-18T09:00:00Z',
    updatedAt: '2025-12-18T09:00:00Z',
    sourceVersion: 'h1a1b2c3-d4e5-11ee-b030-000000000001',
    targetVersion: 'h1a1b2c3-d4e5-11ee-b030-000000000000',
    sourceLabel: 'alice/alpha-seed',
    targetLabel: 'main',
    commits: [{
      id: 'ch1b2c3d-e4f5-11ee-b030-000000000010',
      message: 'Configure alpha world seed parameters',
      author: 'alice',
      createdAt: '2025-12-18T09:30:00Z',
      diffs: [{ path: 'seed.ray', oldContent: '// empty seed', newContent: '// configured seed with params', type: 'modified' }],
    }],
    comments: [],
    activity: [
      { type: 'commit', commit: { id: 'ch1b2c3d-e4f5-11ee-b030-000000000010', message: 'Configure alpha world seed parameters', author: 'alice', createdAt: '2025-12-18T09:30:00Z', diffs: [] }, createdAt: '2025-12-18T09:30:00Z' },
    ],
    mergeable: true,
  },
];

dummyPullRequests.set('@ether/~genesis/~alpha', genesisAlphaPRs);

// PRs for player @bob within ~genesis
const genesisBobPRs: PullRequest[] = [
  {
    id: 401,
    title: 'Add builder toolkit blueprints',
    description: 'Adds Bob\'s builder toolkit with tower blueprints for genesis.',
    status: 'open',
    author: 'bob',
    createdAt: '2025-12-19T11:00:00Z',
    updatedAt: '2025-12-19T11:00:00Z',
    sourceVersion: 'h2a1b2c3-d4e5-11ee-b031-000000000001',
    targetVersion: 'h2a1b2c3-d4e5-11ee-b031-000000000000',
    sourceLabel: 'bob/builder-toolkit',
    targetLabel: 'main',
    commits: [{
      id: 'ch2b2c3d-e4f5-11ee-b031-000000000010',
      message: 'Add tower blueprint templates',
      author: 'bob',
      createdAt: '2025-12-19T11:30:00Z',
      diffs: [{ path: 'blueprints/tower.ray', oldContent: '', newContent: '// tower blueprint v2', type: 'added' }],
    }],
    comments: [],
    activity: [
      { type: 'commit', commit: { id: 'ch2b2c3d-e4f5-11ee-b031-000000000010', message: 'Add tower blueprint templates', author: 'bob', createdAt: '2025-12-19T11:30:00Z', diffs: [] }, createdAt: '2025-12-19T11:30:00Z' },
    ],
    mergeable: true,
  },
];

dummyPullRequests.set('@ether/~genesis/@bob', genesisBobPRs);

// ---- PR accessor functions ----

/** Get PRs registered directly at this path (not nested). */
export function getPullRequests(canonicalPath: string): PullRequest[] {
  return dummyPullRequests.get(canonicalPath) || [];
}

/** Get ALL PRs at this path and all nested sub-paths. */
export function getAllPullRequests(canonicalPath: string): PullRequest[] {
  const result: PullRequest[] = [];
  const prefix = canonicalPath + '/';
  for (const [key, prs] of dummyPullRequests) {
    if (key === canonicalPath || key.startsWith(prefix)) {
      result.push(...prs);
    }
  }
  return result;
}

/** A PR paired with its relative folder path (empty string if direct). */
export interface InlinePR {
  pr: PullRequest;
  relPath: string;
}

/** Get PRs for the inline list — includes nested sub-paths but excludes
 *  world (~) and player (@) sub-paths at any level (those get category rows). */
export function getInlinePullRequests(canonicalPath: string): InlinePR[] {
  const result: InlinePR[] = [];
  const prefix = canonicalPath + '/';

  for (const [key, prs] of dummyPullRequests) {
    if (key === canonicalPath) {
      for (const pr of prs) result.push({ pr, relPath: '' });
    } else if (key.startsWith(prefix)) {
      const rest = key.slice(prefix.length);
      const firstSeg = rest.split('/')[0];
      // Always exclude ~ (worlds) and @ (players) sub-paths — they get their own category rows
      if (firstSeg.startsWith('~') || firstSeg.startsWith('@')) continue;
      for (const pr of prs) result.push({ pr, relPath: rest });
    }
  }
  return result;
}

/** Summary of PRs in a category (worlds or players). */
export interface CategoryPRSummary {
  openCount: number;
  closedCount: number;
  itemCount: number;
}

/** Get summary of PRs in ~ or @ prefixed sub-paths. Works at any level. */
export function getCategoryPRSummary(canonicalPath: string, categoryPrefix: '~' | '@'): CategoryPRSummary | null {
  const prefix = canonicalPath + '/';
  const items = new Set<string>();
  let openCount = 0;
  let closedCount = 0;

  for (const [key, prs] of dummyPullRequests) {
    if (key.startsWith(prefix)) {
      const rest = key.slice(prefix.length);
      const firstSeg = rest.split('/')[0];
      if (firstSeg.startsWith(categoryPrefix)) {
        items.add(firstSeg);
        openCount += prs.filter(pr => pr.status === 'open').length;
        closedCount += prs.filter(pr => pr.status !== 'open').length;
      }
    }
  }

  if (items.size === 0) return null;
  return { openCount, closedCount, itemCount: items.size };
}

/** Get PRs from a specific category (worlds ~ or players @) for the category list page. */
export function getCategoryPullRequests(canonicalPath: string, categoryPrefix: '~' | '@'): InlinePR[] {
  const result: InlinePR[] = [];
  const prefix = canonicalPath + '/';

  for (const [key, prs] of dummyPullRequests) {
    if (key.startsWith(prefix)) {
      const rest = key.slice(prefix.length);
      const firstSeg = rest.split('/')[0];
      if (firstSeg.startsWith(categoryPrefix)) {
        for (const pr of prs) result.push({ pr, relPath: rest });
      }
    }
  }
  return result;
}

export function getPullRequest(canonicalPath: string, prId: number): PullRequest | null {
  // Search at this path first, then nested paths
  const direct = getPullRequests(canonicalPath);
  const found = direct.find(pr => pr.id === prId);
  if (found) return found;
  // Search nested (all sub-paths including ~/@ prefixed ones)
  const prefix = canonicalPath + '/';
  for (const [key, prs] of dummyPullRequests) {
    if (key.startsWith(prefix)) {
      const nested = prs.find(pr => pr.id === prId);
      if (nested) return nested;
    }
  }
  return null;
}

/** Open PR count for the PR button — excludes world/player PRs at user root level. */
export function getOpenPRCount(canonicalPath: string): number {
  return getInlinePullRequests(canonicalPath).filter(({ pr }) => pr.status === 'open').length;
}

let nextPRId = 4;

export function createPullRequest(
  canonicalPath: string,
  title: string,
  description: string,
  sourceLabel: string,
  targetLabel: string,
  author?: string,
): PullRequest {
  const pr: PullRequest = {
    id: nextPRId++,
    title,
    description,
    status: 'open',
    author: author || 'anonymous',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceVersion: crypto.randomUUID(),
    targetVersion: crypto.randomUUID(),
    sourceLabel,
    targetLabel,
    commits: [],
    comments: [],
    activity: [],
    mergeable: true,
  };
  const prs = dummyPullRequests.get(canonicalPath) || [];
  prs.push(pr);
  dummyPullRequests.set(canonicalPath, prs);
  return pr;
}
