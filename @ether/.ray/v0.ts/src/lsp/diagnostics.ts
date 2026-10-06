import {
  Diagnostic as LspDiagnostic,
  DiagnosticSeverity,
  Range,
} from 'vscode-languageserver/node.js';
import { env } from '../language/env.ts';
import type { Diagnostic } from '../language/diagnostics.ts';
import type { Text } from '../language/text.ts';

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

/** Compute an LSP Range from a Position's span (preferred) or single cursor. */
function nodeRange(node: Text.Node): Range {
  const src = node.source.value;
  if (!node.empty()) {
    return {
      start: positionAt(src, node.begin),
      end:   positionAt(src, node.end + 1),
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
  if (diag.level === 'trace' || diag.level === 'debug') return null;

  const node = diag.node;
  if (!node?.source?.location) return null;
  if (uriFile && node.source.location !== uriFile) return null;

  return {
    severity: SEVERITY[diag.level],
    range: nodeRange(node),
    source: 'ether',
    code: env.version.toString(),
    message: diag.message ?? '',
  };
}
