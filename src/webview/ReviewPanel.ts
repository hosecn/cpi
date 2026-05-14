import * as vscode from "vscode";
import { getConfig, updateConfig } from "../config";
import type { EditorManager } from "../editorManager";
import type { ReviewSession } from "../reviewSession";
import type { PageName, ReviewMode, ReviewRatingName, WebviewState } from "../types";

export class ReviewPanel implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private page: PageName = "review";
  private selectedMode: ReviewMode = "normal";
  private modeChangedBeforeStart = false;
  private message?: string;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly session: ReviewSession,
    private readonly editors: EditorManager
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.onDidReceiveMessage((message) => void this.handleMessage(message));
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "src", "webview"),
        vscode.Uri.joinPath(this.extensionUri, "out", "webview")
      ]
    };
    view.webview.html = this.getHtml(view.webview);
    this.refresh();
  }

  refresh(message?: string): void {
    this.message = message;
    this.view?.webview.postMessage({ type: "state", state: this.getState() });
  }

  private getState(): WebviewState {
    const queue = this.session.getQueue();
    return {
      page: this.page,
      selectedMode: this.selectedMode,
      current: this.session.getCurrent(),
      queueCount: queue.length,
      totalCount: this.session.getStats().length,
      stats: this.session.getStats(),
      settings: getConfig(),
      message: this.message
    };
  }

  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    try {
      if (message.type === "switchPage") {
        this.page = message.page as PageName;
      } else if (message.type === "ready") {
        this.refresh();
        return;
      } else if (message.type === "setMode") {
        const nextMode = message.mode === "quick" ? "quick" : "normal";
        if (!this.session.getCurrent()) {
          this.modeChangedBeforeStart = true;
        }
        this.selectedMode = nextMode;
      } else if (message.type === "startNext") {
        const mode = message.mode === "quick" ? "quick" : "normal";
        this.selectedMode = mode;
        await this.session.startNext(mode, {
          openOriginalUrl: mode === "normal" && !this.modeChangedBeforeStart
        });
        this.modeChangedBeforeStart = false;
      } else if (message.type === "togglePause") {
        this.session.togglePause();
      } else if (message.type === "exitReview") {
        this.session.exitCurrent();
        this.modeChangedBeforeStart = false;
      } else if (message.type === "rate") {
        const mode = message.mode === "quick" ? "quick" : "normal";
        this.selectedMode = mode;
        await this.session.rateCurrent(message.rating as ReviewRatingName, mode);
      } else if (message.type === "undo") {
        await this.session.undoLastReview();
      } else if (message.type === "updateSetting") {
        await updateConfig(message.key as never, message.value);
      } else if (message.type === "openCpp" && typeof message.path === "string") {
        await this.editors.openCpp(message.path);
      } else if (message.type === "openMarkdown" && typeof message.path === "string") {
        await this.editors.openMarkdownPreview(message.path);
      } else if (message.type === "openUrl" && typeof message.url === "string") {
        await this.editors.openExternal(message.url);
      }
      this.refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.refresh(text);
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "out", "webview", "main.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "src", "webview", "style.css"));
    const nonce = String(Date.now());
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>CPI</title>
</head>
<body>
  <main id="app"></main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
