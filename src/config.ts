import * as path from "path";
import * as vscode from "vscode";
import type { CpiConfig } from "./types";

const section = "cpi";

export function getConfig(): CpiConfig {
  const config = vscode.workspace.getConfiguration(section);
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
  const configuredProblemset = config.get<string>("problemsetPath", "").trim();

  return {
    problemsetPath: configuredProblemset ? path.resolve(configuredProblemset) : workspaceRoot,
    autoOpenCpp: config.get<boolean>("autoOpenCpp", true),
    openMarkdownPreviewToSide: config.get<boolean>("openMarkdownPreviewToSide", true),
    templateCppPath: config.get<string>("templateCppPath", "").trim(),
    openOriginalUrl: config.get<boolean>("openOriginalUrl", false),
    autoAdvanceAfterRating: config.get<boolean>("autoAdvanceAfterRating", true),
    strictTwoEditorTabs: config.get<boolean>("strictTwoEditorTabs", true),
    reopenPreviousEditorsOnUndo: config.get<boolean>("reopenPreviousEditorsOnUndo", false)
  };
}

export async function updateConfig(key: keyof CpiConfig, value: unknown): Promise<void> {
  const storedKey = key === "problemsetPath" ? "problemsetPath" : key;
  await vscode.workspace.getConfiguration(section).update(storedKey, value, vscode.ConfigurationTarget.Global);
}
