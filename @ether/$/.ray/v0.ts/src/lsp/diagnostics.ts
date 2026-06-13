import {
  Diagnostic as LspDiagnostic,
  DiagnosticSeverity,
  Range,
} from 'vscode-languageserver/node';
import type { Diagnostic } from '../diagnostics.ts';
import type { Text } from '../source.ts';

/** Map our six-level severity onto LSP's four. Trace/debug fold into Hint. */
const SEVERITY: Record<Diagnostic['level'], DiagnosticSeverity> = {
  fatal:   DiagnosticSeverity.Error,
  error:   DiagnosticSeverity.Error,
  warning: DiagnosticSeverity.Warning,
  info:    DiagnosticSeverity.Information,
  debug:   DiagnosticSeverity.Hint,
  trace:   DiagnosticSeverity.Hint,
};

/** Convert a 0-based char offset within `source` into an LSP Position. */
function positionAt(source: string, offset: number): { line: number; character: number } {
  if (offset < 0) offset = 0;
  if (offset > source.length) offset = source.length;
  let line = 0, character = 0;
  for (let i = 0; i < offset; i++) {
    if (source[i] === '\n') { line++; character = 0; } else character++;
  }
  return { line, character };
}

/** Compute an LSP Range from a Position's selection (preferred) or single cursor.
 *  selection is packed `[b0, e0, b1, e1, …]`. */
function nodeRange(node: Text.Node): Range {
  const src = node.source.value;
  const sel = node.selection;
  if (sel && sel.length > 0) {
    return {
      start: positionAt(src, sel[0]),
      end:   positionAt(src, sel[sel.length - 1] + 1),
    };
  }
  const cursor = node.cursor ?? 0;
  return {
    start: positionAt(src, cursor),
    end:   positionAt(src, cursor + 1),
  };
}

/**
 * Convert one of our Diagnostics into an LSP Diagnostic, *if* it lands on the
 * given URI's source. Trace/debug/info levels are dropped — LSP clients render
 * those poorly and they'd flood the editor.
 */
export function toLsp(diag: Diagnostic, uriFile: string | undefined): LspDiagnostic | null {
  if (diag.clock) return null;                   // timing samples
  if (diag.level === 'trace' || diag.level === 'debug') return null;

  // Prefer the diagnostic's own node; otherwise fall back to the top-of-stack
  // frame (errors fired on partial nodes carry no source themselves).
  const node = diag.node?.file
    ? diag.node
    : diag.diagnostics?.[diag.diagnostics.length - 1]?.node;
  if (!node?.file) return null;
  if (uriFile && node.file !== uriFile) return null;

  return {
    severity: SEVERITY[diag.level],
    range: nodeRange(node),
    source: 'ether',
    code: diag.phase,
    message: diag.message ?? diag.phase,
  };
}
