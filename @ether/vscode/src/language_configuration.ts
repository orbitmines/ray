import {
  Disposable,
  LanguageConfiguration,
  languages,
} from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';

/**
 * Wire shape that lands from the LSP's `ether/languageConfiguration` request.
 * Mirrors `EditorLanguageConfiguration` from @orbitmines/ray. We keep the type
 * loose here so a server-side change doesn't strand a stale extension.
 */
export interface WireConfiguration {
  comments?: { lineComment?: string; blockComment?: [string, string] };
  brackets?: [string, string][];
  autoClosingPairs?: (
    | { open: string; close: string; notIn?: string[] }
    | [string, string]
  )[];
  surroundingPairs?: ([string, string] | { open: string; close: string })[];
  wordPattern?: { pattern: string; flags?: string };
  indentationRules?: {
    increaseIndentPattern?: { pattern: string; flags?: string };
    decreaseIndentPattern?: { pattern: string; flags?: string };
  };
}

/** Ask the server for its current language configuration. Tolerant of servers
 *  that don't implement the request — returns null. */
export async function requestLanguageConfiguration(
  client: LanguageClient,
): Promise<WireConfiguration | null> {
  try {
    const result = await client.sendRequest<WireConfiguration>('ether/languageConfiguration');
    return result ?? null;
  } catch {
    return null;
  }
}

const re = (r: { pattern: string; flags?: string }) => new RegExp(r.pattern, r.flags);

/** Convert wire form to VS Code's LanguageConfiguration. */
function toVsCode(wire: WireConfiguration): LanguageConfiguration {
  const out: LanguageConfiguration = {};
  if (wire.comments) out.comments = wire.comments;
  if (wire.brackets) out.brackets = wire.brackets;
  if (wire.autoClosingPairs) {
    out.autoClosingPairs = wire.autoClosingPairs.map(p =>
      Array.isArray(p) ? { open: p[0], close: p[1] } : p,
    );
  }
  if (wire.surroundingPairs) {
    out.surroundingPairs = wire.surroundingPairs.map(p =>
      Array.isArray(p) ? { open: p[0], close: p[1] } : p,
    );
  }
  if (wire.wordPattern) out.wordPattern = re(wire.wordPattern);
  if (wire.indentationRules) {
    out.indentationRules = {
      increaseIndentPattern: wire.indentationRules.increaseIndentPattern
        ? re(wire.indentationRules.increaseIndentPattern)
        : /(?!)/,
      decreaseIndentPattern: wire.indentationRules.decreaseIndentPattern
        ? re(wire.indentationRules.decreaseIndentPattern)
        : /(?!)/,
    };
  }
  return out;
}

/**
 * Apply a server-supplied configuration to the given language id and return a
 * Disposable to remove it. Empty configurations are still applied — that's how
 * we *clear* a previous one.
 */
export function applyLanguageConfiguration(
  languageId: string,
  wire: WireConfiguration,
): Disposable {
  return languages.setLanguageConfiguration(languageId, toVsCode(wire));
}
