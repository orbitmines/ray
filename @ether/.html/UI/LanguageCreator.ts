// ============================================================
// LanguageCreator.ts — Programming Language Creator ($namespace)
// ============================================================
// /$ → list all languages (using the same file-table as Repository)
// /$.ray → language creator for .ray (IDE layout with sidebar + modules panel)

import { PHOSPHOR, CRT_SCREEN_BG } from './CRTShell.ts';
import { injectStyles as injectRepoStyles, escapeHtml, renderSidebarTree, bindSidebarTree, bindSidebarFiles, bindAccessBadges } from './Repository.ts';
import type { SidebarContext } from './Repository.ts';
import { fileIcon } from './FileIcons.ts';
import { createIDELayout, generateId, injectIDEStyles } from './IDELayout.ts';
import type { IDELayoutAPI, PanelDefinition, LayoutNode } from './IDELayout.ts';
import { getAPI } from './EtherAPI.ts';
import type { FileEntry } from './EtherAPI.ts';

// ---- Types ----

export interface LangParams {
  user: string;
  base: string;
  lang: string | null;
  path: string[];
}

// ---- Module-as-program data model ----
// The program is an ordered tree of module instances.
// Each module type defines which modifier types can go under it,
// and which other module types must precede it.

interface ModuleType {
  id: string;
  name: string;
  description: string;
  /** Config fields for this module type */
  fields: ModuleField[];
  /**
   * Display template: how this module renders as a single line.
   * Use {fieldKey} for editable fields, everything else is chrome (non-editable, dimmed).
   * e.g. 'Load File({path})' → "Load File(" is chrome, path is editable, ")" is chrome.
   * If omitted, renders as: Name {field1} {field2} ...
   */
  display?: string;
  /** Which module type IDs can be children (modifiers) of this type */
  acceptsModifiers: string[];
  /** Which module type IDs must appear earlier in the program (top-level ordering constraint) */
  mustFollow: string[];
  /** Can this module type appear multiple times in the program? */
  repeatable: boolean;
}

interface ModuleField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'toggle';
  options?: [string, string][];  // for select: [value, label]
  placeholder?: string;
}

/** A concrete instance in the program tree */
interface ModuleInstance {
  id: string;           // unique instance id
  typeId: string;       // references ModuleType.id
  config: Record<string, any>;
  children: ModuleInstance[];
  isDefault: boolean;   // true = came from defaults, shown muted
  expanded: boolean;    // UI state: is this node expanded in the program view
}

interface LangConfig {
  extension: string;
  /** The program: ordered list of module instances (tree) */
  program: ModuleInstance[];
}

// ---- Module Type Registry ----

const MODULE_TYPES: ModuleType[] = [
  // -- Top-level modules --
  {
    id: 'reading', name: 'Reading', description: 'How source is loaded and read',
    fields: [{ key: 'direction', label: 'Direction', type: 'select', options: [['ltr', 'Left-to-right'], ['rtl', 'Right-to-left']] }],
    display: 'Reading({direction})',
    acceptsModifiers: ['load-file', 'load-directory', 'read-rtl', 'read-ltr', 'bidirectional', 'per-construct-override'],
    mustFollow: [], repeatable: false,
  },
  {
    id: 'structure', name: 'Structure', description: 'How whitespace, indentation, and lines are meaningful',
    fields: [
      { key: 'indentation', label: 'Indentation', type: 'toggle' },
      { key: 'lines', label: 'Lines', type: 'toggle' },
      { key: 'separator', label: 'Separator', type: 'text', placeholder: 'newline' },
    ],
    display: 'Structure({separator})',
    acceptsModifiers: [], mustFollow: ['reading'], repeatable: false,
  },
  {
    id: 'delimiters', name: 'Delimiters', description: 'Matched pairs that group things',
    fields: [{ key: 'pairs', label: 'Pairs', type: 'text', placeholder: '() [] {}' }],
    display: 'Delimiters({pairs})',
    acceptsModifiers: ['nesting'], mustFollow: ['structure'], repeatable: false,
  },
  {
    id: 'comments', name: 'Comments', description: 'What the parser ignores',
    fields: [
      { key: 'line', label: 'Line', type: 'text', placeholder: '//' },
      { key: 'blockOpen', label: 'Block open', type: 'text', placeholder: '/*' },
      { key: 'blockClose', label: 'Block close', type: 'text', placeholder: '*/' },
    ],
    display: 'Comments({line})',
    acceptsModifiers: [], mustFollow: [], repeatable: false,
  },
  {
    id: 'tokenization', name: 'Tokenization', description: 'How characters become tokens',
    fields: [
      { key: 'identifierChars', label: 'Identifier chars', type: 'text', placeholder: '\\S' },
      { key: 'tokenBreakers', label: 'Breakers', type: 'text', placeholder: 'space, newline' },
    ],
    display: 'Tokenization({identifierChars})',
    acceptsModifiers: ['compound-splitting'], mustFollow: ['structure'], repeatable: false,
  },
  {
    id: 'binding', name: 'Binding', description: 'How names get assigned to things',
    fields: [{ key: 'syntax', label: 'Syntax', type: 'text', placeholder: '=' }],
    display: 'Binding({syntax})',
    acceptsModifiers: ['aliasing', 'forward-references'], mustFollow: ['tokenization'], repeatable: false,
  },
  {
    id: 'scoping', name: 'Scoping', description: 'How name lookup works',
    fields: [
      { key: 'model', label: 'Model', type: 'select', options: [['lexical', 'Lexical'], ['dynamic', 'Dynamic'], ['hybrid', 'Hybrid']] },
      { key: 'self', label: 'Self', type: 'text', placeholder: 'this' },
      { key: 'unresolved', label: 'Unresolved', type: 'select', options: [['error', 'Error'], ['forward', 'Forward ref'], ['auto', 'Auto-create']] },
    ],
    display: 'Scoping({model}, self: {self})',
    acceptsModifiers: [], mustFollow: ['binding'], repeatable: false,
  },
  {
    id: 'evaluation', name: 'Evaluation', description: 'When things get computed',
    fields: [
      { key: 'strategy', label: 'Strategy', type: 'select', options: [['lazy', 'Lazy'], ['eager', 'Eager'], ['mixed', 'Mixed']] },
      { key: 'passes', label: 'Passes', type: 'text', placeholder: 'fixpoint' },
    ],
    display: 'Evaluation({strategy}, {passes})',
    acceptsModifiers: ['fixpoint'], mustFollow: ['scoping'], repeatable: false,
  },
  {
    id: 'associativity', name: 'Associativity', description: 'How chained operations group',
    fields: [
      { key: 'default', label: 'Default', type: 'select', options: [['left', 'Left'], ['right', 'Right'], ['none', 'None']] },
      { key: 'precedence', label: 'Precedence', type: 'select', options: [['numeric', 'Numeric'], ['positional', 'Positional'], ['none', 'None']] },
    ],
    display: 'Associativity({default})',
    acceptsModifiers: ['per-construct-override'], mustFollow: ['evaluation'], repeatable: false,
  },
  {
    id: 'patterns', name: 'Patterns', description: 'How syntax rules are expressed',
    fields: [
      { key: 'bindingSlots', label: 'Binding slots', type: 'text', placeholder: '{name: type}' },
      { key: 'alternation', label: 'Alternation', type: 'text', placeholder: '|' },
      { key: 'body', label: 'Body syntax', type: 'text', placeholder: '=>' },
    ],
    display: 'Patterns({alternation}, {body})',
    acceptsModifiers: [], mustFollow: ['tokenization'], repeatable: false,
  },
  {
    id: 'dispatch', name: 'Dispatch', description: 'How calls work',
    fields: [
      { key: 'call', label: 'Call syntax', type: 'text', placeholder: 'juxtaposition' },
      { key: 'notCallable', label: 'Not callable', type: 'text', placeholder: 'error' },
    ],
    display: 'Dispatch({call})',
    acceptsModifiers: ['fallback-chain'], mustFollow: ['binding'], repeatable: false,
  },
  {
    id: 'diagnostics', name: 'Diagnostics', description: 'Error reporting',
    fields: [
      { key: 'recovery', label: 'Recovery', type: 'select', options: [['stop', 'Stop'], ['collect', 'Collect all'], ['recover', 'Recover']] },
      { key: 'locationTracking', label: 'Track locations', type: 'toggle' },
    ],
    display: 'Diagnostics({recovery})',
    acceptsModifiers: [], mustFollow: [], repeatable: false,
  },
  {
    id: 'execution', name: 'Execution', description: 'REPL, debugger, AST browser',
    fields: [
      { key: 'repl', label: 'REPL', type: 'toggle' },
      { key: 'stepThrough', label: 'Step-through', type: 'toggle' },
      { key: 'astBrowser', label: 'AST browser', type: 'toggle' },
    ],
    display: 'Execution',
    acceptsModifiers: [], mustFollow: [], repeatable: false,
  },

  // -- Modifier modules (children of other modules) --
  { id: 'load-file', name: 'Load File', description: 'Load a specific source file',
    fields: [{ key: 'path', label: 'Path', type: 'text', placeholder: 'Node.ray' }],
    display: 'Load File({path})',
    acceptsModifiers: ['exclude'], mustFollow: [], repeatable: true },
  { id: 'load-directory', name: 'Load Directory', description: 'Load all matching files from a directory',
    fields: [
      { key: 'path', label: 'Path', type: 'text', placeholder: '.' },
      { key: 'extension', label: 'Extension', type: 'text', placeholder: '.ray' },
    ],
    display: 'Load Directory({path}, {extension})',
    acceptsModifiers: ['recursively', 'exclude'], mustFollow: ['load-file'], repeatable: true },
  { id: 'recursively', name: 'Recursively', description: 'Process subdirectories recursively',
    fields: [], display: 'Recursively',
    acceptsModifiers: [], mustFollow: [], repeatable: false },
  { id: 'exclude', name: 'Exclude', description: 'Exclude files matching a pattern',
    fields: [{ key: 'pattern', label: 'Pattern', type: 'text', placeholder: '*.test.ray' }],
    display: 'Exclude({pattern})',
    acceptsModifiers: [], mustFollow: [], repeatable: true },
  { id: 'read-rtl', name: 'Read RTL', description: 'Right-to-left reading for specific constructs',
    fields: [{ key: 'constructs', label: 'Constructs', type: 'text', placeholder: 'assignment' }],
    display: 'Read RTL({constructs})',
    acceptsModifiers: [], mustFollow: [], repeatable: false },
  { id: 'read-ltr', name: 'Read LTR', description: 'Left-to-right reading (explicit)',
    fields: [], display: 'Read LTR',
    acceptsModifiers: [], mustFollow: [], repeatable: false },
  { id: 'bidirectional', name: 'Bidirectional', description: 'Both directions coexist',
    fields: [], display: 'Bidirectional',
    acceptsModifiers: [], mustFollow: [], repeatable: false },
  { id: 'per-construct-override', name: 'Per-construct Override', description: 'Per-construct override',
    fields: [], display: 'Per-construct Override',
    acceptsModifiers: [], mustFollow: [], repeatable: false },
  { id: 'nesting', name: 'Nesting', description: 'Delimiter nesting rules',
    fields: [{ key: 'selfNest', label: 'Self-nesting', type: 'toggle' }],
    display: 'Nesting',
    acceptsModifiers: [], mustFollow: [], repeatable: false },
  { id: 'compound-splitting', name: 'Compound Splitting', description: 'Split multi-character tokens',
    fields: [{ key: 'strategy', label: 'Strategy', type: 'text', placeholder: 'split-candidate' }],
    display: 'Compound Splitting({strategy})',
    acceptsModifiers: [], mustFollow: [], repeatable: false },
  { id: 'aliasing', name: 'Aliasing', description: 'Multiple names for one thing',
    fields: [{ key: 'syntax', label: 'Syntax', type: 'text', placeholder: '|' }],
    display: 'Aliasing({syntax})',
    acceptsModifiers: [], mustFollow: [], repeatable: false },
  { id: 'forward-references', name: 'Forward References', description: 'Use before definition',
    fields: [], display: 'Forward References',
    acceptsModifiers: [], mustFollow: [], repeatable: false },
  { id: 'fixpoint', name: 'Fixpoint', description: 'Re-parse until grammar stabilizes',
    fields: [{ key: 'maxRounds', label: 'Max rounds', type: 'text', placeholder: '10' }],
    display: 'Fixpoint({maxRounds})',
    acceptsModifiers: [], mustFollow: [], repeatable: false },
  { id: 'fallback-chain', name: 'Fallback Chain', description: 'Prototype/fallback for method lookup',
    fields: [{ key: 'model', label: 'Model', type: 'text', placeholder: 'prototype' }],
    display: 'Fallback Chain({model})',
    acceptsModifiers: [], mustFollow: [], repeatable: false },
];

const MODULE_TYPE_MAP = new Map(MODULE_TYPES.map(t => [t.id, t]));

/** Build default program for a new language — all expanded by default */
function defaultProgram(lang: string): ModuleInstance[] {
  let nextId = 1;
  const inst = (typeId: string, config: Record<string, any> = {}, children: ModuleInstance[] = []): ModuleInstance => ({
    id: `m${nextId++}`, typeId, config, children, isDefault: true, expanded: true,
  });
  return [
    inst('reading', { direction: 'ltr' }, [
      inst('load-file', { path: `Node.${lang}` }),
      inst('load-directory', { path: '.', extension: `.${lang}` }, [
        inst('recursively'),
        inst('exclude', { pattern: `Node.${lang}` }),
      ]),
    ]),
    inst('structure', { indentation: true, lines: true, separator: 'newline' }),
    inst('delimiters', { pairs: '() [] {}' }, [inst('nesting', { selfNest: true })]),
    inst('comments', { line: '//' }),
    inst('tokenization', { identifierChars: '\\S', tokenBreakers: 'space, newline' }, [inst('compound-splitting', { strategy: 'split-candidate' })]),
    inst('binding', { syntax: '=' }, [inst('aliasing', { syntax: '|' }), inst('forward-references')]),
    inst('scoping', { model: 'lexical', self: 'this', unresolved: 'forward' }),
    inst('evaluation', { strategy: 'lazy', passes: 'fixpoint' }, [inst('fixpoint', { maxRounds: '10' })]),
    inst('associativity', { default: 'left', precedence: 'positional' }, [inst('per-construct-override')]),
    inst('patterns', { bindingSlots: '{name: type}', alternation: '|', body: '=>' }),
    inst('dispatch', { call: 'juxtaposition', notCallable: 'error' }, [inst('fallback-chain', { model: 'prototype' })]),
    inst('diagnostics', { recovery: 'collect', locationTracking: true }),
    inst('execution', { repl: true, stepThrough: true, astBrowser: true }),
  ];
}

// ---- Validation ----

interface ProgramError {
  instanceId: string;
  message: string;
}

function validateProgram(program: ModuleInstance[]): ProgramError[] {
  const errors: ProgramError[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < program.length; i++) {
    const inst = program[i];
    const mtype = MODULE_TYPE_MAP.get(inst.typeId);
    if (!mtype) { errors.push({ instanceId: inst.id, message: `Unknown module type: ${inst.typeId}` }); continue; }

    // Check mustFollow constraints
    for (const req of mtype.mustFollow) {
      if (!seen.has(req)) {
        const reqType = MODULE_TYPE_MAP.get(req);
        errors.push({ instanceId: inst.id, message: `${mtype.name} must come after ${reqType?.name ?? req}` });
      }
    }

    // Check required fields
    for (const field of mtype.fields) {
      const val = inst.config[field.key];
      if (field.type !== 'toggle' && (!val || (typeof val === 'string' && !val.trim()))) {
        errors.push({ instanceId: inst.id, message: `${mtype.name}: ${field.label} is not configured` });
      }
    }

    // Check children are valid modifiers
    for (const child of inst.children) {
      if (!mtype.acceptsModifiers.includes(child.typeId)) {
        const childType = MODULE_TYPE_MAP.get(child.typeId);
        errors.push({ instanceId: child.id, message: `${childType?.name ?? child.typeId} cannot be a modifier of ${mtype.name}` });
      }
    }

    seen.add(inst.typeId);
  }

  return errors;
}

// ---- State ----

let currentContainer: HTMLElement | null = null;
let navigateFn: ((path: string) => void) | null = null;
let currentParams: LangParams | null = null;
let currentConfig: LangConfig | null = null;
let selectedInstanceId: string | null = null;  // which module instance is selected/expanded for editing
let ideLayoutInstance: IDELayoutAPI | null = null;
let langStyleEl: HTMLStyleElement | null = null;

// ---- Styles (only what's unique to the language creator) ----

function injectLangStyles(): void {
  if (langStyleEl) return;
  langStyleEl = document.createElement('style');
  langStyleEl.textContent = `
    /* New language input row in the file table */
    .lang-new-row {
      display: flex;
      align-items: center;
      padding: 8px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .lang-new-row:last-child { border-bottom: none; }
    .lang-new-row .file-icon {
      flex: 0 0 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 10px;
    }
    .lang-new-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      color: rgba(255,255,255,0.5);
      padding: 0;
    }
    .lang-new-input::placeholder { color: rgba(255,255,255,0.2); }
    .lang-new-input:focus { color: ${PHOSPHOR}; }

    /* Program panel: code-like single-line display */
    .program-panel {
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      color: rgba(255,255,255,0.8);
      height: 100%;
      overflow-y: auto;
      padding: 8px 0;
      outline: none;
    }
    .prog-line {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 12px;
      min-height: 24px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.08s;
    }
    .prog-line:hover { background: rgba(255,255,255,0.03); }
    .prog-line.selected { background: rgba(255,255,255,0.07); }
    .prog-line.default .prog-chrome { color: rgba(255,255,255,0.4); }
    .prog-line.default .prog-field-text { color: rgba(255,255,255,0.5); }
    .prog-line.default.selected .prog-chrome { color: rgba(255,255,255,0.6); }
    .prog-line.default.selected .prog-field-text { color: rgba(255,255,255,0.7); }

    .prog-arrow {
      width: 12px;
      text-align: center;
      font-size: 10px;
      color: rgba(255,255,255,0.4);
      flex-shrink: 0;
      user-select: none;
      cursor: pointer;
    }
    .prog-arrow:hover { color: rgba(255,255,255,0.7); }

    .prog-display {
      display: inline-flex;
      align-items: center;
      gap: 0;
    }

    /* Chrome: non-editable structural text (keywords, parens) */
    .prog-chrome {
      color: rgba(255,255,255,0.65);
      user-select: none;
    }

    /* Inline editable text field */
    .prog-field-text {
      background: none;
      border: none;
      border-bottom: 1px solid transparent;
      font-family: inherit;
      font-size: inherit;
      color: rgba(255,255,255,0.85);
      padding: 0 1px;
      margin: 0;
      outline: none;
    }
    .prog-field-text:hover { border-bottom-color: rgba(255,255,255,0.15); }
    .prog-field-text:focus { border-bottom-color: rgba(255,255,255,0.4); color: ${PHOSPHOR}; }
    .prog-field-text::placeholder { color: rgba(255,255,255,0.25); }

    /* Inline select field */
    .prog-field-select {
      background: none;
      border: none;
      font-family: inherit;
      font-size: inherit;
      color: rgba(255,255,255,0.85);
      padding: 0;
      margin: 0;
      outline: none;
      cursor: pointer;
      -webkit-appearance: none;
      appearance: none;
    }
    .prog-field-select:focus { color: ${PHOSPHOR}; }
    .prog-field-select option { background: #111; color: rgba(255,255,255,0.85); }

    /* Inline toggle */
    .prog-field-toggle {
      accent-color: ${PHOSPHOR};
      margin: 0;
      cursor: pointer;
    }

    .prog-error-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #f48771;
      flex-shrink: 0;
      margin-left: 4px;
    }

    /* Errors panel (right) */
    .errors-panel {
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      color: rgba(255,255,255,0.8);
      height: 100%;
      overflow-y: auto;
      padding: 8px 0;
    }
    .errors-header {
      padding: 4px 12px 8px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: rgba(255,255,255,0.3);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .errors-count {
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 8px;
    }
    .errors-count.has-errors { background: rgba(244,135,113,0.15); color: #f48771; }
    .errors-count.no-errors { background: rgba(137,209,133,0.15); color: #89d185; }
    .error-entry {
      padding: 5px 12px;
      font-size: 12px;
      color: #f48771;
      cursor: pointer;
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    .error-entry:hover { background: rgba(255,255,255,0.04); }
    .error-entry .error-icon { flex-shrink: 0; font-size: 10px; margin-top: 2px; }
    .error-entry .error-msg { flex: 1; }
    .no-errors-msg {
      padding: 20px 12px;
      color: rgba(255,255,255,0.2);
      text-align: center;
      font-size: 12px;
    }
  `;
  document.head.appendChild(langStyleEl);
}

// ---- Config I/O ----

async function loadConfig(lang: string): Promise<LangConfig> {
  const api = getAPI();
  const raw = await api.readFile(`@ether/.${lang}/.${lang}.json`);
  if (raw) { try { return JSON.parse(raw); } catch {} }
  return { extension: lang, program: defaultProgram(lang) };
}

async function saveConfig(lang: string, config: LangConfig): Promise<void> {
  try {
    await fetch(`/**/@ether/.${lang}/.${lang}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config, null, 2),
    });
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

// ---- Helpers ----

function instanceSummary(inst: ModuleInstance): string {
  const vals = Object.values(inst.config).filter(v => v && typeof v === 'string');
  return vals.join(', ');
}

function findInstance(program: ModuleInstance[], id: string): ModuleInstance | null {
  for (const inst of program) {
    if (inst.id === id) return inst;
    const found = findInstance(inst.children, id);
    if (found) return found;
  }
  return null;
}

function instanceHasErrors(inst: ModuleInstance, errors: ProgramError[]): boolean {
  if (errors.some(e => e.instanceId === inst.id)) return true;
  return inst.children.some(c => instanceHasErrors(c, errors));
}

// ---- Render: Language List (/$) ----

async function renderLanguageList(el: HTMLElement): Promise<void> {
  const api = getAPI();
  const rootEntries = await api.listDirectory('@ether');
  const skipDirs = new Set(['html', 'intellij', 'ts', 'vite']);

  const languages: { ext: string; fileCount: number }[] = [];
  for (const entry of rootEntries) {
    if (!entry.isDirectory || !entry.name.startsWith('.') || entry.name.length <= 1) continue;
    const ext = entry.name.slice(1);
    if (skipDirs.has(ext)) continue;
    const files = await api.listDirectory(`@ether/${entry.name}`);
    const langFiles = files.filter(f => !f.isDirectory && f.name.endsWith(`.${ext}`));
    languages.push({ ext, fileCount: langFiles.length });
  }

  const FOLDER_ICON = fileIcon('folder', true);
  const NEW_ICON = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="opacity:0.35"><path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

  let rows = languages.map(l => `
    <div class="file-row" data-href="/$.${escapeHtml(l.ext)}">
      <div class="file-icon">${FOLDER_ICON}</div>
      <div class="file-name">.${escapeHtml(l.ext)}</div>
      <div class="file-modified">${l.fileCount} file${l.fileCount !== 1 ? 's' : ''}</div>
    </div>
  `).join('');

  // Inline "new language" input row
  rows += `
    <div class="lang-new-row">
      <div class="file-icon">${NEW_ICON}</div>
      <input class="lang-new-input" type="text" placeholder="new language extension..." data-lang-new />
    </div>
  `;

  el.innerHTML = `
    <div class="repo-page">
      <div class="repo-header">
        <span class="repo-name">$ Languages</span>
      </div>
      <div class="repo-description">Programming language definitions</div>
      <div class="file-table">${rows}</div>
    </div>
  `;

  // Bind row clicks
  el.querySelectorAll('.file-row[data-href]').forEach(row => {
    row.addEventListener('click', () => navigateFn?.((row as HTMLElement).dataset.href!));
  });

  // Bind new language input
  const input = el.querySelector('[data-lang-new]') as HTMLInputElement | null;
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = input.value.trim();
      if (val && /^[a-zA-Z][a-zA-Z0-9]*$/.test(val)) {
        navigateFn?.(`/$.${val}`);
      }
    }
  });
}

// ---- Render: Language Creator IDE (e.g. /$.ray) ----

async function renderLanguageCreator(el: HTMLElement, params: LangParams): Promise<void> {
  const lang = params.lang!;
  currentConfig = await loadConfig(lang);
  // Migrate old format or initialize defaults
  if (!currentConfig.program || !Array.isArray(currentConfig.program) || currentConfig.program.length === 0) {
    currentConfig.program = defaultProgram(lang);
  }
  const files = await loadFileTree(lang);

  const layoutMount = document.createElement('div');
  layoutMount.style.cssText = 'width:100%;height:100vh;';
  el.innerHTML = '';
  el.appendChild(layoutMount);

  // -- Sidebar: file explorer --
  const sidebarPanel: PanelDefinition = {
    id: 'lang-sidebar',
    title: `$.${lang}`,
    icon: fileIcon('folder', true),
    closable: false,
    sticky: true,
    render: (container) => { renderSidebarFiles(container, files, lang); },
  };

  // -- Center: the program (ordered module tree, expandable) --
  const programPanel: PanelDefinition = {
    id: 'lang-program',
    title: 'Program',
    closable: false,
    render: (container) => { renderProgramPanel(container, lang); },
  };

  // -- Right: errors with the current program --
  const errorsPanel: PanelDefinition = {
    id: 'lang-errors',
    title: 'Problems',
    closable: false,
    sticky: true,
    render: (container) => { renderErrorsPanel(container, lang); },
  };

  const initialLayout: LayoutNode = {
    type: 'split', id: generateId(), direction: 'horizontal',
    children: [
      { type: 'tabgroup', id: generateId(), panels: ['lang-sidebar'], activeIndex: 0 },
      { type: 'tabgroup', id: generateId(), panels: ['lang-program'], activeIndex: 0 },
      { type: 'tabgroup', id: generateId(), panels: ['lang-errors'], activeIndex: 0 },
    ],
    sizes: [0.18, 0.57, 0.25],
  };

  ideLayoutInstance = createIDELayout(layoutMount, {
    panels: [sidebarPanel, programPanel, errorsPanel],
    initialLayout,
    onNavigate: navigateFn || undefined,
  });
}

async function loadFileTree(lang: string): Promise<FileEntry[]> {
  return getAPI().listDirectory(`@ether/.${lang}`);
}

// ---- Sidebar: file tree (reuses Repository's renderSidebarTree + bindings) ----

function makeSidebarContext(lang: string): SidebarContext {
  const basePath = `/$.${lang}`;
  return {
    basePath,
    toApiPath: (relPath: string) => `@ether/.${lang}/${relPath}`,
    onFileClick: (href: string) => {
      // Future: open file content in a new IDE panel
      if (navigateFn) navigateFn(href);
    },
  };
}

function renderSidebarFiles(container: HTMLElement, files: FileEntry[], lang: string): void {
  if (files.length === 0) {
    container.innerHTML = `<div style="padding:12px;color:rgba(255,255,255,0.3);font-size:12px;font-family:'Courier New',monospace;">
      No files yet.<br>Files will appear in<br>@ether/.${escapeHtml(lang)}/
    </div>`;
    return;
  }

  const basePath = `/$.${lang}`;
  container.innerHTML = renderSidebarTree(files, basePath, [], 0);

  const ctx = makeSidebarContext(lang);
  bindSidebarTree(container, ctx);
  bindSidebarFiles(container, ctx);
  bindAccessBadges(container);
}

// ---- Program panel (center): code-like single-line display ----

/** Flatten the program tree into a flat list of {inst, depth} for arrow key navigation */
function flattenProgram(program: ModuleInstance[], depth: number = 0): { inst: ModuleInstance; depth: number }[] {
  const result: { inst: ModuleInstance; depth: number }[] = [];
  for (const inst of program) {
    result.push({ inst, depth });
    if (inst.expanded && inst.children.length > 0) {
      result.push(...flattenProgram(inst.children, depth + 1));
    }
  }
  return result;
}

/** Render a module instance as a single line using the display template.
 *  Chrome (non-field text) is dimmed. Fields are inline editable inputs. */
function renderDisplayLine(inst: ModuleInstance, mtype: ModuleType): string {
  const template = mtype.display || mtype.name;
  const fieldMap = new Map(mtype.fields.map(f => [f.key, f]));

  // Parse the template: split on {fieldKey} placeholders
  let html = '';
  let i = 0;
  while (i < template.length) {
    const open = template.indexOf('{', i);
    if (open === -1) {
      // Remaining chrome
      html += `<span class="prog-chrome">${escapeHtml(template.slice(i))}</span>`;
      break;
    }
    // Chrome before the field
    if (open > i) {
      html += `<span class="prog-chrome">${escapeHtml(template.slice(i, open))}</span>`;
    }
    const close = template.indexOf('}', open);
    if (close === -1) {
      html += `<span class="prog-chrome">${escapeHtml(template.slice(open))}</span>`;
      break;
    }
    const key = template.slice(open + 1, close);
    const field = fieldMap.get(key);
    if (field) {
      const value = inst.config[key] ?? '';
      if (field.type === 'select' && field.options) {
        const label = field.options.find(([v]) => v === value)?.[1] ?? value ?? '';
        html += `<select class="prog-field prog-field-select" data-instance-id="${inst.id}" data-field-key="${key}">`;
        html += `<option value="">--</option>`;
        for (const [v, l] of field.options) {
          html += `<option value="${v}"${value === v ? ' selected' : ''}>${escapeHtml(l)}</option>`;
        }
        html += `</select>`;
      } else if (field.type === 'toggle') {
        const checked = value === true || value === 'true';
        html += `<input type="checkbox" class="prog-field prog-field-toggle" data-instance-id="${inst.id}" data-field-key="${key}"${checked ? ' checked' : ''} />`;
      } else {
        const strVal = String(value || '');
        const size = Math.max(strVal.length, field.placeholder?.length || 3, 3);
        html += `<input type="text" class="prog-field prog-field-text" data-instance-id="${inst.id}" data-field-key="${key}" value="${escapeHtml(strVal)}" placeholder="${escapeHtml(field.placeholder || '')}" size="${size}" />`;
      }
    } else {
      html += `<span class="prog-chrome">{${escapeHtml(key)}}</span>`;
    }
    i = close + 1;
  }
  return html;
}

function renderProgramPanel(container: HTMLElement, lang: string): void {
  container.className = 'program-panel';
  container.setAttribute('tabindex', '0');
  refreshProgramPanel(container, lang);
  installKeyboardNav(container, lang);
}

function refreshProgramPanel(container: HTMLElement, lang: string): void {
  if (!currentConfig) return;
  const errors = validateProgram(currentConfig.program);
  const flat = flattenProgram(currentConfig.program);

  let html = '';
  for (const { inst, depth } of flat) {
    const mtype = MODULE_TYPE_MAP.get(inst.typeId);
    const name = mtype?.name ?? inst.typeId;
    const isSelected = selectedInstanceId === inst.id;
    const hasErr = instanceHasErrors(inst, errors);
    const hasChildren = inst.children.length > 0;
    const defaultCls = inst.isDefault ? ' default' : '';
    const selectedCls = isSelected ? ' selected' : '';
    const pad = 16 + depth * 20;

    html += `<div class="prog-line${defaultCls}${selectedCls}" data-instance-id="${inst.id}" style="padding-left:${pad}px">`;

    // Expand arrow for nodes with children
    if (hasChildren) {
      html += `<span class="prog-arrow" data-toggle-id="${inst.id}">${inst.expanded ? '▾' : '▸'}</span>`;
    } else {
      html += `<span class="prog-arrow"></span>`;
    }

    // The display line with inline fields
    if (mtype) {
      html += `<span class="prog-display">${renderDisplayLine(inst, mtype)}</span>`;
    } else {
      html += `<span class="prog-display"><span class="prog-chrome">${escapeHtml(name)}</span></span>`;
    }

    // Error indicator
    if (hasErr) html += `<span class="prog-error-dot"></span>`;

    html += `</div>`;
  }

  container.innerHTML = html;
  bindProgramHandlers(container, lang);
}

function bindProgramHandlers(container: HTMLElement, lang: string): void {
  // Click on a line → select it
  container.querySelectorAll('.prog-line').forEach(line => {
    line.addEventListener('click', (e) => {
      // Don't select when clicking inside an input field
      if ((e.target as HTMLElement).classList.contains('prog-field')) return;
      const id = (line as HTMLElement).dataset.instanceId;
      if (!id || !currentConfig) return;
      selectedInstanceId = id;
      refreshProgramPanel(container, lang);
      refreshErrorsPanel();
      container.focus();
    });
  });

  // Toggle arrows
  container.querySelectorAll('[data-toggle-id]').forEach(arrow => {
    arrow.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = (arrow as HTMLElement).dataset.toggleId!;
      if (!currentConfig) return;
      const inst = findInstance(currentConfig.program, id);
      if (inst) {
        inst.expanded = !inst.expanded;
        // Also select it
        selectedInstanceId = id;
        refreshProgramPanel(container, lang);
        refreshErrorsPanel();
        container.focus();
      }
    });
  });

  // Field changes
  container.querySelectorAll('.prog-field').forEach(el => {
    const instId = (el as HTMLElement).dataset.instanceId!;
    const key = (el as HTMLElement).dataset.fieldKey!;
    const handler = () => {
      if (!currentConfig) return;
      const inst = findInstance(currentConfig.program, instId);
      if (!inst) return;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        inst.config[key] = el.checked;
      } else if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        inst.config[key] = el.value.trim() || undefined;
        // Resize text inputs to fit content
        if (el instanceof HTMLInputElement && el.type === 'text') {
          el.size = Math.max(el.value.length, Number(el.placeholder?.length) || 3, 3);
        }
      }
      inst.isDefault = false;
      saveConfig(lang, currentConfig);
      refreshErrorsPanel();
    };
    el.addEventListener('change', handler);
    if (el instanceof HTMLInputElement && el.type === 'text') el.addEventListener('input', handler);
    // Prevent line selection when interacting with fields
    el.addEventListener('click', (e) => e.stopPropagation());
    el.addEventListener('keydown', (e) => e.stopPropagation());
  });
}

/** Arrow keys navigate between lines, Ctrl+Shift+Arrow moves selected line */
function installKeyboardNav(container: HTMLElement, lang: string): void {
  container.addEventListener('keydown', (e) => {
    if (!currentConfig) return;
    const flat = flattenProgram(currentConfig.program);
    const idx = flat.findIndex(f => f.inst.id === selectedInstanceId);

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const dir = e.key === 'ArrowUp' ? -1 : 1;

      if (e.ctrlKey && e.shiftKey && selectedInstanceId) {
        // Move the selected instance within its parent's children array
        e.preventDefault();
        const parent = findParentList(currentConfig.program, selectedInstanceId);
        if (!parent) return;
        const ci = parent.findIndex(c => c.id === selectedInstanceId);
        if (ci === -1) return;
        const newIdx = ci + dir;
        if (newIdx < 0 || newIdx >= parent.length) return;
        // Swap
        [parent[ci], parent[newIdx]] = [parent[newIdx], parent[ci]];
        saveConfig(lang, currentConfig);
        refreshProgramPanel(container, lang);
        refreshErrorsPanel();
        container.focus();
      } else {
        // Navigate
        e.preventDefault();
        const newIdx = idx + dir;
        if (newIdx >= 0 && newIdx < flat.length) {
          selectedInstanceId = flat[newIdx].inst.id;
          refreshProgramPanel(container, lang);
          refreshErrorsPanel();
          // Scroll into view
          const el = container.querySelector(`[data-instance-id="${selectedInstanceId}"]`);
          el?.scrollIntoView({ block: 'nearest' });
        }
      }
    }

    if (e.key === 'ArrowLeft' && selectedInstanceId) {
      // Collapse
      e.preventDefault();
      const inst = findInstance(currentConfig.program, selectedInstanceId);
      if (inst && inst.children.length > 0 && inst.expanded) {
        inst.expanded = false;
        refreshProgramPanel(container, lang);
      }
    }

    if (e.key === 'ArrowRight' && selectedInstanceId) {
      // Expand
      e.preventDefault();
      const inst = findInstance(currentConfig.program, selectedInstanceId);
      if (inst && inst.children.length > 0 && !inst.expanded) {
        inst.expanded = true;
        refreshProgramPanel(container, lang);
      }
    }
  });
}

/** Find the parent array (children list) containing an instance by id */
function findParentList(program: ModuleInstance[], targetId: string): ModuleInstance[] | null {
  for (const inst of program) {
    if (inst.id === targetId) return program;
    if (inst.children.length > 0) {
      const found = findParentList(inst.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

// ---- Errors panel (right) ----

let errorsPanelEl: HTMLElement | null = null;

function renderErrorsPanel(container: HTMLElement, lang: string): void {
  container.className = 'errors-panel';
  errorsPanelEl = container;
  refreshErrorsPanel();
}

function refreshErrorsPanel(): void {
  if (!errorsPanelEl || !currentConfig) return;
  const errors = validateProgram(currentConfig.program);

  let html = `<div class="errors-header"><span>Problems</span>`;
  if (errors.length > 0) {
    html += `<span class="errors-count has-errors">${errors.length}</span>`;
  } else {
    html += `<span class="errors-count no-errors">0</span>`;
  }
  html += `</div>`;

  if (errors.length === 0) {
    html += `<div class="no-errors-msg">No problems with the current program.</div>`;
  } else {
    for (const err of errors) {
      html += `<div class="error-entry" data-error-instance="${err.instanceId}">
        <span class="error-icon">&#9679;</span>
        <span class="error-msg">${escapeHtml(err.message)}</span>
      </div>`;
    }
  }

  errorsPanelEl.innerHTML = html;

  // Click on error → select the instance in the program
  errorsPanelEl.querySelectorAll('.error-entry').forEach(entry => {
    entry.addEventListener('click', () => {
      const id = (entry as HTMLElement).dataset.errorInstance;
      if (!id || !currentConfig) return;
      selectedInstanceId = id;
      // Expand parents if needed
      expandParents(currentConfig.program, id);
      // Refresh both panels
      if (ideLayoutInstance) {
        ideLayoutInstance.updatePanel('lang-program', (el) => renderProgramPanel(el, currentParams?.lang ?? ''));
      }
      refreshErrorsPanel();
    });
  });
}

function expandParents(program: ModuleInstance[], targetId: string): boolean {
  for (const inst of program) {
    if (inst.id === targetId) return true;
    if (inst.children.length > 0 && expandParents(inst.children, targetId)) {
      inst.expanded = true;
      return true;
    }
  }
  return false;
}

// ---- Page Lifecycle ----

export async function mount(el: HTMLElement, params: LangParams, navigate: (path: string) => void): Promise<void> {
  currentContainer = el;
  navigateFn = navigate;
  currentParams = params;

  injectRepoStyles();    // reuse Repository CSS (file-table, file-row, sidebar, etc.)
  injectIDEStyles();     // IDE layout styles
  injectLangStyles();    // language-creator-specific additions
  document.body.style.background = CRT_SCREEN_BG;

  if (params.lang) {
    await renderLanguageCreator(el, params);
  } else {
    await renderLanguageList(el);
  }
}

export async function update(params: LangParams): Promise<void> {
  const prevLang = currentParams?.lang;
  currentParams = params;

  if (!currentContainer) return;

  if (params.lang !== prevLang) {
    selectedInstanceId = null;
    currentConfig = null;
    if (ideLayoutInstance) { ideLayoutInstance.unmount(); ideLayoutInstance = null; }
  }

  if (params.lang) {
    await renderLanguageCreator(currentContainer, params);
  } else {
    await renderLanguageList(currentContainer);
  }
}

export function unmount(): void {
  if (ideLayoutInstance) { ideLayoutInstance.unmount(); ideLayoutInstance = null; }
  if (currentContainer) { currentContainer.innerHTML = ''; currentContainer = null; }
  navigateFn = null;
  currentParams = null;
  currentConfig = null;
  selectedInstanceId = null;
  errorsPanelEl = null;
}
