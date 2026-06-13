import * as vscode from 'vscode';

/**
 * Rich in-editor diagnostics — the "Error Lens" technique. VS Code can't draw
 * the terminal renderer's multi-line riser art above a line, but it can paint
 * the same information with colour: a tinted whole-line background, an
 * overview-ruler mark, and the message rendered after the line in the
 * severity's colour. This is a prototype to see the look; each editor would
 * get its own implementation, this one being VS Code specific.
 */

const LANGUAGE = 'ray';

// Per-severity palette, mirroring diagnostics.ts `levelColor` (red / yellow /
// blue), with a faint matching wash for the line background.
const PALETTE: Record<number, { fg: string; bg: string; glyph: string }> = {
  [vscode.DiagnosticSeverity.Error]:       { fg: '#f14c4c', bg: 'rgba(241,76,76,0.09)',  glyph: '✖' },
  [vscode.DiagnosticSeverity.Warning]:     { fg: '#cca700', bg: 'rgba(204,167,0,0.09)',  glyph: '⚠' },
  [vscode.DiagnosticSeverity.Information]: { fg: '#3794ff', bg: 'rgba(55,148,255,0.08)', glyph: 'ℹ' },
  [vscode.DiagnosticSeverity.Hint]:        { fg: '#9aa0a6', bg: 'rgba(154,160,166,0.07)', glyph: '·' },
};

const SEVERITIES = [
  vscode.DiagnosticSeverity.Error,
  vscode.DiagnosticSeverity.Warning,
  vscode.DiagnosticSeverity.Information,
  vscode.DiagnosticSeverity.Hint,
];

function decorationType(severity: number): vscode.TextEditorDecorationType {
  const { fg, bg } = PALETTE[severity];
  return vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: bg,
    overviewRulerColor: fg,
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    after: { color: fg, margin: '0 0 0 1.75em', fontStyle: 'italic' },
  });
}

/** Drive editor decorations off the published diagnostics. Returns a
 *  Disposable that tears the whole thing down. */
export function registerInlineDiagnostics(): vscode.Disposable {
  const types = new Map<number, vscode.TextEditorDecorationType>(
    SEVERITIES.map(s => [s, decorationType(s)]),
  );

  const update = (editor: vscode.TextEditor | undefined): void => {
    if (!editor || editor.document.languageId !== LANGUAGE) return;
    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);

    // One annotation per line — only the highest-severity diagnostic on it
    // shows (lower-severity ones on the same line are dropped), the way the
    // worst problem on a line is what you want to see first.
    const worst = new Map<number, vscode.Diagnostic>();
    for (const d of diagnostics) {
      const line = d.range.start.line;
      const had = worst.get(line);
      if (!had || d.severity < had.severity) worst.set(line, d);
    }

    const buckets = new Map<number, vscode.DecorationOptions[]>(SEVERITIES.map(s => [s, []]));
    for (const [line, d] of worst) {
      const { glyph } = PALETTE[d.severity];
      buckets.get(d.severity)!.push({
        range: editor.document.lineAt(line).range,
        renderOptions: { after: { contentText: `   ${glyph} ${d.message.split('\n')[0]}` } },
      });
    }

    for (const s of SEVERITIES) editor.setDecorations(types.get(s)!, buckets.get(s)!);
  };

  const updateAll = (): void => vscode.window.visibleTextEditors.forEach(update);
  updateAll();

  const subs = [
    vscode.languages.onDidChangeDiagnostics(e => {
      const dirty = new Set(e.uris.map(u => u.toString()));
      vscode.window.visibleTextEditors.forEach(ed => {
        if (dirty.has(ed.document.uri.toString())) update(ed);
      });
    }),
    vscode.window.onDidChangeVisibleTextEditors(() => updateAll()),
    vscode.window.onDidChangeActiveTextEditor(update),
  ];

  return new vscode.Disposable(() => {
    for (const s of subs) s.dispose();
    for (const t of types.values()) t.dispose();
  });
}
