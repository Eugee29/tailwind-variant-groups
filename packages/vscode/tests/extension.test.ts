import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => {
  const output = {
    appendLine: vi.fn(),
    dispose: vi.fn(),
  };
  const providerRegistration = { dispose: vi.fn() };
  const watcherRegistrations = [
    { dispose: vi.fn() },
    { dispose: vi.fn() },
    { dispose: vi.fn() },
  ];
  const watcher = {
    onDidCreate: vi.fn(() => watcherRegistrations[0]),
    onDidChange: vi.fn(() => watcherRegistrations[1]),
    onDidDelete: vi.fn(() => watcherRegistrations[2]),
    dispose: vi.fn(),
  };
  return {
    output,
    providerRegistration,
    watcherRegistrations,
    watcher,
    createOutputChannel: vi.fn(() => output),
    registerHoverProvider: vi.fn(
      (_selector: unknown, _provider: unknown) => providerRegistration,
    ),
    createFileSystemWatcher: vi.fn(() => watcher),
    getConfiguration: vi.fn((section: string) => ({
      get: vi.fn((_key: string, fallback: unknown) =>
        section === "tailwindCSS" ? true : fallback,
      ),
    })),
  };
});

vi.mock("vscode", () => ({
  window: {
    createOutputChannel: host.createOutputChannel,
  },
  languages: {
    registerHoverProvider: host.registerHoverProvider,
  },
  workspace: {
    createFileSystemWatcher: host.createFileSystemWatcher,
    getConfiguration: host.getConfiguration,
  },
  MarkdownString: class MarkdownString {},
  Hover: class Hover {},
  Range: class Range {},
}));

import { activate } from "../src/extension.js";

describe("activate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers one four-language provider, output channel, and stylesheet watcher", () => {
    const context = { subscriptions: [] as { dispose(): unknown }[] };

    activate(context as never);

    expect(host.createOutputChannel).toHaveBeenCalledOnce();
    expect(host.registerHoverProvider).toHaveBeenCalledOnce();
    const selector = host.registerHoverProvider.mock.calls[0]![0] as {
      language: string;
    }[];
    expect(selector.map(({ language }) => language)).toEqual([
      "javascript",
      "javascriptreact",
      "typescript",
      "typescriptreact",
    ]);
    expect(host.createFileSystemWatcher).toHaveBeenCalledWith("**/*.css");
    expect(host.watcher.onDidCreate).toHaveBeenCalledOnce();
    expect(host.watcher.onDidChange).toHaveBeenCalledOnce();
    expect(host.watcher.onDidDelete).toHaveBeenCalledOnce();
    expect(context.subscriptions).toEqual(
      expect.arrayContaining([
        host.output,
        host.providerRegistration,
        host.watcher,
        ...host.watcherRegistrations,
      ]),
    );
    expect(host.output.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('"tailwindCSS.hovers": false'),
    );
  });
});
