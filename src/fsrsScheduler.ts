import { createEmptyCard, fsrs, Rating, type Card } from "ts-fsrs";
import type { ReviewRatingName, StoredFsrsCard } from "./types";

const scheduler = fsrs();

export function createStoredCard(now = new Date()): StoredFsrsCard {
  return cardToStored(createEmptyCard(now));
}

export function createLearnedStoredCard(now = new Date()): StoredFsrsCard {
  return scheduleNext(createStoredCard(now), now, "Easy");
}

export function scheduleNext(card: StoredFsrsCard, now: Date, ratingName: ReviewRatingName): StoredFsrsCard {
  const grade = ratingFromName(ratingName);
  const result = scheduler.next(storedToCard(card), now, grade);
  return cardToStored(result.card);
}

export function cardToStored(card: Card): StoredFsrsCard {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review?.toISOString()
  };
}

export function storedToCard(card: StoredFsrsCard): Card {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps ?? 0,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? new Date(card.last_review) : undefined
  };
}

export function ratingFromName(name: ReviewRatingName): Exclude<Rating, Rating.Manual> {
  switch (name) {
    case "Again":
      return Rating.Again;
    case "Hard":
      return Rating.Hard;
    case "Good":
      return Rating.Good;
    case "Easy":
      return Rating.Easy;
  }
}
