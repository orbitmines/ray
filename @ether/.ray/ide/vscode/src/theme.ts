import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';

/**
 * The theme channel — `ether/theme`. The server sends whatever the language's
 * active theme decides: `styles` maps a style name to how it renders (only
 * `color` today; any other decoration attribute can ride along without a
 * client change), `documents` carries each document's styled runs. The same
 * styles color the inline diagnostics (`error`, `warning`, …).
 */
export type ThemeStyle = Pick<vscode.DecorationRenderOptions, 'color' | 'backgroundColor' | 'fontStyle' | 'fontWeight' | 'textDecoration' | 'border' | 'outline' | 'opacity'>;
type Position = { line: number; character: number };
export interface ThemePayload {
  styles?: Record<string, ThemeStyle>;
  documents?: { uri: string; version?: number; ranges: { style: string; range: { start: Position; end: Position } }[] }[];
}

export class Theme implements vscode.Disposable {
  styles: Record<string, ThemeStyle> = {};
  private ranges = new Map<string, { style: string; range: vscode.Range }[]>();
  private types = new Map<string, { key: string; type: vscode.TextEditorDecorationType }>();
  private listeners = new Set<() => void>();

  onChange(listener: () => void): vscode.Disposable {
    this.listeners.add(listener);
    return new vscode.Disposable(() => this.listeners.delete(listener));
  }

  apply(payload: ThemePayload | null | undefined): void {
    if (!payload) return;
    if (payload.styles) {
      this.styles = payload.styles;
      for (const [name, entry] of [...this.types]) {
        if (JSON.stringify(this.styles[name] ?? null) === entry.key) continue;
        entry.type.dispose();
        this.types.delete(name);
      }
    }
    for (const document of payload.documents ?? []) {
      // ranges are offsets into the text the server read; if the buffer has moved
      // on, they would land on the wrong characters until the next payload
      const open = vscode.workspace.textDocuments.find(d => d.uri.toString() === document.uri);
      if (document.version !== undefined && open !== undefined && open.version !== document.version) continue;
      this.ranges.set(document.uri, document.ranges.map(({ style, range }) => ({
        style,
        range: new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character),
      })));
    }
    vscode.window.visibleTextEditors.forEach(editor => this.render(editor));
    this.listeners.forEach(listener => listener());
  }

  private type(name: string): vscode.TextEditorDecorationType | undefined {
    const style = this.styles[name];
    if (!style) return undefined;
    let entry = this.types.get(name);
    if (!entry) this.types.set(name, entry = { key: JSON.stringify(style), type: vscode.window.createTextEditorDecorationType(style) });
    return entry.type;
  }

  render(editor: vscode.TextEditor): void {
    const ranges = this.ranges.get(editor.document.uri.toString());
    if (!ranges) return;
    const buckets = new Map<string, vscode.Range[]>();
    for (const { style, range } of ranges) {
      let bucket = buckets.get(style);
      if (!bucket) buckets.set(style, bucket = []);
      bucket.push(range);
    }
    for (const name of new Set([...buckets.keys(), ...this.types.keys()])) {
      const type = this.type(name);
      if (type) editor.setDecorations(type, buckets.get(name) ?? []);
    }
  }

  dispose(): void {
    for (const { type } of this.types.values()) type.dispose();
    this.types.clear();
    this.listeners.clear();
  }
}

export function registerTheme(client: LanguageClient, theme: Theme): vscode.Disposable {
  const request = (editors: readonly vscode.TextEditor[]) => {
    const uris = editors.filter(editor => editor.document.languageId === 'ray').map(editor => editor.document.uri.toString());
    client.sendRequest<ThemePayload>('ether/theme', { uris }).then(payload => theme.apply(payload), () => undefined);
  };
  const subscriptions = [
    client.onNotification('ether/theme', (payload: ThemePayload) => theme.apply(payload)),
    vscode.window.onDidChangeVisibleTextEditors(editors => request(editors)),
  ];
  request(vscode.window.visibleTextEditors);
  return new vscode.Disposable(() => subscriptions.forEach(subscription => subscription.dispose()));
}
