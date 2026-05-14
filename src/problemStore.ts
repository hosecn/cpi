import * as path from "path";
import * as vscode from "vscode";
import { createLearnedStoredCard, createStoredCard } from "./fsrsScheduler";
import { parseProblemMarkdown, scanProblemset } from "./problemScanner";
import type { ProblemMeta, ProblemRecord, ProblemReviewState, ProblemsetContext, ProblemsetDb } from "./types";

export class ProblemStore {
  private context?: ProblemsetContext;
  private db?: ProblemsetDb;
  private metas = new Map<string, ProblemMeta>();
  private watcher?: vscode.FileSystemWatcher;
  private readonly emitter = new vscode.EventEmitter<void>();

  readonly onDidChange = this.emitter.event;

  async initialize(problemsetPath: string): Promise<void> {
    this.disposeWatcher();
    const root = vscode.Uri.file(problemsetPath);
    const dbUri = vscode.Uri.file(path.join(problemsetPath, "problemset.db.json"));
    this.context = { root, dbUri };
    this.db = await this.loadDb(dbUri);

    const metas = await scanProblemset(root);
    this.metas = new Map(metas.map((meta) => [meta.id, meta]));
    this.ensureStates(metas);
    await this.save();
    this.watch(root);
    this.emitter.fire();
  }

  get root(): vscode.Uri | undefined {
    return this.context?.root;
  }

  get dbSnapshot(): ProblemsetDb {
    if (!this.db) {
      throw new Error("CPI problem store is not initialized.");
    }
    return this.db;
  }

  getRecords(): ProblemRecord[] {
    if (!this.db) {
      return [];
    }
    return [...this.metas.values()]
      .map((meta) => ({ meta, state: this.db!.problems[meta.id] }))
      .filter((record): record is ProblemRecord => Boolean(record.state));
  }

  getRecord(problemId: string): ProblemRecord | undefined {
    const meta = this.metas.get(problemId);
    const state = this.db?.problems[problemId];
    return meta && state ? { meta, state } : undefined;
  }

  async updateState(problemId: string, state: ProblemReviewState): Promise<void> {
    if (!this.db) {
      return;
    }
    this.db.problems[problemId] = state;
    await this.save();
    this.emitter.fire();
  }

  async mutateDb(mutator: (db: ProblemsetDb) => void): Promise<void> {
    if (!this.db) {
      return;
    }
    mutator(this.db);
    await this.save();
    this.emitter.fire();
  }

  dispose(): void {
    this.disposeWatcher();
    this.emitter.dispose();
  }

  private async loadDb(dbUri: vscode.Uri): Promise<ProblemsetDb> {
    try {
      const bytes = await vscode.workspace.fs.readFile(dbUri);
      const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as ProblemsetDb;
      return {
        version: 1,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
        problems: parsed.problems,
        lastReview: parsed.lastReview
      };
    } catch {
      return createEmptyDb();
    }
  }

  private ensureStates(metas: ProblemMeta[]): void {
    if (!this.db) {
      return;
    }
    for (const meta of metas) {
      this.db.problems[meta.id] ??= createReviewState(meta);
    }
  }

  private async save(): Promise<void> {
    if (!this.context || !this.db) {
      return;
    }
    this.db.updatedAt = new Date().toISOString();
    const data = Buffer.from(`${JSON.stringify(this.db, null, 2)}\n`, "utf8");
    await vscode.workspace.fs.writeFile(this.context.dbUri, data);
  }

  private watch(root: vscode.Uri): void {
    const pattern = new vscode.RelativePattern(root.fsPath, "**/*.md");
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidCreate((uri) => void this.upsertMarkdown(uri));
    this.watcher.onDidChange((uri) => void this.upsertMarkdown(uri));
    this.watcher.onDidDelete((uri) => void this.removeMarkdown(uri));
  }

  private async upsertMarkdown(uri: vscode.Uri): Promise<void> {
    if (!this.context || !this.db) {
      return;
    }
    const meta = await parseProblemMarkdown(uri, this.context.root);
    if (!meta) {
      return;
    }
    for (const [id, existing] of this.metas) {
      if (existing.mdPath === uri.fsPath && id !== meta.id) {
        this.metas.delete(id);
      }
    }
    this.metas.set(meta.id, meta);
    this.db.problems[meta.id] ??= createReviewState(meta);
    await this.save();
    this.emitter.fire();
  }

  private async removeMarkdown(uri: vscode.Uri): Promise<void> {
    const removedPath = uri.fsPath;
    for (const [id, meta] of this.metas) {
      if (meta.mdPath === removedPath) {
        this.metas.delete(id);
        break;
      }
    }
    this.emitter.fire();
  }

  private disposeWatcher(): void {
    this.watcher?.dispose();
    this.watcher = undefined;
  }
}

function createEmptyDb(): ProblemsetDb {
  const now = new Date().toISOString();
  return { version: 1, createdAt: now, updatedAt: now, problems: {} };
}

function createReviewState(meta: ProblemMeta): ProblemReviewState {
  return {
    id: meta.id,
    fsrsCard: meta.firstAcDate ? createLearnedStoredCard(new Date(meta.firstAcDate)) : createStoredCard(),
    reviews: [],
    stats: {
      totalReviews: 0,
      normalReviews: 0,
      quickReviews: 0,
      totalDurationMs: 0
    }
  };
}
