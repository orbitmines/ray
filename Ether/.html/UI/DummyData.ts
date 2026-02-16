// ============================================================
// DummyData.ts — Mock file tree for @ether (player = repository)
// ============================================================

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  modified: string;
  children?: FileEntry[];
  content?: string;
}

export interface Repository {
  user: string;
  description: string;
  tree: FileEntry[];
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

const DOCS_README = `# Documentation

Detailed guides for working with @ether/library.

## Contents

- \`getting-started.md\` — Setup and first steps
- \`api.md\` — Full API reference
- \`architecture.md\` — Internal design overview
`;

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
            { name: 'Ray.ts', isDirectory: false, modified: '2 days ago' },
            { name: 'Vertex.ts', isDirectory: false, modified: '5 days ago' },
            { name: 'Edge.ts', isDirectory: false, modified: '5 days ago' },
            { name: 'Orbit.ts', isDirectory: false, modified: '3 days ago' },
            { name: 'index.ts', isDirectory: false, modified: '2 days ago' },
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
        { name: 'README.md', isDirectory: false, modified: 'yesterday', content: README_CONTENT },
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
        { name: 'package.json', isDirectory: false, modified: '3 days ago' },
        { name: 'tsconfig.json', isDirectory: false, modified: '1 week ago' },
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

export function resolveDirectory(tree: FileEntry[], pathSegments: string[]): FileEntry[] | null {
  let current = tree;
  for (const segment of pathSegments) {
    const entry = current.find(e => e.name === segment && e.isDirectory);
    if (!entry || !entry.children) return null;
    current = entry.children;
  }
  return current;
}

export function resolveFile(tree: FileEntry[], pathSegments: string[]): FileEntry | null {
  if (pathSegments.length === 0) return null;
  const dirPath = pathSegments.slice(0, -1);
  const fileName = pathSegments[pathSegments.length - 1];
  const dir = dirPath.length > 0 ? resolveDirectory(tree, dirPath) : tree;
  if (!dir) return null;
  return dir.find(e => e.name === fileName && !e.isDirectory) || null;
}
