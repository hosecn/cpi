import type { Uri } from "vscode";

export type ReviewMode = "normal" | "quick";
export type ReviewRatingName = "Again" | "Hard" | "Good" | "Easy";
export type PageName = "review" | "stats" | "settings";

export interface ProblemMeta {
  id: string;
  url: string;
  title: string;
  platform?: string;
  contestId?: string;
  problemId?: string;
  contestName?: string;
  tags: string[];
  rating?: string | number | null;
  firstAcDate?: string;
  mdPath: string;
  relativePath: string;
  updatedAt: string;
}

export interface StoredFsrsCard {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
}

export interface ReviewLogEntry {
  id: string;
  reviewedAt: string;
  mode: ReviewMode;
  rating: ReviewRatingName;
  durationMs: number;
  cppPath?: string;
  before: StoredFsrsCard;
  after: StoredFsrsCard;
}

export interface ProblemStats {
  totalReviews: number;
  normalReviews: number;
  quickReviews: number;
  totalDurationMs: number;
  lastDurationMs?: number;
  lastReviewedAt?: string;
}

export interface ProblemReviewState {
  id: string;
  fsrsCard: StoredFsrsCard;
  reviews: ReviewLogEntry[];
  stats: ProblemStats;
}

export interface UndoSnapshot {
  problemId: string;
  reviewId: string;
  previousState: ProblemReviewState;
  restoredEditor?: {
    mode: ReviewMode;
    mdPath: string;
    cppPath?: string;
    url: string;
  };
}

export interface ProblemsetDb {
  version: 1;
  createdAt: string;
  updatedAt: string;
  problems: Record<string, ProblemReviewState>;
  lastReview?: UndoSnapshot;
}

export interface ProblemRecord {
  meta: ProblemMeta;
  state: ProblemReviewState;
}

export interface StartedReview {
  problemId: string;
  mode: ReviewMode;
  startedAt: string;
  elapsedDurationMs: number;
  runningSince?: string;
  pausedAt?: string;
  cppPath?: string;
}

export interface CpiConfig {
  problemsetPath: string;
  autoOpenCpp: boolean;
  openMarkdownPreviewToSide: boolean;
  templateCppPath: string;
  openOriginalUrl: boolean;
  autoAdvanceAfterRating: boolean;
  strictTwoEditorTabs: boolean;
  reopenPreviousEditorsOnUndo: boolean;
}

export interface WebviewSettingsDto extends CpiConfig {}

export interface ReviewProblemDto {
  id: string;
  title: string;
  url: string;
  platform?: string;
  tags: string[];
  mdPath: string;
  cppPath?: string;
  due: string;
  state: number;
  reps: number;
  normalReviews: number;
  quickReviews: number;
}

export interface CurrentReviewDto extends ReviewProblemDto {
  mode: ReviewMode;
  activeDurationMs: number;
  isPaused: boolean;
}

export interface StatsProblemDto extends ReviewProblemDto {
  totalDurationMs: number;
  lastDurationMs?: number;
  lastReviewedAt?: string;
}

export interface WebviewState {
  page: PageName;
  selectedMode: ReviewMode;
  current?: CurrentReviewDto;
  queueCount: number;
  totalCount: number;
  stats: StatsProblemDto[];
  settings: WebviewSettingsDto;
  message?: string;
}

export interface ProblemsetContext {
  root: Uri;
  dbUri: Uri;
}
