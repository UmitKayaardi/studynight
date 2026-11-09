import type { QuestionContent } from '../../shared/question';
import type { SourceRef, SourceKind } from '../lib/ingest/types';
import type { CardState } from '../lib/learning/fsrs';
import type { DayKey, StreakState } from '../lib/learning/streak';
import type { LifetimeStats } from '../lib/learning/badges';

export type DeckStatus = 'processing' | 'ready' | 'error';
export type EmbedState = 'none' | 'pending' | 'done';
export type ProcessingStage = 'reading' | 'vision' | 'topics' | 'questions' | 'done';

export interface Deck {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastPlayedAt: number | null;
  /** "auto" = same as the notes. */
  quizLanguage: string;
  /** Detected language of the notes (BCP-47 or "und"). */
  notesLanguage: string;
  examDate: DayKey | null;
  status: DeckStatus;
  stage: ProcessingStage;
  /** Error code when status is "error" (ingest or API code). */
  errorCode: string | null;
  embedState: EmbedState;
  bestSuddenDeath: number;
  /** Built-in sample deck id, if this deck came from a sample. */
  sampleId: string | null;
}

export interface Source {
  id: string;
  deckId: string;
  name: string;
  kind: SourceKind;
  units: number;
  bytes: number;
  addedAt: number;
}

export interface Chunk {
  id: string;
  deckId: string;
  index: number;
  text: string;
  headingPath: string[];
  refs: SourceRef[];
  wordCount: number;
  /** L2-normalised embedding; absent until Smart search has processed the deck. */
  vector?: Float32Array;
}

/** A page render or photo, kept for figure questions and the source sheet. */
export interface ImageRecord {
  id: string;
  deckId: string;
  sourceId: string;
  page: number | null;
  blob: Blob;
  hasFigure: boolean;
  description: string;
}

export type TopicStatus = 'pending' | 'generating' | 'ready' | 'exhausted' | 'error';

export interface TopicRecord {
  id: string; // `${deckId}:${key}`
  deckId: string;
  key: string;
  order: number;
  title: string;
  summary: string;
  chunkIds: string[];
  /** Adaptive-difficulty skill estimate in [1, 3]. */
  skill: number;
  status: TopicStatus;
  /** Number of generation requests that returned no new questions in a row. */
  emptyRounds: number;
}

export type ReportReason = 'wrong' | 'notInNotes' | 'unclear' | 'duplicate';

export interface QuestionRecord {
  id: string;
  deckId: string;
  topicId: string;
  content: QuestionContent;
  createdAt: number;
  reported: { reason: ReportReason; at: number } | null;
  /** Normalised embedding of the question text for duplicate detection. */
  vector?: Float32Array;
}

export interface CardRecord extends CardState {
  questionId: string;
  deckId: string;
  topicId: string;
}

export type GameMode = 'quick' | 'topic' | 'review' | 'boss' | 'exam' | 'sudden' | 'flashcards' | 'challenge';

export interface ReviewRecord {
  id?: number;
  questionId: string;
  deckId: string;
  topicId: string;
  at: number;
  day: DayKey;
  correct: boolean;
  /** Explain answers: share of key points covered. */
  score: number | null;
  rating: number;
  durationMs: number;
  usedHint: boolean;
  mode: GameMode;
}

export interface SessionRecord {
  id: string;
  deckId: string | null;
  mode: GameMode;
  startedAt: number;
  endedAt: number;
  answered: number;
  correct: number;
  xp: number;
  bestCombo: number;
  activeMs: number;
  title: string;
  topicIds: string[];
}

export interface DayRecord {
  day: DayKey;
  activeMs: number;
  answered: number;
  correct: number;
  xp: number;
  goalMet: boolean;
}

export interface Profile {
  id: 'me';
  nickname: string;
  avatar: number;
  mascotTheme: number;
  createdAt: number;
  xp: number;
  dailyGoalMinutes: 5 | 10 | 20;
  streak: StreakState;
  stats: LifetimeStats;
  onboarded: boolean;
}

export interface BadgeRecord {
  id: string;
  earnedAt: number;
}

export interface ExamRecord {
  id: string;
  deckId: string;
  title: string;
  date: DayKey;
  createdAt: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}
