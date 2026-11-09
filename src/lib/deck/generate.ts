/**
 * Lazy question generation: the first topic immediately, the rest in the background, more on demand while the
 * learner plays. Never the whole deck up front. Rate limits are waited out calmly; offline simply pauses.
 */
import { create } from 'zustand';
import { api, ApiFailure, type CallOptions } from '../api';
import { db } from '../../db/schema';
import { addQuestions, getSettings } from '../../db/repo';
import type { QuestionRecord, TopicRecord } from '../../db/types';
import { questionKeyText } from '../../../shared/question';
import { targetDifficulty } from '../learning/mastery';
import { embedClient } from '../search/embedClient';
import { DUPLICATE_SIMILARITY, maxSimilarity } from '../search/retrieve';
import { shortId } from './ids';
import { roundChunks, roundTypes } from './rounds';

export { roundChunks, roundTypes };

/** Questions per topic that background generation aims for; more are generated on demand while playing. */
export const BACKGROUND_TARGET = 10;
export const MAX_PER_TOPIC = 80;
const PER_ROUND = 6;

interface GenState {
  /** Deck ids with background work running. */
  running: Record<string, boolean>;
  /** Deck ids currently waiting for the AI service (rate limited). */
  waiting: Record<string, boolean>;
  set: (deckId: string, patch: { running?: boolean; waiting?: boolean }) => void;
}

export const useGeneration = create<GenState>((set, get) => ({
  running: {},
  waiting: {},
  set(deckId, patch) {
    const s = get();
    set({
      running: patch.running === undefined ? s.running : { ...s.running, [deckId]: patch.running },
      waiting: patch.waiting === undefined ? s.waiting : { ...s.waiting, [deckId]: patch.waiting },
    });
  },
}));

const roundCounter = new Map<string, number>();
const topicLocks = new Map<string, Promise<number>>();

async function activeTopicQuestions(topicId: string): Promise<QuestionRecord[]> {
  return (await db.questions.where('topicId').equals(topicId).toArray()).filter((q) => !q.reported);
}

/** One generation request for a topic. Returns the number of new questions stored. */
export async function generateRound(topic: TopicRecord, opts: CallOptions = {}): Promise<number> {
  const deck = await db.decks.get(topic.deckId);
  if (!deck) return 0;
  const settings = await getSettings();
  const round = roundCounter.get(topic.id) ?? (await db.questions.where('topicId').equals(topic.id).count());
  roundCounter.set(topic.id, round + 1);

  const allChunks = (await db.chunks.bulkGet(topic.chunkIds)).filter((c): c is NonNullable<typeof c> => !!c);
  if (!allChunks.length) return 0;
  const chunks = roundChunks(allChunks, round);
  const existing = await db.questions.where('topicId').equals(topic.id).toArray(); // includes reported: never regenerate them
  const language =
    deck.quizLanguage === 'auto'
      ? deck.notesLanguage === 'und'
        ? 'auto'
        : deck.notesLanguage
      : deck.quizLanguage;

  // Every third round, ask about a figure from this topic's pages (if figure questions are on).
  let figure: { id: string; description: string } | undefined;
  if (settings.figureQuestions && round % 3 === 1) {
    const pages = new Set(allChunks.flatMap((c) => c.refs.map((r) => `${r.sourceId}|${r.page ?? ''}`)));
    const images = (await db.images.where('deckId').equals(deck.id).toArray()).filter(
      (i) => i.hasFigure && i.description && pages.has(`${i.sourceId}|${i.page ?? ''}`),
    );
    const img = images[round % Math.max(1, images.length)];
    if (img) figure = { id: img.id, description: img.description.slice(0, 3000) };
  }

  await db.topics.update(topic.id, { status: 'generating' });
  const res = await api.questions(
    {
      language,
      topic: { id: topic.key, title: topic.title, summary: topic.summary },
      chunks: chunks.map((c) => ({ id: shortId(c.id), text: c.text.slice(0, 4000) })),
      types: roundTypes(round),
      count: PER_ROUND,
      difficulty: targetDifficulty(topic.skill),
      existing: existing.slice(-60).map((q) => questionKeyText(q.content).slice(0, 240)),
      ...(figure ? { figure } : {}),
    },
    opts,
  );

  // Map short chunk ids back; drop near-duplicates by embedding similarity when Smart search is available.
  let contents = res.questions.map((q) => ({
    ...q,
    topicId: topic.id,
    sourceChunkIds: q.sourceChunkIds.map((s) => (s.startsWith('fig:') ? s : `${deck.id}:${s}`)),
  }));
  let vectors: Array<Float32Array | undefined> = contents.map(() => undefined);
  if (embedClient.ready && contents.length) {
    try {
      const fresh = await embedClient.embed(
        contents.map((q) => questionKeyText(q)),
        'query',
      );
      const known = existing.map((q) => q.vector).filter((v): v is Float32Array => !!v);
      const keep: number[] = [];
      fresh.forEach((v, i) => {
        if (maxSimilarity(v, known) < DUPLICATE_SIMILARITY) {
          keep.push(i);
          known.push(v);
        }
      });
      contents = keep.map((i) => contents[i]!);
      vectors = keep.map((i) => fresh[i]);
    } catch {
      /* Smart search unavailable: text-based duplicate checks on the server still applied */
    }
  }
  if (contents.length) await addQuestions(deck.id, topic.id, contents, vectors);
  const emptyRounds = contents.length ? 0 : topic.emptyRounds + 1;
  const total = existing.filter((q) => !q.reported).length + contents.length;
  await db.topics.update(topic.id, {
    emptyRounds,
    status: emptyRounds >= 3 || total >= MAX_PER_TOPIC ? 'exhausted' : 'ready',
  });
  return contents.length;
}

/** Makes sure a topic has at least `min` playable questions (unless its notes are exhausted). */
export function ensureTopicQuestions(topicId: string, min: number, opts: CallOptions = {}): Promise<number> {
  const running = topicLocks.get(topicId);
  if (running) return running.then(() => ensureTopicQuestions(topicId, min, opts));
  const job = (async () => {
    let added = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      const topic = await db.topics.get(topicId);
      if (!topic || topic.status === 'exhausted') break;
      if ((await activeTopicQuestions(topicId)).length >= min) break;
      added += await generateRound(topic, opts);
    }
    return added;
  })().finally(() => topicLocks.delete(topicId));
  topicLocks.set(topicId, job);
  return job;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Background fill: every topic up to the target, one request at a time, pausing politely when busy/offline. */
export function startBackgroundGeneration(deckId: string): void {
  const state = useGeneration.getState();
  if (state.running[deckId]) return;
  state.set(deckId, { running: true, waiting: false });
  void (async () => {
    try {
      for (let pass = 0; pass < 50; pass++) {
        const topics = await db.topics.where('deckId').equals(deckId).toArray();
        if (!topics.length) break;
        let next: TopicRecord | undefined;
        let fewest = Infinity;
        for (const t of topics.sort((a, b) => a.order - b.order)) {
          if (t.status === 'exhausted') continue;
          const n = (await activeTopicQuestions(t.id)).length;
          if (n < BACKGROUND_TARGET && n < fewest) {
            fewest = n;
            next = t;
          }
        }
        if (!next) break;
        try {
          await ensureTopicQuestions(next.id, Math.min(BACKGROUND_TARGET, fewest + 1), {
            retries: 5,
            onBusy: () => useGeneration.getState().set(deckId, { waiting: true }),
          });
          useGeneration.getState().set(deckId, { waiting: false });
        } catch (e) {
          if (e instanceof ApiFailure && (e.code === 'OFFLINE' || e.code === 'UPSTREAM')) break;
          if (e instanceof ApiFailure && e.code === 'RATE_LIMITED') {
            useGeneration.getState().set(deckId, { waiting: true });
            await sleep(20_000);
          } else {
            await db.topics.update(next.id, { status: 'error' });
          }
        }
      }
    } finally {
      useGeneration.getState().set(deckId, { running: false, waiting: false });
    }
  })();
}
