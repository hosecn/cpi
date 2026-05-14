import * as path from "path";
import * as vscode from "vscode";
import type { CpiConfig, ProblemMeta, ReviewMode } from "./types";

export interface OpenedProblemFiles {
  mdPath: string;
  cppPath?: string;
}

export interface OpenProblemOptions {
  existingCppPath?: string;
  openOriginalUrl?: boolean;
}

export class EditorManager {
  private lastOpened: OpenedProblemFiles = { mdPath: "" };

  async openProblem(meta: ProblemMeta, mode: ReviewMode, config: CpiConfig, options: OpenProblemOptions = {}): Promise<OpenedProblemFiles> {
    if (config.strictTwoEditorTabs) {
      await this.closeLastOpened();
    }

    const opened: OpenedProblemFiles = { mdPath: meta.mdPath };
    const shouldOpenCpp = mode === "normal" && config.autoOpenCpp;
    const shouldOpenOriginalUrl = options.openOriginalUrl ?? config.openOriginalUrl;

    if (shouldOpenCpp) {
      opened.cppPath = options.existingCppPath ?? await this.createNextCpp(meta.mdPath, config.templateCppPath);
      const cppDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(opened.cppPath));
      await vscode.window.showTextDocument(cppDoc, { viewColumn: vscode.ViewColumn.One, preview: false });
    }

    await this.openMarkdown(meta.mdPath, mode, config);

    if (shouldOpenOriginalUrl) {
      await vscode.env.openExternal(vscode.Uri.parse(meta.url));
    }

    this.lastOpened = opened;
    return opened;
  }

  async openCpp(cppPath: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(cppPath));
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });
  }

  async openMarkdownPreview(mdPath: string): Promise<void> {
    await vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(mdPath), "vscode.markdown.preview.editor", {
      viewColumn: vscode.ViewColumn.Two,
      preview: false
    });
  }

  async openExternal(url: string): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  private async openMarkdown(mdPath: string, mode: ReviewMode, config: CpiConfig): Promise<void> {
    if (config.openMarkdownPreviewToSide) {
      const column = mode === "normal" && config.autoOpenCpp ? vscode.ViewColumn.Two : vscode.ViewColumn.One;
      await vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(mdPath), "vscode.markdown.preview.editor", {
        viewColumn: column,
        preview: false
      });
      return;
    }

    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(mdPath));
    const column = mode === "normal" && config.autoOpenCpp ? vscode.ViewColumn.Two : vscode.ViewColumn.One;
    await vscode.window.showTextDocument(doc, { viewColumn: column, preview: false });
  }

  private async createNextCpp(mdPath: string, templateCppPath: string): Promise<string> {
    const dir = path.dirname(mdPath);
    const files = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
    const maxIndex = files
      .map(([name]) => /^(\d{3})\.cpp$/.exec(name)?.[1])
      .filter((value): value is string => Boolean(value))
      .map((value) => Number.parseInt(value, 10))
      .reduce((max, value) => Math.max(max, value), 0);

    const cppPath = path.join(dir, `${String(maxIndex + 1).padStart(3, "0")}.cpp`);
    const template = await this.readTemplate(templateCppPath);
    await vscode.workspace.fs.writeFile(vscode.Uri.file(cppPath), Buffer.from(template, "utf8"));
    return cppPath;
  }

  private async readTemplate(templateCppPath: string): Promise<string> {
    if (!templateCppPath) {
      return "";
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(templateCppPath));
      return Buffer.from(bytes).toString("utf8");
    } catch {
      return "";
    }
  }

  private async closeLastOpened(): Promise<void> {
    const targets = new Set([this.lastOpened.mdPath, this.lastOpened.cppPath].filter(Boolean));
    if (targets.size === 0) {
      return;
    }

    const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
    const toClose = tabs.filter((tab) => {
      const uri = getTabUri(tab);
      return uri ? targets.has(uri.fsPath) : false;
    });

    if (toClose.length > 0) {
      await vscode.window.tabGroups.close(toClose, true);
    }
  }
}

function getTabUri(tab: vscode.Tab): vscode.Uri | undefined {
  const input = tab.input as { uri?: vscode.Uri; modified?: vscode.Uri; original?: vscode.Uri };
  return input.uri ?? input.modified ?? input.original;
}
