// ============================================================
// IDELayout.ts — Vanilla TypeScript IDE layout engine
// Ported from React IDELayout.tsx to vanilla DOM.
// ============================================================

import { PHOSPHOR, CRT_SCREEN_BG } from './CRTShell.ts';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SplitNode {
  type: 'split';
  id: string;
  direction: 'horizontal' | 'vertical';
  children: LayoutNode[];
  sizes: number[];
}

export interface TabGroupNode {
  type: 'tabgroup';
  id: string;
  panels: string[];
  activeIndex: number;
}

export type LayoutNode = SplitNode | TabGroupNode;

export interface PanelDefinition {
  id: string;
  title: string;
  icon?: string;        // SVG string for tab icon
  closable: boolean;
  sticky?: boolean;     // if true, the containing tabgroup becomes sticky (viewport-pinned with own scroll)
  render: (container: HTMLElement) => (() => void) | void;  // returns cleanup
}

export type DropZoneType = 'tab' | 'left' | 'right' | 'top' | 'bottom';

interface DropZone {
  targetId: string;
  type: DropZoneType;
  insertIndex?: number;
}

interface DragState {
  panelId: string;
  sourceGroupId: string;
}

interface CollapseRecord {
  panels: string[];
  removedGroupId: string;
  originalSize: number;
  originalIndex: number;
  parentSplitId: string;
  targetGroupId: string;
  insertPosition: 'before' | 'after';
  originalActiveIndex: number;
  collapsedAtDim: number;
  direction: 'horizontal' | 'vertical';
}

const MIN_COLLAPSE_HORIZONTAL_PX = 120;
const MIN_COLLAPSE_VERTICAL_PX = 120;
const RESTORE_HYSTERESIS = 60;
const HANDLE_SIZE = 4;

// ─── ID Generation ───────────────────────────────────────────────────────────

let _idCounter = 0;
export function generateId(): string {
  return `ide-${++_idCounter}`;
}

/** Ensure counter is at least `min` (call after restoring saved layout IDs). */
export function ensureIdCounter(min: number): void {
  if (_idCounter < min) _idCounter = min;
}

// ─── Tree Utilities ──────────────────────────────────────────────────────────

export function findNode(root: LayoutNode, id: string): LayoutNode | null {
  if (root.id === id) return root;
  if (root.type === 'split') {
    for (const child of root.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return null;
}

export function findParent(
  root: LayoutNode,
  id: string
): { parent: SplitNode; index: number } | null {
  if (root.type === 'split') {
    for (let i = 0; i < root.children.length; i++) {
      if (root.children[i].id === id) {
        return { parent: root, index: i };
      }
      const found = findParent(root.children[i], id);
      if (found) return found;
    }
  }
  return null;
}

export function replaceNode(
  root: LayoutNode,
  targetId: string,
  replacement: LayoutNode
): LayoutNode {
  if (root.id === targetId) return replacement;
  if (root.type === 'split') {
    return {
      ...root,
      children: root.children.map((child) =>
        replaceNode(child, targetId, replacement)
      ),
    };
  }
  return root;
}

export function removePanelFromNode(
  root: LayoutNode,
  groupId: string,
  panelId: string
): LayoutNode {
  if (root.type === 'tabgroup' && root.id === groupId) {
    const newPanels = root.panels.filter((p) => p !== panelId);
    const newActive = Math.min(root.activeIndex, Math.max(0, newPanels.length - 1));
    return { ...root, panels: newPanels, activeIndex: newActive };
  }
  if (root.type === 'split') {
    return {
      ...root,
      children: root.children.map((child) =>
        removePanelFromNode(child, groupId, panelId)
      ),
    };
  }
  return root;
}

export function normalizeTree(node: LayoutNode): LayoutNode | null {
  if (node.type === 'tabgroup') {
    return node.panels.length === 0 ? null : node;
  }

  const normalizedChildren: LayoutNode[] = [];
  const normalizedSizes: number[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const result = normalizeTree(node.children[i]);
    if (result) {
      normalizedChildren.push(result);
      normalizedSizes.push(node.sizes[i]);
    }
  }

  if (normalizedChildren.length === 0) return null;
  if (normalizedChildren.length === 1) return normalizedChildren[0];

  const sizeSum = normalizedSizes.reduce((a, b) => a + b, 0);
  const correctedSizes = normalizedSizes.map((s) => s / sizeSum);

  // Flatten same-direction nested splits
  const flatChildren: LayoutNode[] = [];
  const flatSizes: number[] = [];
  for (let i = 0; i < normalizedChildren.length; i++) {
    const child = normalizedChildren[i];
    if (child.type === 'split' && child.direction === node.direction) {
      for (let j = 0; j < child.children.length; j++) {
        flatChildren.push(child.children[j]);
        flatSizes.push(correctedSizes[i] * child.sizes[j]);
      }
    } else {
      flatChildren.push(child);
      flatSizes.push(correctedSizes[i]);
    }
  }

  return {
    ...node,
    children: flatChildren,
    sizes: flatSizes,
  };
}

export function findPanelInLayout(
  root: LayoutNode,
  panelId: string
): { groupId: string; index: number } | null {
  if (root.type === 'tabgroup') {
    const idx = root.panels.indexOf(panelId);
    if (idx !== -1) return { groupId: root.id, index: idx };
    return null;
  }
  if (root.type === 'split') {
    for (const child of root.children) {
      const found = findPanelInLayout(child, panelId);
      if (found) return found;
    }
  }
  return null;
}

// ─── Responsive Collapse Helpers ─────────────────────────────────────────────

function findEdgeTabGroup(
  node: LayoutNode,
  side: 'left' | 'right'
): TabGroupNode | null {
  if (node.type === 'tabgroup') return node;
  if (node.type === 'split') {
    if (node.children.length === 0) return null;
    const idx = side === 'left' ? 0 : node.children.length - 1;
    return findEdgeTabGroup(node.children[idx], side);
  }
  return null;
}

function findSmallestBelowThreshold(
  node: LayoutNode,
  availWidth: number,
  availHeight: number
): { childNode: LayoutNode; parentSplit: SplitNode; childIndex: number } | null {
  if (node.type !== 'split') return null;

  const isHoriz = node.direction === 'horizontal';
  const dim = isHoriz ? availWidth : availHeight;
  const threshold = isHoriz ? MIN_COLLAPSE_HORIZONTAL_PX : MIN_COLLAPSE_VERTICAL_PX;
  const handleSpace = (node.children.length - 1) * HANDLE_SIZE;
  const contentSpace = dim - handleSpace;

  // Recurse into children first (collapse deepest levels first)
  for (let i = 0; i < node.children.length; i++) {
    const childDim = contentSpace * node.sizes[i];
    const childW = isHoriz ? childDim : availWidth;
    const childH = isHoriz ? availHeight : childDim;
    const deeper = findSmallestBelowThreshold(node.children[i], childW, childH);
    if (deeper) return deeper;
  }

  // Check this level
  if (node.children.length <= 1) return null;

  let smallestIndex = -1;
  let smallestPx = Infinity;

  for (let i = 0; i < node.children.length; i++) {
    const childPx = contentSpace * node.sizes[i];
    if (
      node.children[i].type === 'tabgroup' &&
      childPx < threshold &&
      childPx <= smallestPx
    ) {
      smallestPx = childPx;
      smallestIndex = i;
    }
  }

  if (smallestIndex !== -1) {
    return {
      childNode: node.children[smallestIndex],
      parentSplit: node,
      childIndex: smallestIndex,
    };
  }

  return null;
}

function performSingleCollapse(
  tree: LayoutNode,
  target: { childNode: LayoutNode; parentSplit: SplitNode; childIndex: number },
  containerWidth: number,
  containerHeight: number
): { tree: LayoutNode; record: CollapseRecord } | null {
  const { childNode, parentSplit, childIndex } = target;
  if (childNode.type !== 'tabgroup') return null;
  if (parentSplit.children.length <= 1) return null;

  let largestIndex = -1;
  let largestSize = -1;
  for (let i = 0; i < parentSplit.children.length; i++) {
    if (i === childIndex) continue;
    if (parentSplit.sizes[i] > largestSize) {
      largestSize = parentSplit.sizes[i];
      largestIndex = i;
    }
  }
  if (largestIndex === -1) return null;

  const isFromLeft = childIndex < largestIndex;
  const targetTabGroup = findEdgeTabGroup(
    parentSplit.children[largestIndex],
    isFromLeft ? 'left' : 'right'
  );
  if (!targetTabGroup) return null;

  const currentTarget = findNode(tree, targetTabGroup.id) as TabGroupNode;
  if (!currentTarget || currentTarget.type !== 'tabgroup') return null;

  const newPanels = isFromLeft
    ? [...childNode.panels, ...currentTarget.panels]
    : [...currentTarget.panels, ...childNode.panels];

  const newActiveIndex = isFromLeft
    ? childNode.panels.length + currentTarget.activeIndex
    : currentTarget.activeIndex;

  let newTree = replaceNode(tree, targetTabGroup.id, {
    ...currentTarget,
    panels: newPanels,
    activeIndex: newActiveIndex,
  });

  const currentParent = findNode(newTree, parentSplit.id) as SplitNode;
  if (!currentParent || currentParent.type !== 'split') return null;

  const newChildren = currentParent.children.filter((_, i) => i !== childIndex);
  const newSizes = currentParent.sizes.filter((_, i) => i !== childIndex);
  const sizeSum = newSizes.reduce((a, b) => a + b, 0);
  const normalizedSizes = newSizes.map((s) => s / sizeSum);

  newTree = replaceNode(newTree, parentSplit.id, {
    ...currentParent,
    children: newChildren,
    sizes: normalizedSizes,
  });

  const dim =
    parentSplit.direction === 'horizontal' ? containerWidth : containerHeight;

  const record: CollapseRecord = {
    panels: childNode.panels,
    removedGroupId: childNode.id,
    originalSize: parentSplit.sizes[childIndex],
    originalIndex: childIndex,
    parentSplitId: parentSplit.id,
    targetGroupId: targetTabGroup.id,
    insertPosition: isFromLeft ? 'before' : 'after',
    originalActiveIndex: childNode.activeIndex,
    collapsedAtDim: dim,
    direction: parentSplit.direction,
  };

  return { tree: newTree, record };
}

function tryRestoreRecord(
  tree: LayoutNode,
  record: CollapseRecord
): LayoutNode | null {
  const parentSplit = findNode(tree, record.parentSplitId);
  if (!parentSplit || parentSplit.type !== 'split') return null;

  const targetGroup = findNode(tree, record.targetGroupId);
  if (!targetGroup || targetGroup.type !== 'tabgroup') return null;

  const panelCount = Math.min(record.panels.length, targetGroup.panels.length - 1);
  if (panelCount <= 0) return null;

  let panelsToRestore: string[];
  let remainingPanels: string[];

  if (record.insertPosition === 'before') {
    panelsToRestore = targetGroup.panels.slice(0, panelCount);
    remainingPanels = targetGroup.panels.slice(panelCount);
  } else {
    panelsToRestore = targetGroup.panels.slice(-panelCount);
    remainingPanels = targetGroup.panels.slice(0, -panelCount);
  }

  if (remainingPanels.length === 0) return null;

  const activePanel = targetGroup.panels[targetGroup.activeIndex];
  let newTargetActive: number;
  if (panelsToRestore.includes(activePanel)) {
    newTargetActive = 0;
  } else {
    newTargetActive = remainingPanels.indexOf(activePanel);
    if (newTargetActive < 0) newTargetActive = 0;
  }

  let newTree = replaceNode(tree, targetGroup.id, {
    ...targetGroup,
    panels: remainingPanels,
    activeIndex: newTargetActive,
  });

  const restoredGroup: TabGroupNode = {
    type: 'tabgroup',
    id: record.removedGroupId,
    panels: panelsToRestore,
    activeIndex: Math.min(record.originalActiveIndex, panelsToRestore.length - 1),
  };

  const currentParent = findNode(newTree, record.parentSplitId) as SplitNode;
  if (!currentParent || currentParent.type !== 'split') return null;

  const newChildren = [...currentParent.children];
  const newSizes = [...currentParent.sizes];

  const scaleFactor = 1 - record.originalSize;
  for (let i = 0; i < newSizes.length; i++) {
    newSizes[i] *= scaleFactor;
  }

  const insertIdx = Math.min(record.originalIndex, newChildren.length);
  newChildren.splice(insertIdx, 0, restoredGroup);
  newSizes.splice(insertIdx, 0, record.originalSize);

  newTree = replaceNode(newTree, record.parentSplitId, {
    ...currentParent,
    children: newChildren,
    sizes: newSizes,
  });

  return newTree;
}

// ─── CSS Injection ───────────────────────────────────────────────────────────

let ideStyleEl: HTMLStyleElement | null = null;

export function injectIDEStyles(): void {
  if (ideStyleEl) return;
  ideStyleEl = document.createElement('style');
  ideStyleEl.textContent = `
    .ide-layout {
      width: 100%;
      min-height: 100%;
      position: relative;
    }

    /* Split containers */
    .ide-split {
      display: flex;
      width: 100%;
      min-height: 100%;
    }
    .ide-split--horizontal { flex-direction: row; }
    .ide-split--vertical { flex-direction: column; }

    .ide-split__child {
      min-width: 0;
      min-height: 0;
    }

    /* Resize handles */
    .ide-resize-handle {
      flex: 0 0 ${HANDLE_SIZE}px;
      position: relative;
      z-index: 10;
      background: rgba(255,255,255,0.06);
      transition: background-color 0.15s ease;
    }
    .ide-resize-handle--horizontal {
      cursor: col-resize;
      width: ${HANDLE_SIZE}px;
    }
    .ide-resize-handle--horizontal::before {
      content: '';
      position: absolute;
      top: 0; bottom: 0;
      left: -4px; right: -4px;
    }
    .ide-resize-handle--vertical {
      cursor: row-resize;
      height: ${HANDLE_SIZE}px;
    }
    .ide-resize-handle--vertical::before {
      content: '';
      position: absolute;
      left: 0; right: 0;
      top: -4px; bottom: -4px;
    }
    .ide-resize-handle:hover,
    .ide-resize-handle--active {
      background: ${PHOSPHOR};
    }

    /* Tab groups */
    .ide-tabgroup {
      display: flex;
      flex-direction: column;
      width: 100%;
      min-height: 100%;
      position: relative;
    }
    /* Sticky tabgroup: viewport-pinned.
       min-height reset so the element is shorter than its stretched
       flex parent — sticky needs room to travel. No overflow here
       (overflow on the element itself would create a scroll container
       and kill position:sticky relative to the page). */
    .ide-tabgroup--sticky {
      position: sticky;
      top: 0;
      min-height: 0;
      height: 100%;
      max-height: 100vh;
    }
    /* Scroll lives on the panel content inside a sticky tabgroup */
    .ide-tabgroup--sticky > .ide-panel-content {
      overflow-y: auto;
      min-height: 0;
    }
    .ide-tabgroup--sticky > .ide-panel-content::-webkit-scrollbar { width: 2px; }
    .ide-tabgroup--sticky > .ide-panel-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }

    .ide-tabbar {
      display: flex;
      flex: 0 0 auto;
      background: ${CRT_SCREEN_BG};
      border-bottom: 1px solid rgba(255,255,255,0.08);
      overflow-x: auto;
      overflow-y: hidden;
      min-height: 32px;
      position: sticky;
      top: 0;
      z-index: 5;
    }
    .ide-tabbar::-webkit-scrollbar { height: 2px; }
    .ide-tabbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }

    .ide-tab {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      font-size: 12px;
      line-height: 1;
      color: rgba(255,255,255,0.4);
      background: ${CRT_SCREEN_BG};
      border-right: 1px solid rgba(255,255,255,0.06);
      transition: background-color 0.1s ease, color 0.1s ease;
      font-family: 'Courier New', Courier, monospace;
    }
    .ide-tab:hover {
      background: rgba(255,255,255,0.04);
      color: rgba(255,255,255,0.7);
    }
    .ide-tab--active {
      color: ${PHOSPHOR};
      background: rgba(255,255,255,0.04);
      border-bottom-color: ${PHOSPHOR};
    }
    .ide-tab--dragging { opacity: 0.5; }

    .ide-tab__icon {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ide-tab__icon svg {
      width: 14px;
      height: 14px;
    }
    .ide-tab__title { flex: 1 1 auto; }
    .ide-tab__close {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 3px;
      opacity: 0;
      transition: opacity 0.1s ease, background-color 0.1s ease;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
    }
    .ide-tab__close:hover { background: rgba(255,255,255,0.15); }
    .ide-tab:hover .ide-tab__close,
    .ide-tab--active .ide-tab__close { opacity: 1; }

    /* Panel content — no overflow constraints so content flows into page scroll */
    .ide-panel-content {
      flex: 1 1 auto;
      background: transparent;
    }
    /* Non-last vertical children: fixed vh height, overflow:clip (NOT auto/hidden).
       clip constrains visually but does NOT create a scroll container,
       so .ide-tabbar position:sticky still works relative to page scroll.
       Scrolling happens inside .ide-panel-content (sibling of tab bar). */
    .ide-split__child--v-constrained { overflow: clip; }
    /* Inner elements must fill the constrained height exactly */
    .ide-split__child--v-constrained > .ide-split { min-height: 0; height: 100%; }
    .ide-split__child--v-constrained .ide-tabgroup { min-height: 0; height: 100%; }
    .ide-split__child--v-constrained .ide-panel-content {
      overflow-y: auto;
      min-height: 0;
    }
    .ide-split__child--v-constrained .ide-panel-content::-webkit-scrollbar { width: 2px; }
    .ide-split__child--v-constrained .ide-panel-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }

    /* Tab insertion indicator */
    .ide-tab-insert-indicator {
      flex: 0 0 2px;
      align-self: stretch;
      background: ${PHOSPHOR};
    }

    /* Drop indicator overlay */
    .ide-drop-indicator {
      position: absolute;
      pointer-events: none;
      z-index: 100;
      background: rgba(255,255,255,0.06);
      border: 2px solid rgba(255,255,255,0.25);
      transition: all 0.1s ease;
    }
  `;
  document.head.appendChild(ideStyleEl);
}

// ─── DOM Rendering Engine ────────────────────────────────────────────────────

interface LayoutState {
  layout: LayoutNode;
  panelRegistry: Map<string, PanelDefinition>;
  dragState: DragState | null;
  dropZone: DropZone | null;
  panelCleanups: Map<string, () => void>;
  panelElements: Map<string, HTMLElement>;  // panel content containers keyed by panelId
  nodeElements: Map<string, HTMLElement>;   // layout node containers keyed by nodeId
}

function createDropIndicator(type: DropZoneType): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ide-drop-indicator';
  el.dataset.dropType = type;
  // Position will be set by positionDropIndicators() after mount
  el.style.display = 'none';
  return el;
}

/** Reposition drop indicators to cover only the visible portion of their container */
function positionDropIndicators(root: HTMLElement): void {
  root.querySelectorAll('.ide-drop-indicator').forEach(indicator => {
    const el = indicator as HTMLElement;
    const type = el.dataset.dropType as DropZoneType;
    const parent = el.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const vpH = window.innerHeight;
    // Visible portion of the container within the viewport
    const visTop = Math.max(0, rect.top);
    const visBot = Math.min(vpH, rect.bottom);
    const visH = Math.max(0, visBot - visTop);
    // Convert to parent-relative coordinates
    const offsetTop = visTop - rect.top;

    el.style.display = '';
    switch (type) {
      case 'tab':
        Object.assign(el.style, { top: `${offsetTop}px`, left: '0', right: '0', height: `${visH}px` });
        break;
      case 'left':
        Object.assign(el.style, { top: `${offsetTop}px`, left: '0', height: `${visH}px`, width: '50%' });
        break;
      case 'right':
        Object.assign(el.style, { top: `${offsetTop}px`, right: '0', height: `${visH}px`, width: '50%' });
        break;
      case 'top':
        Object.assign(el.style, { top: `${offsetTop}px`, left: '0', right: '0', height: `${visH / 2}px` });
        break;
      case 'bottom':
        Object.assign(el.style, { top: `${offsetTop + visH / 2}px`, left: '0', right: '0', height: `${visH / 2}px` });
        break;
    }
  });
}

function renderTabBar(
  node: TabGroupNode,
  state: LayoutState,
  tabBarEl: HTMLElement,
  ctx: LayoutContext
): void {
  tabBarEl.innerHTML = '';

  const showInsert =
    state.dropZone &&
    state.dropZone.targetId === node.id &&
    state.dropZone.type === 'tab' &&
    state.dropZone.insertIndex !== undefined;
  const insertAt = state.dropZone?.insertIndex ?? -1;

  let nonDragIdx = 0;

  for (let i = 0; i < node.panels.length; i++) {
    const panelId = node.panels[i];
    const isDragging = state.dragState?.panelId === panelId;

    if (!isDragging) {
      if (showInsert && insertAt === nonDragIdx) {
        const indicator = document.createElement('div');
        indicator.className = 'ide-tab-insert-indicator';
        tabBarEl.appendChild(indicator);
      }
      nonDragIdx++;
    }

    const panel = state.panelRegistry.get(panelId);
    if (!panel) continue;

    const tab = document.createElement('div');
    tab.className = 'ide-tab';
    if (i === node.activeIndex) tab.className += ' ide-tab--active';
    if (isDragging) tab.className += ' ide-tab--dragging';
    tab.draggable = true;
    tab.dataset.panelId = panelId;
    tab.dataset.groupId = node.id;

    if (panel.icon) {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'ide-tab__icon';
      iconSpan.innerHTML = panel.icon;
      tab.appendChild(iconSpan);
    }

    const titleSpan = document.createElement('span');
    titleSpan.className = 'ide-tab__title';
    titleSpan.textContent = panel.title;
    tab.appendChild(titleSpan);

    if (panel.closable) {
      const closeSpan = document.createElement('span');
      closeSpan.className = 'ide-tab__close';
      closeSpan.textContent = '\u00d7';
      closeSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        ctx.closePanel(node.id, panelId);
      });
      tab.appendChild(closeSpan);
    }

    // Tab click
    tab.addEventListener('click', () => {
      ctx.setActiveTab(node.id, i);
    });

    // Drag start
    tab.addEventListener('dragstart', (e) => {
      e.dataTransfer!.setData('text/plain', panelId);
      e.dataTransfer!.effectAllowed = 'move';
      setTimeout(() => {
        ctx.setDragState({ panelId, sourceGroupId: node.id });
      }, 0);
    });

    // Drag end
    tab.addEventListener('dragend', () => {
      ctx.setDragState(null);
      ctx.setDropZone(null);
    });

    tabBarEl.appendChild(tab);
  }

  // Indicator at end
  if (showInsert && insertAt === nonDragIdx) {
    const indicator = document.createElement('div');
    indicator.className = 'ide-tab-insert-indicator';
    tabBarEl.appendChild(indicator);
  }
}

function computeTabInsertIndex(tabBarEl: HTMLElement, clientX: number, draggedPanelId: string | null): number {
  const tabs = tabBarEl.querySelectorAll('.ide-tab:not(.ide-tab--dragging)');
  for (let i = 0; i < tabs.length; i++) {
    const rect = tabs[i].getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    if (clientX < midX) return i;
  }
  return tabs.length;
}

function detectDropZone(
  containerEl: HTMLElement,
  tabBarEl: HTMLElement,
  e: DragEvent,
  draggedPanelId: string | null
): { type: DropZoneType; insertIndex?: number } | null {
  const tabBarRect = tabBarEl.getBoundingClientRect();
  if (e.clientY < tabBarRect.bottom) {
    return { type: 'tab', insertIndex: computeTabInsertIndex(tabBarEl, e.clientX, draggedPanelId) };
  }

  const rect = containerEl.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  // Use visible portion of container for y-axis detection (tall panels)
  const vpH = window.innerHeight;
  const visTop = Math.max(rect.top, 0);
  const visBot = Math.min(rect.bottom, vpH);
  const visH = visBot - visTop;
  const y = visH > 0 ? (e.clientY - visTop) / visH : 0.5;
  const threshold = 0.25;

  if (x < threshold) return { type: 'left' };
  if (x > 1 - threshold) return { type: 'right' };
  if (y < threshold) return { type: 'top' };
  if (y > 1 - threshold) return { type: 'bottom' };
  return { type: 'tab', insertIndex: computeTabInsertIndex(tabBarEl, e.clientX, draggedPanelId) };
}

function renderTabGroupNode(
  node: TabGroupNode,
  state: LayoutState,
  ctx: LayoutContext
): HTMLElement {
  const container = document.createElement('div');
  // Only sticky when the *active* panel is sticky — when a non-sticky panel
  // (e.g. a file viewer) is active in the same group (after responsive collapse),
  // let its content flow into the page scroll.
  const activePanel = node.panels[node.activeIndex];
  const isSticky = !!activePanel && !!(state.panelRegistry.get(activePanel)?.sticky);
  container.className = isSticky ? 'ide-tabgroup ide-tabgroup--sticky' : 'ide-tabgroup';
  container.dataset.groupId = node.id;

  const tabBar = document.createElement('div');
  tabBar.className = 'ide-tabbar';
  container.appendChild(tabBar);

  renderTabBar(node, state, tabBar, ctx);

  // Panel content areas
  for (let i = 0; i < node.panels.length; i++) {
    const panelId = node.panels[i];
    const panel = state.panelRegistry.get(panelId);
    if (!panel) continue;

    let contentEl = state.panelElements.get(panelId);
    if (!contentEl) {
      contentEl = document.createElement('div');
      contentEl.className = 'ide-panel-content';
      contentEl.dataset.panelId = panelId;
      state.panelElements.set(panelId, contentEl);
      // First mount — call render
      const cleanup = panel.render(contentEl);
      if (cleanup) state.panelCleanups.set(panelId, cleanup);
    }

    contentEl.style.display = i === node.activeIndex ? '' : 'none';
    container.appendChild(contentEl);
  }

  // Drop indicator
  const isDropTarget = state.dropZone && state.dropZone.targetId === node.id;
  if (isDropTarget && state.dropZone!.type !== 'tab') {
    container.appendChild(createDropIndicator(state.dropZone!.type));
  }

  // Drag-and-drop event handlers on the container
  container.addEventListener('dragover', (e) => {
    if (!state.dragState) return;
    if (state.dragState.sourceGroupId === node.id && node.panels.length === 1) return;

    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';

    const zone = detectDropZone(container, tabBar, e, state.dragState.panelId);
    if (zone) {
      ctx.setDropZone({
        targetId: node.id,
        type: zone.type,
        insertIndex: zone.insertIndex,
      });
    }
  });

  container.addEventListener('dragleave', (e) => {
    if (container && !container.contains(e.relatedTarget as Node)) {
      ctx.setDropZone(null);
    }
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!state.dragState || !state.dropZone || state.dropZone.targetId !== node.id) {
      ctx.setDropZone(null);
      return;
    }

    const { panelId, sourceGroupId } = state.dragState;

    if (state.dropZone.type === 'tab') {
      ctx.movePanelToTabGroup(panelId, sourceGroupId, node.id, state.dropZone.insertIndex);
    } else {
      ctx.splitAndPlace(panelId, sourceGroupId, node.id, state.dropZone.type as 'left' | 'right' | 'top' | 'bottom');
    }

    ctx.setDropZone(null);
    ctx.setDragState(null);
  });

  state.nodeElements.set(node.id, container);
  return container;
}

function renderSplitNode(
  node: SplitNode,
  state: LayoutState,
  ctx: LayoutContext
): HTMLElement {
  const container = document.createElement('div');
  container.className = `ide-split ide-split--${node.direction}`;

  for (let i = 0; i < node.children.length; i++) {
    if (i > 0) {
      const handle = document.createElement('div');
      handle.className = `ide-resize-handle ide-resize-handle--${node.direction}`;
      setupResizeHandle(handle, node, i - 1, state, ctx);
      container.appendChild(handle);
    }

    const childEl = document.createElement('div');
    childEl.className = 'ide-split__child';
    const size = node.sizes[i];
    const handleCount = node.children.length - 1;
    if (node.direction === 'vertical') {
      const totalHandlePx = handleCount * HANDLE_SIZE;
      if (i < node.children.length - 1) {
        // Non-last: fixed vh height with own scroll container.
        // Tab bars inside stick within this scroll context.
        // Works for nested horizontal splits too (constrains everything inside).
        childEl.classList.add('ide-split__child--v-constrained');
        childEl.style.height = `calc(${(size * 100).toFixed(4)}vh - ${(size * totalHandlePx).toFixed(2)}px)`;
        childEl.style.flex = '0 0 auto';
      } else {
        // Last child: flows into page scroll
        childEl.style.flex = '0 0 auto';
      }
    } else {
      const sizeExpr = `calc(${size * 100}% - ${(handleCount * HANDLE_SIZE) / node.children.length}px)`;
      childEl.style.flex = `0 0 ${sizeExpr}`;
    }

    const childContent = renderLayoutNode(node.children[i], state, ctx);
    childEl.appendChild(childContent);
    container.appendChild(childEl);
  }

  state.nodeElements.set(node.id, container);
  return container;
}

function renderLayoutNode(
  node: LayoutNode,
  state: LayoutState,
  ctx: LayoutContext
): HTMLElement {
  if (node.type === 'split') {
    return renderSplitNode(node, state, ctx);
  } else {
    return renderTabGroupNode(node, state, ctx);
  }
}

// ─── Resize Handle Logic ─────────────────────────────────────────────────────

function setupResizeHandle(
  handle: HTMLElement,
  node: SplitNode,
  index: number,
  state: LayoutState,
  ctx: LayoutContext
): void {
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    handle.classList.add('ide-resize-handle--active');

    const direction = node.direction;
    const startPos = direction === 'horizontal' ? e.clientX : e.clientY;

    const containerEl = handle.parentElement;
    if (!containerEl) return;
    const containerRect = containerEl.getBoundingClientRect();
    // For vertical splits, use viewport height as reference (children are vh-based)
    const containerSize = direction === 'horizontal' ? containerRect.width : window.innerHeight;

    // Snapshot sizes at mousedown
    const currentNode = findNode(state.layout, node.id) as SplitNode | null;
    if (!currentNode || currentNode.type !== 'split') return;
    const startSizes = [...currentNode.sizes];

    const onMouseMove = (moveEvent: MouseEvent) => {
      const currentPos =
        direction === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
      const deltaPx = currentPos - startPos;
      const numHandles = startSizes.length - 1;
      const availableSize = containerSize - numHandles * HANDLE_SIZE;
      const deltaFraction = deltaPx / availableSize;

      const newSizes = [...startSizes];
      let newLeft = newSizes[index] + deltaFraction;
      let newRight = newSizes[index + 1] - deltaFraction;

      const minSize = ctx.minPanelSize;
      if (newLeft < minSize) {
        const diff = minSize - newLeft;
        newLeft = minSize;
        newRight -= diff;
      }
      if (newRight < minSize) {
        const diff = minSize - newRight;
        newRight = minSize;
        newLeft -= diff;
      }

      newSizes[index] = newLeft;
      newSizes[index + 1] = newRight;

      ctx.updateSizes(node.id, newSizes);
    };

    const onMouseUp = () => {
      handle.classList.remove('ide-resize-handle--active');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      ctx.notifyLayoutChange();
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor =
      direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  });
}

// ─── Layout Context (internal callbacks) ─────────────────────────────────────

interface LayoutContext {
  setActiveTab: (groupId: string, index: number) => void;
  setDragState: (state: DragState | null) => void;
  setDropZone: (zone: DropZone | null) => void;
  movePanelToTabGroup: (panelId: string, sourceGroupId: string, targetGroupId: string, insertIndex?: number) => void;
  splitAndPlace: (panelId: string, sourceGroupId: string, targetGroupId: string, edge: 'left' | 'right' | 'top' | 'bottom') => void;
  closePanel: (groupId: string, panelId: string) => void;
  updateSizes: (splitId: string, sizes: number[]) => void;
  notifyLayoutChange: () => void;
  minPanelSize: number;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface IDELayoutAPI {
  unmount(): void;
  getLayout(): LayoutNode;
  openPanel(panel: PanelDefinition): void;
  updatePanel(panelId: string, renderFn: (container: HTMLElement) => (() => void) | void): void;
}

export function createIDELayout(container: HTMLElement, options: {
  panels: PanelDefinition[];
  initialLayout: LayoutNode;
  minPanelSize?: number;
  onNavigate?: (path: string) => void;
  onActiveTabChange?: (panelId: string) => void;
  onLayoutChange?: (layout: LayoutNode) => void;
}): IDELayoutAPI {
  injectIDEStyles();

  const minPanelSize = options.minPanelSize ?? 0.05;

  // State
  const state: LayoutState = {
    layout: options.initialLayout,
    panelRegistry: new Map<string, PanelDefinition>(),
    dragState: null,
    dropZone: null,
    panelCleanups: new Map<string, () => void>(),
    panelElements: new Map<string, HTMLElement>(),
    nodeElements: new Map<string, HTMLElement>(),
  };

  for (const panel of options.panels) {
    state.panelRegistry.set(panel.id, panel);
  }

  const collapseStack: CollapseRecord[] = [];
  let collapseGrace = false;
  let destroyed = false;

  // ── Re-render ──

  function rerender(): void {
    if (destroyed) return;
    // Clean up old node elements (panel elements are preserved)
    state.nodeElements.clear();
    container.innerHTML = '';
    const root = renderLayoutNode(state.layout, state, ctx);
    container.appendChild(root);
    // Position drop indicators now that elements are in the DOM
    requestAnimationFrame(() => positionDropIndicators(container));
  }

  function notifyLayoutChange(): void {
    if (options.onLayoutChange) options.onLayoutChange(state.layout);
  }

  // ── Context callbacks ──

  const ctx: LayoutContext = {
    minPanelSize,

    setActiveTab(groupId: string, index: number) {
      const node = findNode(state.layout, groupId);
      if (!node || node.type !== 'tabgroup') return;
      state.layout = replaceNode(state.layout, groupId, {
        ...node,
        activeIndex: index,
      });
      if (options.onActiveTabChange && node.panels[index]) {
        options.onActiveTabChange(node.panels[index]);
      }
      rerender();
    },

    setDragState(ds: DragState | null) {
      state.dragState = ds;
      rerender();
    },

    setDropZone(dz: DropZone | null) {
      const prev = state.dropZone;
      // Skip re-render if nothing changed
      if (prev === dz) return;
      if (prev && dz &&
        prev.targetId === dz.targetId &&
        prev.type === dz.type &&
        prev.insertIndex === dz.insertIndex) return;
      state.dropZone = dz;
      rerender();
    },

    movePanelToTabGroup(
      panelId: string,
      sourceGroupId: string,
      targetGroupId: string,
      insertIndex?: number
    ) {
      if (sourceGroupId === targetGroupId) {
        // Same-group reorder
        const group = findNode(state.layout, sourceGroupId);
        if (!group || group.type !== 'tabgroup') return;
        const newPanels = group.panels.filter((p) => p !== panelId);
        const idx = insertIndex !== undefined
          ? Math.min(insertIndex, newPanels.length)
          : newPanels.length;
        newPanels.splice(idx, 0, panelId);
        state.layout = replaceNode(state.layout, sourceGroupId, {
          ...group,
          panels: newPanels,
          activeIndex: idx,
        });
      } else {
        // Cross-group move
        collapseStack.length = 0;
        let tree = removePanelFromNode(state.layout, sourceGroupId, panelId);
        const target = findNode(tree, targetGroupId);
        if (!target || target.type !== 'tabgroup') return;
        const newPanels = [...target.panels];
        const idx = insertIndex !== undefined
          ? Math.min(insertIndex, newPanels.length)
          : newPanels.length;
        newPanels.splice(idx, 0, panelId);
        tree = replaceNode(tree, targetGroupId, {
          ...target,
          panels: newPanels,
          activeIndex: idx,
        });
        state.layout = normalizeTree(tree) || tree;
      }
      notifyLayoutChange();
      rerender();
    },

    splitAndPlace(
      panelId: string,
      sourceGroupId: string,
      targetGroupId: string,
      edge: 'left' | 'right' | 'top' | 'bottom'
    ) {
      collapseStack.length = 0;
      let tree = removePanelFromNode(state.layout, sourceGroupId, panelId);

      const newGroup: TabGroupNode = {
        type: 'tabgroup',
        id: generateId(),
        panels: [panelId],
        activeIndex: 0,
      };

      const target = findNode(tree, targetGroupId);
      if (!target) return;

      const direction: 'horizontal' | 'vertical' =
        edge === 'left' || edge === 'right' ? 'horizontal' : 'vertical';
      const newFirst = edge === 'left' || edge === 'top';

      const parentInfo = findParent(tree, targetGroupId);
      if (parentInfo && parentInfo.parent.direction === direction) {
        const { parent, index: targetIndex } = parentInfo;
        const newChildren = [...parent.children];
        const newSizes = [...parent.sizes];
        const targetSize = newSizes[targetIndex];
        const insertIdx = newFirst ? targetIndex : targetIndex + 1;
        newChildren.splice(insertIdx, 0, newGroup);
        newSizes[targetIndex] = targetSize / 2;
        newSizes.splice(insertIdx, 0, targetSize / 2);
        tree = replaceNode(tree, parent.id, {
          ...parent,
          children: newChildren,
          sizes: newSizes,
        });
      } else {
        const newSplit: SplitNode = {
          type: 'split',
          id: generateId(),
          direction,
          children: newFirst ? [newGroup, target] : [target, newGroup],
          sizes: [0.5, 0.5],
        };
        tree = replaceNode(tree, targetGroupId, newSplit);
      }

      state.layout = normalizeTree(tree) || tree;
      notifyLayoutChange();
      rerender();
    },

    closePanel(groupId: string, panelId: string) {
      collapseStack.length = 0;

      // Clean up panel
      const cleanup = state.panelCleanups.get(panelId);
      if (cleanup) { cleanup(); state.panelCleanups.delete(panelId); }
      state.panelElements.delete(panelId);

      const tree = removePanelFromNode(state.layout, groupId, panelId);
      state.layout = normalizeTree(tree) || tree;
      notifyLayoutChange();
      rerender();
    },

    updateSizes(splitId: string, sizes: number[]) {
      const node = findNode(state.layout, splitId);
      if (!node || node.type !== 'split') return;
      state.layout = replaceNode(state.layout, splitId, {
        ...node,
        sizes,
      });
      // Update DOM directly for sizes (avoid full rerender during drag)
      const splitEl = state.nodeElements.get(splitId);
      if (splitEl) {
        const children = splitEl.querySelectorAll(':scope > .ide-split__child');
        const handleCount = sizes.length - 1;
        const isVertical = node.direction === 'vertical';
        children.forEach((child, i) => {
          if (i < sizes.length) {
            const el = child as HTMLElement;
            if (isVertical) {
              const totalHandlePx = handleCount * HANDLE_SIZE;
              if (i < sizes.length - 1) {
                el.classList.add('ide-split__child--v-constrained');
                el.style.height = `calc(${(sizes[i] * 100).toFixed(4)}vh - ${(sizes[i] * totalHandlePx).toFixed(2)}px)`;
                el.style.flex = '0 0 auto';
              } else {
                el.classList.remove('ide-split__child--v-constrained');
                el.style.height = '';
                el.style.flex = '0 0 auto';
              }
            } else {
              const sizeExpr = `calc(${sizes[i] * 100}% - ${(handleCount * HANDLE_SIZE) / sizes.length}px)`;
              el.style.flex = `0 0 ${sizeExpr}`;
            }
          }
        });
      }
    },

    notifyLayoutChange,
  };

  // ── Responsive Collapse / Restore (ResizeObserver) ──

  let rafId: number;
  let prevWidth = 0;
  let prevHeight = 0;

  function handleResize(width: number, height: number): void {
    let tree = state.layout;
    let changed = false;

    // Phase 1: Restore
    let didRestore = false;
    let didChange = true;
    while (didChange && collapseStack.length > 0) {
      didChange = false;
      const record = collapseStack[collapseStack.length - 1];
      const dim = record.direction === 'horizontal' ? width : height;
      if (dim >= record.collapsedAtDim + RESTORE_HYSTERESIS) {
        const result = tryRestoreRecord(tree, record);
        if (result) {
          tree = result;
          collapseStack.pop();
          didChange = true;
          didRestore = true;
          changed = true;
        } else {
          collapseStack.pop();
          didChange = true;
        }
      }
    }

    // Phase 2: Collapse
    const skipCollapse = didRestore || collapseGrace;
    collapseGrace = didRestore;
    if (!skipCollapse) {
      let collapsed = true;
      while (collapsed) {
        collapsed = false;
        const target = findSmallestBelowThreshold(tree, width, height);
        if (target && target.parentSplit.children.length > 1) {
          const result = performSingleCollapse(tree, target, width, height);
          if (result) {
            tree = result.tree;
            if (!collapseStack.some(r => r.removedGroupId === result.record.removedGroupId)) {
              collapseStack.push(result.record);
            }
            collapsed = true;
            changed = true;
          }
        }
      }
    }

    if (changed) {
      state.layout = tree;
      notifyLayoutChange();
      rerender();
    }
  }

  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    const { width, height } = entry.contentRect;
    if (Math.abs(width - prevWidth) < 1 && Math.abs(height - prevHeight) < 1) return;
    prevWidth = width;
    prevHeight = height;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      handleResize(width, height);
    });
  });

  observer.observe(container);

  // ── Initial render ──
  rerender();

  // ── API ──

  return {
    unmount() {
      destroyed = true;
      observer.disconnect();
      cancelAnimationFrame(rafId);
      // Clean up all panels
      for (const [, cleanup] of state.panelCleanups) cleanup();
      state.panelCleanups.clear();
      state.panelElements.clear();
      state.nodeElements.clear();
      container.innerHTML = '';
    },

    getLayout() {
      return state.layout;
    },

    openPanel(panel: PanelDefinition) {
      state.panelRegistry.set(panel.id, panel);

      // Check if already in layout
      const existing = findPanelInLayout(state.layout, panel.id);
      if (existing) {
        // Just activate it
        ctx.setActiveTab(existing.groupId, existing.index);
        return;
      }

      // Find widest tab group via DOM measurement
      const tabGroupEls = container.querySelectorAll('.ide-tabgroup[data-group-id]');
      let widestId = '';
      let widestWidth = 0;
      tabGroupEls.forEach(el => {
        const groupId = el.getAttribute('data-group-id');
        if (!groupId) return;
        const width = el.getBoundingClientRect().width;
        if (width > widestWidth) {
          widestWidth = width;
          widestId = groupId;
        }
      });

      if (!widestId) return;

      const group = findNode(state.layout, widestId);
      if (!group || group.type !== 'tabgroup') return;

      // Insert left of the currently active tab
      const newPanels = [...group.panels];
      const insertIdx = group.activeIndex;
      newPanels.splice(insertIdx, 0, panel.id);

      state.layout = replaceNode(state.layout, widestId, {
        ...group,
        panels: newPanels,
        activeIndex: insertIdx,
      });
      if (options.onActiveTabChange) options.onActiveTabChange(panel.id);
      notifyLayoutChange();
      rerender();
    },

    updatePanel(panelId: string, renderFn: (container: HTMLElement) => (() => void) | void) {
      // Clean up old
      const oldCleanup = state.panelCleanups.get(panelId);
      if (oldCleanup) { oldCleanup(); state.panelCleanups.delete(panelId); }

      const el = state.panelElements.get(panelId);
      if (el) {
        el.innerHTML = '';
        const cleanup = renderFn(el);
        if (cleanup) state.panelCleanups.set(panelId, cleanup);
      }
    },
  };
}
