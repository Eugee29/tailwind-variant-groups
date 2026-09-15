import * as vscode from "vscode";
import { createHoverProviderCore } from "./provider.js";
import { DEFAULT_HOVER_SETTINGS, type VariantGroupsHoverSettings } from "./settings.js";
import { createTailwindPreviewService } from "./tailwind-preview.js";

const LANGUAGE_IDS = [
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact",
] as const;

function stringArraySetting(
  configuration: vscode.WorkspaceConfiguration,
  key: string,
  fallback: readonly string[],
): readonly string[] {
  const value = configuration.get<unknown>(key);
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : fallback;
}

function readSettings(document: vscode.TextDocument): VariantGroupsHoverSettings {
  const configuration = vscode.workspace.getConfiguration(
    "tailwindVariantGroups",
    document.uri,
  );
  return {
    hovers: configuration.get("hovers", DEFAULT_HOVER_SETTINGS.hovers),
    stylesheet: configuration.get("stylesheet", DEFAULT_HOVER_SETTINGS.stylesheet),
    attributes: stringArraySetting(
      configuration,
      "attributes",
      DEFAULT_HOVER_SETTINGS.attributes,
    ),
    callees: stringArraySetting(
      configuration,
      "callees",
      DEFAULT_HOVER_SETTINGS.callees,
    ),
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Tailwind Variant Groups");
  const preview = createTailwindPreviewService();
  const core = createHoverProviderCore(preview);
  const loggedMessages = new Set<string>();

  function logOnce(message: string): void {
    if (loggedMessages.has(message)) return;
    loggedMessages.add(message);
    output.appendLine(message);
  }

  const nativeHovers = vscode.workspace
    .getConfiguration("tailwindCSS")
    .get<boolean>("hovers", true);
  if (nativeHovers !== false) {
    logOnce(
      'Tailwind CSS IntelliSense hover is still enabled. Set "tailwindCSS.hovers": false to prevent incorrect or duplicate previews inside variant groups.',
    );
  }

  const selector: vscode.DocumentSelector = LANGUAGE_IDS.map((language) => ({
    language,
    scheme: "file",
  }));
  const registration = vscode.languages.registerHoverProvider(selector, {
    async provideHover(document, position, token) {
      const settings = readSettings(document);
      if (settings.hovers && settings.stylesheet.trim().length === 0) {
        logOnce(
          'Configure "tailwindVariantGroups.stylesheet" with your Tailwind CSS entry stylesheet to enable hover previews.',
        );
        return undefined;
      }

      try {
        const result = await core.provideHover({
          uri: document.uri.toString(),
          filename: document.fileName,
          version: document.version,
          source: document.getText(),
          documentOffset: document.offsetAt(position),
          workspaceFolder: vscode.workspace.getWorkspaceFolder(document.uri)?.uri
            .fsPath,
          settings,
          isCancellationRequested: () => token.isCancellationRequested,
        });
        if (!result) return undefined;

        const markdown = new vscode.MarkdownString(result.markdown);
        markdown.isTrusted = false;
        return new vscode.Hover(
          markdown,
          new vscode.Range(
            document.positionAt(result.range.start),
            document.positionAt(result.range.end),
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logOnce(`Unable to generate Tailwind hover preview: ${message}`);
        return undefined;
      }
    },
  });

  const watcher = vscode.workspace.createFileSystemWatcher("**/*.css");
  const invalidate = (uri: vscode.Uri): void => preview.invalidate(uri.fsPath);
  const onCreate = watcher.onDidCreate(invalidate);
  const onChange = watcher.onDidChange(invalidate);
  const onDelete = watcher.onDidDelete(invalidate);

  context.subscriptions.push(
    output,
    registration,
    watcher,
    onCreate,
    onChange,
    onDelete,
  );
}

export function deactivate(): void {}
