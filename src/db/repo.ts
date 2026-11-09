/** Repositories: the only place that reads and writes IndexedDB tables directly. */
import Dexie from 'dexie';
import { db } from './schema';
import type {
  Chunk,
  Deck,
  ExamRecord,
  ImageRecord,
  Profile,
  QuestionRecord,
  ReportReason,
  SettingRecord,
  Source,
  TopicRecord,
  CardRecord,
  ReviewRecord,
  SessionRecord,
} from './types';
import type { QuestionContent } from '../../shared/question';
import { emptyStats } from '../lib/learning/badges';
import { emptyStreak } from '../lib/learning/streak';
import { newId } from '../lib/learning/random';

// ---- Profile ---------------------------------------------------------------------------------------------------

export function defaultProfile(now = Date.now()): Profile {
  return {
    id: 'me',
    nickname: '',
    avatar: 0,
    mascotTheme: 0,
    createdAt: now,
    xp: 0,
    dailyGoalMinutes: 10,
    streak: emptyStreak(),
    stats: emptyStats(),
    onboarded: false,
  };
}

export async function getProfile(): Promise<Profile> {
  const p = await db.profile.get('me');
  if (p) return { ...defaultProfile(p.createdAt), ...p, stats: { ...emptyStats(), ...p.stats } };
  const fresh = defaultProfile();
  await db.profile.put(fresh);
  return fresh;
}

export async function updateProfile(patch: Partial<Omit<Profile, 'id'>>): Promise<Profile> {
  const p = { ...(await getProfile()), ...patch };
  await db.profile.put(p);
  return p;
}

// ---- Settings --------------------------------------------------------------------------------------------------

export type ThemeSetting = 'system' | 'light' | 'dark';
export type SmartSearchSetting = 'ask' | 'on' | 'off';

export interface Settings {
  language: string;
  theme: ThemeSetting;
  sound: boolean;
  haptics: boolean;
  /** null = follow the system setting. */
  reducedMotion: boolean | null;
  quizLanguageDefault: string;
  smartSearch: SmartSearchSetting;
  figureQuestions: boolean;
  extendedTime: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  theme: 'system',
  sound: true,
  haptics: true,
  reducedMotion: null,
  quizLanguageDefault: 'auto',
  smartSearch: 'ask',
  figureQuestions: true,
  extendedTime: false,
};

export async function getSettings(): Promise<Settings> {
  const rows = await db.settings.toArray();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value;
  return out as unknown as Settings;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  await db.settings.put({ key, value } satisfies SettingRecord);
}

// ---- Decks -----------------------------------------------------------------------------------------------------

export async function createDeck(
  init: Pick<Deck, 'title' | 'quizLanguage' | 'examDate'> & Partial<Deck>,
): Promise<Deck> {
  const now = Date.now();
  const deck: Deck = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    lastPlayedAt: null,
    notesLanguage: 'und',
    status: 'processing',
    stage: 'reading',
    errorCode: null,
    embedState: 'none',
    bestSuddenDeath: 0,
    sampleId: null,
    ...init,
  };
  await db.decks.add(deck);
  return deck;
}

export async function updateDeck(id: string, patch: Partial<Deck>): Promise<void> {
  await db.decks.update(id, { ...patch, updatedAt: Date.now() });
}

export const getDeck = (id: string) => db.decks.get(id);

export async function listDecks(): Promise<Deck[]> {
  const decks = await db.decks.toArray();
  return decks.sort((a, b) => (b.lastPlayedAt ?? b.createdAt) - (a.lastPlayedAt ?? a.createdAt));
}

/** Everything that belongs to a deck — used for undo and for backups. */
export interface DeckSnapshot {
  deck: Deck;
  sources: Source[];
  chunks: Chunk[];
  images: ImageRecord[];
  topics: TopicRecord[];
  questions: QuestionRecord[];
  cardStates: CardRecord[];
  reviews: ReviewRecord[];
  sessions: SessionRecord[];
  exams: ExamRecord[];
}

const DECK_TABLES = [
  'sources',
  'chunks',
  'images',
  'topics',
  'questions',
  'cardStates',
  'reviews',
  'sessions',
  'exams',
] as const;

/** Deletes a deck and everything derived from it (chunks, vectors, questions, history). Returns a snapshot for undo. */
export async function deleteDeck(id: string): Promise<DeckSnapshot | null> {
  return db.transaction('rw', [db.decks, ...DECK_TABLES.map((t) => db[t])], async () => {
    const deck = await db.decks.get(id);
    if (!deck) return null;
    const snap = { deck } as DeckSnapshot;
    for (const t of DECK_TABLES) {
      const table = db[t] as Dexie.Table<unknown, unknown>;
      (snap as unknown as Record<string, unknown[]>)[t] = await table.where('deckId').equals(id).toArray();
      await table.where('deckId').equals(id).delete();
    }
    await db.decks.delete(id);
    return snap;
  });
}

export async function restoreDeck(snap: DeckSnapshot): Promise<void> {
  await db.transaction('rw', [db.decks, ...DECK_TABLES.map((t) => db[t])], async () => {
    await db.decks.put(snap.deck);
    for (const t of DECK_TABLES) {
      const rows = snap[t] as unknown[];
      if (rows.length) await (db[t] as Dexie.Table<unknown, unknown>).bulkPut(rows);
    }
  });
}

// ---- Sources, chunks, images, topics ---------------------------------------------------------------------------

export const deckSources = (deckId: string) => db.sources.where('deckId').equals(deckId).toArray();
export const deckChunks = (deckId: string) =>
  db.chunks.where('[deckId+index]').between([deckId, Dexie.minKey], [deckId, Dexie.maxKey]).toArray();
export const deckTopics = (deckId: string) =>
  db.topics.where('[deckId+order]').between([deckId, Dexie.minKey], [deckId, Dexie.maxKey]).toArray();
export const deckImages = (deckId: string) => db.images.where('deckId').equals(deckId).toArray();

export async function updateTopic(id: string, patch: Partial<TopicRecord>): Promise<void> {
  await db.topics.update(id, patch);
}

// ---- Questions -------------------------------------------------------------------------------------------------

export async function addQuestions(
  deckId: string,
  topicId: string,
  contents: QuestionContent[],
  vectors?: Array<Float32Array | undefined>,
): Promise<QuestionRecord[]> {
  const now = Date.now();
  const rows: QuestionRecord[] = contents.map((content, i) => ({
    id: newId(),
    deckId,
    topicId,
    content,
    createdAt: now,
    reported: null,
    ...(vectors?.[i] ? { vector: vectors[i] } : {}),
  }));
  await db.questions.bulkAdd(rows);
  return rows;
}

/** Questions that can be played (not reported). */
export async function activeQuestions(deckId: string, topicId?: string): Promise<QuestionRecord[]> {
  const all = topicId
    ? await db.questions.where('topicId').equals(topicId).toArray()
    : await db.questions.where('deckId').equals(deckId).toArray();
  return all.filter((q) => !q.reported && q.deckId === deckId);
}

/** A reported question is removed from play immediately (and can be restored with undo). */
export async function reportQuestion(id: string, reason: ReportReason): Promise<void> {
  await db.questions.update(id, { reported: { reason, at: Date.now() } });
}

export async function undoReport(id: string): Promise<void> {
  await db.questions.update(id, { reported: null });
}

export const cardStatesFor = (deckId: string) => db.cardStates.where('deckId').equals(deckId).toArray();

// ---- Exams -----------------------------------------------------------------------------------------------------

export async function upsertExam(
  exam: Omit<ExamRecord, 'id' | 'createdAt'> & { id?: string },
): Promise<ExamRecord> {
  const row: ExamRecord = { id: exam.id ?? newId(), createdAt: Date.now(), ...exam } as ExamRecord;
  await db.exams.put(row);
  return row;
}

export const listExams = () => db.exams.orderBy('date').toArray();
export const deleteExam = (id: string) => db.exams.delete(id);
