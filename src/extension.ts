import * as vscode from "vscode";
import { getConfig } from "./config";
import { EditorManager } from "./editorManager";
import { ProblemStore } from "./problemStore";
import { ReviewSession } from "./reviewSession";
import { ReviewPanel } from "./webview/ReviewPanel";

let store: ProblemStore | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  store = new ProblemStore();
  const editors = new EditorManager();
  const session = new ReviewSession(store, editors);
  const panel = new ReviewPanel(context.extensionUri, session, editors);

  context.subscriptions.push(store);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider("cpi.reviewView", panel, {
    webviewOptions: {
      retainContextWhenHidden: true
    }
  }));
  context.subscriptions.push(store.onDidChange(() => panel.refresh()));

  context.subscriptions.push(vscode.commands.registerCommand("cpi.refresh", async () => {
    await initializeStore(store!);
    panel.refresh("题库已刷新");
  }));

  context.subscriptions.push(vscode.commands.registerCommand("cpi.undoLastReview", async () => {
    await session.undoLastReview();
    panel.refresh("已撤销最近一次反馈");
  }));

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (event) => {
    if (event.affectsConfiguration("cpi.problemsetPath")) {
      await initializeStore(store!);
    }
    panel.refresh();
  }));

  await initializeStore(store);
}

export function deactivate(): void {
  store?.dispose();
}

async function initializeStore(problemStore: ProblemStore): Promise<void> {
  const config = getConfig();
  if (!config.problemsetPath) {
    vscode.window.showWarningMessage("CPI needs a workspace folder or cpi.problemsetPath.");
    return;
  }
  await problemStore.initialize(config.problemsetPath);
}
