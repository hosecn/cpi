import * as path from "path";
import * as vscode from "vscode";
import matter from "gray-matter";
import type { ProblemMeta } from "./types";

export async function parseProblemMarkdown(uri: vscode.Uri, root: vscode.Uri): Promise<ProblemMeta | undefined> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  const text = Buffer.from(bytes).toString("utf8");
  if (!text.startsWith("---")) {
    return undefined;
  }

  const parsed = matter(text);
  const data = parsed.data as Record<string, unknown>;
  const url = asString(data.url);
  if (!url) {
    return undefined;
  }

  const stat = await vscode.workspace.fs.stat(uri);
  const title = asString(data.title) || path.basename(uri.fsPath, ".md");

  return {
    id: url,
    url,
    title,
    platform: asString(data.platform),
    contestId: asString(data.contest_id),
    problemId: asString(data.problem_id),
    contestName: asString(data.contest_name),
    tags: asStringArray(data.tags),
    rating: data.clist_rating as string | number | null | undefined,
    firstAcDate: asDateString(data.first_ac_date),
    mdPath: uri.fsPath,
    relativePath: path.relative(root.fsPath, uri.fsPath),
    updatedAt: new Date(stat.mtime).toISOString()
  };
}

export async function scanProblemset(root: vscode.Uri): Promise<ProblemMeta[]> {
  const pattern = new vscode.RelativePattern(root.fsPath, "**/*.md");
  const uris = await vscode.workspace.findFiles(pattern, "**/node_modules/**");
  const metas: ProblemMeta[] = [];

  for (const uri of uris) {
    const meta = await parseProblemMarkdown(uri, root);
    if (meta) {
      metas.push(meta);
    }
  }

  return metas;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function asDateString(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
