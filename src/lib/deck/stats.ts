/** Deck and topic statistics computed from local data (mastery, due reviews, weak topics). */
import { db } from '../../db/schema';
import type { Deck, TopicRecord } from '../../db/types';
import { isDue } from '../learning/fsrs';
import { BOSS_UNLOCK, RECENT_WINDOW, topicMastery, WEAK_THRESHOLD } from '../learning/mastery';

export interface TopicStat {
  topic: TopicRecord;
  questions: number;
  mastery: number;
  due: number;
  practised: boolean;
  weak: boolean;
  bossUnlocked: boolean;
}

export interface DeckStat {
  deck: Deck;
  questions: number;
  due: number;
  mastery: number;
  topics: TopicStat[];
}

export async function deckStats(deckId: string, now = Date.now()): Promise<DeckStat | null> {
  const deck = await db.decks.get(deckId);
  if (!deck) return null;
  const [topics, questions, cards, reviews] = await Promise.all([
    db.topics.where('deckId').equals(deckId).toArray(),
    db.questions.where('deckId').equals(deckId).toArray(),
    db.cardStates.where('deckId').equals(deckId).toArray(),
    db.reviews.where('deckId').equals(deckId).toArray(),
  ]);
  const cardBy = new Map(cards.map((c) => [c.questionId, c]));
  const active = questions.filter((q) => !q.reported);
  const recentBy = new Map<string, boolean[]>();
  for (const r of reviews.sort((a, b) => a.at - b.at)) {
    const list = recentBy.get(r.topicId) ?? [];
    list.push(r.correct);
    if (list.length > RECENT_WINDOW) list.shift();
    recentBy.set(r.topicId, list);
  }
  const topicStats: TopicStat[] = topics
    .sort((a, b) => a.order - b.order)
    .map((topic) => {
      const qs = active.filter((q) => q.topicId === topic.id);
      const recent = recentBy.get(topic.id) ?? [];
      const mastery = topicMastery({ cards: qs.map((q) => cardBy.get(q.id)), recent, now });
      return {
        topic,
        questions: qs.length,
        mastery,
        due: qs.filter((q) => isDue(cardBy.get(q.id), now)).length,
        practised: recent.length > 0,
        weak: recent.length > 0 && mastery < WEAK_THRESHOLD,
        bossUnlocked: mastery >= BOSS_UNLOCK,
      };
    });
  const totalQ = topicStats.reduce((s, t) => s + t.questions, 0);
  const mastery = totalQ ? Math.round(topicStats.reduce((s, t) => s + t.mastery * t.questions, 0) / totalQ) : 0;
  return { deck, questions: totalQ, due: topicStats.reduce((s, t) => s + t.due, 0), mastery, topics: topicStats };
}

export async function allDeckStats(now = Date.now()): Promise<DeckStat[]> {
  const decks = await db.decks.toArray();
  const stats = await Promise.all(decks.map((d) => deckStats(d.id, now)));
  return stats
    .filter((s): s is DeckStat => !!s)
    .sort((a, b) => (b.deck.lastPlayedAt ?? b.deck.createdAt) - (a.deck.lastPlayedAt ?? a.deck.createdAt));
}

export async function dueCount(deckId?: string, now = Date.now()): Promise<number> {
  const cards = deckId ? await db.cardStates.where('deckId').equals(deckId).toArray() : await db.cardStates.toArray();
  const reported = new Set((await db.questions.filter((q) => !!q.reported).primaryKeys()) as string[]);
  return cards.filter((c) => isDue(c, now) && !reported.has(c.questionId)).length;
}

/** Due reviews per day for the next `days` days (index 0 = due now or today). */
export async function reviewForecast(days = 7, now = Date.now()): Promise<number[]> {
  const cards = await db.cardStates.toArray();
  const out = Array<number>(days).fill(0);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  for (const c of cards) {
    if (c.state === 0) continue;
    const idx = Math.max(0, Math.floor((c.due - start.getTime()) / 86_400_000));
    if (idx < days) out[idx]!++;
  }
  return out;
}
