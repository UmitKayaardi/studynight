/**
 * IndexedDB schema (Dexie). Every change gets a new version with an upgrade function; old versions stay listed
 * so that any device can migrate forward. Migrations are tested in schema.test.ts.
 */
import Dexie, { type EntityTable, type Transaction } from 'dexie';
import { dayKey } from '../lib/learning/streak';
import type {
  BadgeRecord,
  CardRecord,
  Chunk,
  DayRecord,
  Deck,
  ExamRecord,
  ImageRecord,
  Profile,
  QuestionRecord,
  ReviewRecord,
  SessionRecord,
  SettingRecord,
  Source,
  TopicRecord,
} from './types';

export const DB_NAME = 'studynight';

/** v1: initial schema. */
export const SCHEMA_V1 = {
  decks: 'id, updatedAt, lastPlayedAt',
  sources: 'id, deckId',
  chunks: 'id, deckId, [deckId+index]',
  images: 'id, deckId',
  topics: 'id, deckId, [deckId+order]',
  questions: 'id, deckId, topicId',
  cardStates: 'questionId, deckId, topicId, due',
  reviews: '++id, questionId, deckId, topicId, at, day',
  sessions: 'id, deckId, startedAt',
  profile: 'id',
  badges: 'id',
  exams: 'id, deckId, date',
  settings: 'key',
};

/** v2: daily activity rollups (streak calendar, daily goal, stats over time), backfilled from the review log. */
export const SCHEMA_V2 = { ...SCHEMA_V1, days: 'day' };

export class StudyNightDB extends Dexie {
  decks!: EntityTable<Deck, 'id'>;
  sources!: EntityTable<Source, 'id'>;
  chunks!: EntityTable<Chunk, 'id'>;
  images!: EntityTable<ImageRecord, 'id'>;
  topics!: EntityTable<TopicRecord, 'id'>;
  questions!: EntityTable<QuestionRecord, 'id'>;
  cardStates!: EntityTable<CardRecord, 'questionId'>;
  reviews!: EntityTable<ReviewRecord, 'id'>;
  sessions!: EntityTable<SessionRecord, 'id'>;
  profile!: EntityTable<Profile, 'id'>;
  badges!: EntityTable<BadgeRecord, 'id'>;
  exams!: EntityTable<ExamRecord, 'id'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  days!: EntityTable<DayRecord, 'day'>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores(SCHEMA_V1);
    this.version(2).stores(SCHEMA_V2).upgrade(backfillDays);
  }
}

export async function backfillDays(tx: Transaction): Promise<void> {
  const days = new Map<string, DayRecord>();
  await tx.table<ReviewRecord>('reviews').each((r) => {
    const key = r.day ?? dayKey(r.at);
    const d = days.get(key) ?? { day: key, activeMs: 0, answered: 0, correct: 0, xp: 0, goalMet: false };
    d.answered++;
    if (r.correct) d.correct++;
    d.activeMs += Math.min(r.durationMs, 120_000);
    days.set(key, d);
  });
  await tx.table<DayRecord>('days').bulkPut([...days.values()]);
}

export const db = new StudyNightDB();
