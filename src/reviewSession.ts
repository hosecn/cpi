import * as crypto from "crypto";
import { scheduleNext } from "./fsrsScheduler";
import { getConfig } from "./config";
import type { EditorManager } from "./editorManager";
import type { ProblemStore } from "./problemStore";
import type {
  ProblemRecord,
  ReviewLogEntry,
  ReviewMode,
  ReviewRatingName,
  StartedReview,
  StatsProblemDto,
  ReviewProblemDto,
  CurrentReviewDto
} from "./types";

interface StartProblemOptions {
  existingCppPath?: string;
  openOriginalUrl?: boolean;
}

export class ReviewSession {
  private current?: StartedReview;

  constructor(
    private readonly store: ProblemStore,
    private readonly editors: EditorManager
  ) {}

  getCurrent(): CurrentReviewDto | undefined {
    if (!this.current) {
      return undefined;
    }
    const record = this.store.getRecord(this.current.problemId);
    return record ? toCurrentReviewDto(record, this.current, this.currentDurationMs()) : undefined;
  }

  getQueue(): ProblemRecord[] {
    const now = Date.now();
    return this.store.getRecords()
      .filter((record) => Date.parse(record.state.fsrsCard.due) <= now)
      .sort((a, b) => Date.parse(a.state.fsrsCard.due) - Date.parse(b.state.fsrsCard.due)
        || a.meta.title.localeCompare(b.meta.title));
  }

  getStats(): StatsProblemDto[] {
    return this.store.getRecords()
      .sort((a, b) => Date.parse(a.state.fsrsCard.due) - Date.parse(b.state.fsrsCard.due))
      .map((record) => ({
        ...toReviewDto(record),
        totalDurationMs: record.state.stats.totalDurationMs,
        lastDurationMs: record.state.stats.lastDurationMs,
        lastReviewedAt: record.state.stats.lastReviewedAt
      }));
  }

  async startNext(mode: ReviewMode, options: StartProblemOptions = {}): Promise<void> {
    const record = this.nextDueRecord();
    if (!record) {
      this.current = undefined;
      return;
    }
    await this.startProblem(record.meta.id, mode, options);
  }

  async startProblem(problemId: string, mode: ReviewMode, options: StartProblemOptions = {}): Promise<void> {
    const record = this.store.getRecord(problemId);
    if (!record) {
      return;
    }
    const opened = await this.editors.openProblem(record.meta, mode, getConfig(), options);
    const now = new Date().toISOString();
    this.current = {
      problemId,
      mode,
      startedAt: now,
      elapsedDurationMs: 0,
      runningSince: now,
      cppPath: opened.cppPath
    };
  }

  togglePause(): void {
    if (!this.current) {
      return;
    }
    const now = new Date();
    if (this.current.runningSince) {
      this.current.elapsedDurationMs = this.currentDurationMs(now);
      this.current.runningSince = undefined;
      this.current.pausedAt = now.toISOString();
      return;
    }
    this.current.runningSince = now.toISOString();
    this.current.pausedAt = undefined;
  }

  exitCurrent(): void {
    this.current = undefined;
  }

  async rateCurrent(rating: ReviewRatingName, modeOverride?: ReviewMode): Promise<void> {
    if (!this.current) {
      return;
    }
    const record = this.store.getRecord(this.current.problemId);
    if (!record) {
      return;
    }

    const now = new Date();
    const durationMs = this.currentDurationMs(now);
    const before = record.state.fsrsCard;
    const after = scheduleNext(before, now, rating);
    const recordedMode = modeOverride ?? this.current.mode;
    const log: ReviewLogEntry = {
      id: crypto.randomUUID(),
      reviewedAt: now.toISOString(),
      mode: recordedMode,
      rating,
      durationMs,
      cppPath: this.current.cppPath,
      before,
      after
    };
    const previousState = structuredClone(record.state);
    const nextState = structuredClone(record.state);
    nextState.fsrsCard = after;
    nextState.reviews.push(log);
    nextState.stats.totalReviews += 1;
    nextState.stats.normalReviews += recordedMode === "normal" ? 1 : 0;
    nextState.stats.quickReviews += recordedMode === "quick" ? 1 : 0;
    nextState.stats.totalDurationMs += durationMs;
    nextState.stats.lastDurationMs = durationMs;
    nextState.stats.lastReviewedAt = log.reviewedAt;

    const restoredEditor = {
      mode: recordedMode,
      mdPath: record.meta.mdPath,
      cppPath: this.current.cppPath,
      url: record.meta.url
    };

    await this.store.mutateDb((db) => {
      db.problems[record.meta.id] = nextState;
      db.lastReview = { problemId: record.meta.id, reviewId: log.id, previousState, restoredEditor };
    });

    this.current = undefined;
    if (getConfig().autoAdvanceAfterRating) {
      await this.startNext(recordedMode, { openOriginalUrl: recordedMode === "normal" });
    }
  }

  async undoLastReview(): Promise<void> {
    const snapshot = this.store.dbSnapshot.lastReview;
    if (!snapshot) {
      return;
    }
    await this.store.mutateDb((db) => {
      db.problems[snapshot.problemId] = snapshot.previousState;
      delete db.lastReview;
    });

    const config = getConfig();
    if (config.reopenPreviousEditorsOnUndo && snapshot.restoredEditor) {
      await this.startProblem(snapshot.problemId, snapshot.restoredEditor.mode, {
        existingCppPath: snapshot.restoredEditor.cppPath,
        openOriginalUrl: false
      });
      return;
    }

    const now = new Date().toISOString();
    this.current = {
      problemId: snapshot.problemId,
      mode: snapshot.restoredEditor?.mode ?? "normal",
      startedAt: now,
      elapsedDurationMs: 0,
      runningSince: now,
      cppPath: snapshot.restoredEditor?.cppPath
    };
  }

  private nextDueRecord(): ProblemRecord | undefined {
    return this.getQueue()[0];
  }

  private currentDurationMs(now = new Date()): number {
    if (!this.current) {
      return 0;
    }
    const runningMs = this.current.runningSince
      ? Math.max(0, now.getTime() - Date.parse(this.current.runningSince))
      : 0;
    return Math.max(0, this.current.elapsedDurationMs + runningMs);
  }
}

function toReviewDto(record: ProblemRecord, cppPath?: string): ReviewProblemDto {
  return {
    id: record.meta.id,
    title: record.meta.title,
    url: record.meta.url,
    platform: record.meta.platform,
    tags: record.meta.tags,
    mdPath: record.meta.mdPath,
    cppPath,
    due: record.state.fsrsCard.due,
    state: record.state.fsrsCard.state,
    reps: record.state.fsrsCard.reps,
    normalReviews: record.state.stats.normalReviews,
    quickReviews: record.state.stats.quickReviews
  };
}

function toCurrentReviewDto(record: ProblemRecord, current: StartedReview, activeDurationMs: number): CurrentReviewDto {
  return {
    ...toReviewDto(record, current.cppPath),
    mode: current.mode,
    activeDurationMs,
    isPaused: !current.runningSince
  };
}
