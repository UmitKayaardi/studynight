/**
 * Backup: everything in one versioned `.studynight` JSON file — the way to move to a new phone.
 * Embeddings are excluded (they are recomputed after import). Imports are validated with Zod and previewed
 * before anything is replaced.
 */
import { z } from 'zod';
import { QuestionContentSchema } from '../../shared/question';
import { db } from './schema';
import type { CardRecord, Deck } from './types';

export const BACKUP_FORMAT = 1;
export const BACKUP_EXTENSION = '.studynight';

const str = z.string().max(200_000);
const id = z.string().min(1).max(100);
const num = z.number().finite();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ref = z.object({
  sourceId: id,
  page: z.number().int().optional(),
  slide: z.number().int().optional(),
  headingPath: z.array(z.string().max(300)).max(10),
});

const DeckSchema = z.object({
  id,
  title: z.string().min(1).max(200),
  createdAt: num,
  updatedAt: num,
  lastPlayedAt: num.nullable(),
  quizLanguage: z.string().max(16),
  notesLanguage: z.string().max(16),
  examDate: day.nullable(),
  status: z.enum(['processing', 'ready', 'error']),
  stage: z.enum(['reading', 'vision', 'topics', 'questions', 'done']),
  errorCode: z.string().max(40).nullable(),
  embedState: z.enum(['none', 'pending', 'done']),
  bestSuddenDeath: z.number().int().min(0),
  sampleId: z.string().max(60).nullable(),
});
const SourceSchema = z.object({
  id,
  deckId: id,
  name: z.string().max(300),
  kind: z.enum(['pdf', 'pptx', 'docx', 'text', 'markdown', 'photo', 'paste']),
  units: z.number().int().min(0),
  bytes: z.number().int().min(0),
  addedAt: num,
});
const ChunkSchema = z.object({
  id,
  deckId: id,
  index: z.number().int().min(0),
  text: str,
  headingPath: z.array(z.string().max(300)).max(10),
  refs: z.array(ref).max(50),
  wordCount: z.number().int().min(0),
});
const ImageSchema = z.object({
  id,
  deckId: id,
  sourceId: id,
  page: z.number().int().nullable(),
  hasFigure: z.boolean(),
  description: z.string().max(5000),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  data: z.string().max(8_000_000),
});
const TopicSchema = z.object({
  id,
  deckId: id,
  key: z.string().max(20),
  order: z.number().int().min(0),
  title: z.string().max(200),
  summary: z.string().max(400),
  chunkIds: z.array(id).max(5000),
  skill: z.number().min(1).max(3),
  status: z.enum(['pending', 'generating', 'ready', 'exhausted', 'error']),
  emptyRounds: z.number().int().min(0),
});
const QuestionSchema = z.object({
  id,
  deckId: id,
  topicId: id,
  content: QuestionContentSchema,
  createdAt: num,
  reported: z.object({ reason: z.enum(['wrong', 'notInNotes', 'unclear', 'duplicate']), at: num }).nullable(),
});
const CardSchema = z.object({
  questionId: id,
  deckId: id,
  topicId: id,
  due: num,
  stability: num,
  difficulty: num,
  scheduledDays: num,
  learningSteps: num,
  reps: z.number().int().min(0),
  lapses: z.number().int().min(0),
  state: z.number().int().min(0).max(3),
  lastReview: num.nullable(),
});
const mode = z.enum(['quick', 'topic', 'review', 'boss', 'exam', 'sudden', 'flashcards', 'challenge']);
const ReviewSchema = z.object({
  id: z.number().int().optional(),
  questionId: id,
  deckId: id,
  topicId: id,
  at: num,
  day,
  correct: z.boolean(),
  score: z.number().min(0).max(1).nullable(),
  rating: z.number().int().min(1).max(4),
  durationMs: z.number().min(0),
  usedHint: z.boolean(),
  mode,
});
const SessionSchema = z.object({
  id,
  deckId: id.nullable(),
  mode,
  startedAt: num,
  endedAt: num,
  answered: z.number().int().min(0),
  correct: z.number().int().min(0),
  xp: z.number().int().min(0),
  bestCombo: z.number().int().min(0),
  activeMs: z.number().min(0),
  title: z.string().max(60),
  topicIds: z.array(id).max(100),
});
const ProfileSchema = z.object({
  id: z.literal('me'),
  nickname: z.string().max(40),
  avatar: z.number().int().min(0).max(63),
  mascotTheme: z.number().int().min(0).max(15),
  createdAt: num,
  xp: z.number().int().min(0),
  dailyGoalMinutes: z.union([z.literal(5), z.literal(10), z.literal(20)]),
  streak: z.object({
    current: z.number().int().min(0),
    best: z.number().int().min(0),
    lastDay: day.nullable(),
    freezes: z.number().int().min(0).max(2),
    frozenDays: z.array(day).max(100),
  }),
  stats: z.record(z.string(), z.union([z.number(), z.array(z.string().max(16)).max(100)])),
  onboarded: z.boolean(),
});

export const BackupSchema = z.object({
  app: z.literal('studynight'),
  format: z.literal(BACKUP_FORMAT),
  exportedAt: z.string().max(40),
  data: z.object({
    decks: z.array(DeckSchema).max(500),
    sources: z.array(SourceSchema).max(10_000),
    chunks: z.array(ChunkSchema).max(200_000),
    images: z.array(ImageSchema).max(20_000),
    topics: z.array(TopicSchema).max(20_000),
    questions: z.array(QuestionSchema).max(200_000),
    cardStates: z.array(CardSchema).max(200_000),
    reviews: z.array(ReviewSchema).max(2_000_000),
    sessions: z.array(SessionSchema).max(200_000),
    profile: ProfileSchema.nullable(),
    badges: z.array(z.object({ id: z.string().max(40), earnedAt: num })).max(100),
    exams: z
      .array(z.object({ id, deckId: id, title: z.string().max(200), date: day, createdAt: num }))
      .max(1000),
    settings: z.array(z.object({ key: z.string().max(40), value: z.unknown() })).max(100),
    days: z
      .array(
        z.object({
          day,
          activeMs: z.number().min(0),
          answered: z.number().int().min(0),
          correct: z.number().int().min(0),
          xp: z.number().min(0),
          goalMet: z.boolean(),
        }),
      )
      .max(100_000),
  }),
});
export type Backup = z.infer<typeof BackupSchema>;

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  });
}

function base64ToBlob(data: string, mime: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function exportBackup(): Promise<Backup> {
  const strip = <T extends { vector?: unknown }>(rows: T[]) => rows.map(({ vector: _v, ...rest }) => rest);
  const images = await db.images.toArray();
  const backup: Backup = {
    app: 'studynight',
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    data: {
      decks: await db.decks.toArray(),
      sources: await db.sources.toArray(),
      chunks: strip(await db.chunks.toArray()),
      images: await Promise.all(
        images.map(async ({ blob, ...rest }) => ({
          ...rest,
          mime: (['image/png', 'image/webp'].includes(blob.type) ? blob.type : 'image/jpeg') as 'image/jpeg',
          data: await blobToBase64(blob),
        })),
      ),
      topics: await db.topics.toArray(),
      questions: strip(await db.questions.toArray()),
      cardStates: await db.cardStates.toArray(),
      reviews: await db.reviews.toArray(),
      sessions: await db.sessions.toArray(),
      profile: ((await db.profile.get('me')) ?? null) as Backup['data']['profile'],
      badges: await db.badges.toArray(),
      exams: await db.exams.toArray(),
      settings: await db.settings.toArray(),
      days: await db.days.toArray(),
    },
  };
  return backup;
}

export function backupFileName(now = new Date()): string {
  return `studynight-backup-${now.toISOString().slice(0, 10)}${BACKUP_EXTENSION}`;
}

export type ParsedBackup = { ok: true; backup: Backup; preview: BackupPreview } | { ok: false };
export interface BackupPreview {
  exportedAt: string;
  decks: number;
  questions: number;
  reviews: number;
  badges: number;
}

/** Validates a backup file's text. Never throws; malformed files return { ok: false }. */
export function parseBackup(text: string): ParsedBackup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  const r = BackupSchema.safeParse(json);
  if (!r.success) return { ok: false };
  const d = r.data.data;
  const deckIds = new Set(d.decks.map((x) => x.id));
  // Every record must belong to a deck in the file.
  const orphan = [
    d.sources,
    d.chunks,
    d.images,
    d.topics,
    d.questions,
    d.cardStates,
    d.reviews,
    d.exams,
  ].some((rows) => rows.some((row) => !deckIds.has(row.deckId)));
  if (orphan) return { ok: false };
  return {
    ok: true,
    backup: r.data,
    preview: {
      exportedAt: r.data.exportedAt,
      decks: d.decks.length,
      questions: d.questions.length,
      reviews: d.reviews.length,
      badges: d.badges.length,
    },
  };
}

/** Replaces all local data with the backup. Embeddings are recomputed later (decks marked "pending"). */
export async function importBackup(backup: Backup): Promise<void> {
  const d = backup.data;
  const tables = [
    db.decks,
    db.sources,
    db.chunks,
    db.images,
    db.topics,
    db.questions,
    db.cardStates,
    db.reviews,
    db.sessions,
    db.profile,
    db.badges,
    db.exams,
    db.settings,
    db.days,
  ];
  await db.transaction('rw', tables, async () => {
    for (const t of tables) await t.clear();
    await db.decks.bulkPut(
      d.decks.map((x): Deck => ({ ...x, embedState: x.embedState === 'none' ? 'none' : 'pending' })),
    );
    await db.sources.bulkPut(d.sources);
    await db.chunks.bulkPut(d.chunks);
    await db.images.bulkPut(
      d.images.map(({ data, mime, ...rest }) => ({ ...rest, blob: base64ToBlob(data, mime) })),
    );
    await db.topics.bulkPut(d.topics);
    await db.questions.bulkPut(d.questions);
    await db.cardStates.bulkPut(d.cardStates as CardRecord[]);
    await db.reviews.bulkPut(d.reviews);
    await db.sessions.bulkPut(d.sessions);
    if (d.profile) await db.profile.put(d.profile as never);
    await db.badges.bulkPut(d.badges);
    await db.exams.bulkPut(d.exams);
    await db.settings.bulkPut(d.settings);
    await db.days.bulkPut(d.days);
  });
}
