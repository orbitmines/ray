import { ExtensionContext, workspace, window, Disposable } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
} from 'vscode-languageclient/node';
import { resolveBoot } from './boot';
import { applyLanguageConfiguration, requestLanguageConfiguration } from './language_configuration';

let client: LanguageClient | undefined;
let configDisposable: Disposable | undefined;

export async function activate(context: ExtensionContext) {
  console.log('[ether-debug] activate() called from', context.extensionPath);
  void window.showInformationMessage('[ether-debug] activate() called');
  let boot;
  try {
    boot = resolveBoot(context.extensionPath);
  } catch (e: any) {
    window.showErrorMessage(`Ether.ray: ${e?.message ?? e}`);
    return;
  }

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'ray' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.ray'),
    },
  };

  client = new LanguageClient(
    'ether-ray',
    'Ether.ray Language Server',
    boot.server,
    clientOptions,
  );

  try {
    await client.start();
  } catch (err: any) {
    window.showErrorMessage(`Ether.ray: failed to start language server (${boot.description}) — ${err?.message ?? err}`);
    return;
  }

  // Pull language configuration (comments, brackets, etc.) from the server
  // and apply it. The config is dynamic — driven by the Language definition
  // — so VS Code's static contributes.languages.configuration would be wrong
  // here. Re-fetch on workspace change in case the language picks up new defs.
  const refreshConfig = async () => {
    const cfg = await requestLanguageConfiguration(client!);
    if (configDisposable) configDisposable.dispose();
    configDisposable = cfg ? applyLanguageConfiguration('ray', cfg) : undefined;
  };
  await refreshConfig();
  context.subscriptions.push({ dispose: () => configDisposable?.dispose() });

  // Whole-workspace initial enumeration. `findFiles` uses VS Code's ripgrep-
  // backed walker, honors `files.exclude` / `search.exclude`, and is much
  // faster than walking the filesystem ourselves. The server reads each URI
  // from disk (skipping any open document, whose live text is delivered via
  // didOpen), then publishes a first round of diagnostics.
  void (async () => {
    const uris = (await workspace.findFiles('**/*.ray')).map(u => u.toString());
    if (!client) return;
    try { await client.sendRequest('ether/initialFiles', { uris }); }
    catch (err: any) {
      client.outputChannel.appendLine(
        `Ether.ray: ether/initialFiles failed — ${err?.message ?? err}`,
      );
    }
  })();

  client.outputChannel.appendLine(`Ether.ray: started — ${boot.description}`);
}

export function deactivate(): Thenable<void> | undefined {
  configDisposable?.dispose();
  if (!client) return undefined;
  return client.stop();
}
