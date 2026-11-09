/**
 * The play session: which questions, in which order, what was answered, combo, XP, hearts and timers.
 * Every answer is saved to IndexedDB as it happens, so pausing or quitting never loses progress.
 */
import { create } from 'zustand';
import { db } from '../db/schema';
import { activeQuestions, getProfile, reportQuestion, undoReport } from '../db/repo';
import type { CardRecord, GameMode, QuestionRecord, ReportReason } from '../db/types';
import type { QuestionContent } from '../../shared/question';
import { evaluate, type AnswerInput, type Evaluation } from '../lib/game/check';
import { daysAway as daysAwayOf, finishSession, recordAnswer, revokeXp, type SessionFinishResult } from '../lib/game/record';
import { ensureTopicQuestions } from '../lib/deck/generate';
import { selectQuestions } from '../lib/learning/select';
import { shuffle } from '../lib/learning/random';
import { targetDifficulty } from '../lib/learning/mastery';
import { isDue } from '../lib/learning/fsrs';
import { xpForAnswer } from '../lib/learning/xp';
import type { SelfGrade } from '../lib/learning/fsrs';
import type { ChallengeData } from '../lib/challenge';

export type SessionConfig =
  | { mode: 'quick'; deckId: string }
  | { mode: 'topic'; deckId: string; topicId: string }
  | { mode: 'review'; deckId?: string }
  | { mode: 'boss'; deckId: string; topicId: string }
  | { mode: 'exam'; deckId: string; count: number; minutes: number }
  | { mode: 'sudden'; deckId: string }
  | { mode: 'flashcards'; deckId: string; topicId?: string }
  | { mode: 'challenge'; challenge: ChallengeData };

export interface PlayItem {
  id: string;
  deckId: string;
  topicId: string;
  content: QuestionContent;
  quizLanguage: string;
  /** Display order of options/definitions/steps (indices into the original arrays). */
  order: number[];
}

export interface AnswerLog {
  itemId: string;
  topicId: string;
  correct: boolean;
  score: number;
  usedHint: boolean;
  durationMs: number;
  xp: number;
  input: AnswerInput;
  evaluation: Evaluation;
  reported?: ReportReason;
  /** Explain answers: the learner's text and the grader's feedback per key point. */
  explain?: { text: string; feedback: string[] };
}

export const BOSS_HEARTS = 3;
export const BOSS_QUESTIONS = 8;
export const BOSS_SECONDS = 30;

type Phase = 'loading' | 'question' | 'feedback' | 'done' | 'empty';

interface PlayState {
  config: SessionConfig | null;
  phase: Phase;
  items: PlayItem[];
  index: number;
  answers: AnswerLog[];
  combo: number;
  bestCombo: number;
  xp: number;
  hearts: number;
  hintUsed: boolean;
  questionStartedAt: number;
  lastActivity: number;
  activeMs: number;
  startedAt: number;
  deadline: number | null;
  daysAway: number;
  isFirstSession: boolean;
  result: SessionFinishResult | null;
  /** Last answer's XP gain (for the pop-up) and whether a combo milestone was hit. */
  lastXp: number;
  comboMilestone: boolean;
  start: (config: SessionConfig) => Promise<void>;
  touch: () => void;
  useHint: () => void;
  submit: (input: AnswerInput, extra?: AnswerLog['explain']) => Promise<AnswerLog | null>;
  next: () => Promise<void>;
  report: (reason: ReportReason) => Promise<{ undo: () => Promise<void> } | null>;
  finish: () => Promise<void>;
  reset: () => void;
}

const isMultiStep = (q: QuestionContent) => q.type === 'match' || q.type === 'order';

function displayOrder(q: QuestionContent): number[] {
  const n = q.type === 'mcq' ? 4 : q.type === 'match' ? q.pairs.length : q.type === 'order' ? q.steps.length : 0;
  if (!n) return [];
  const identity = Array.from({ length: n }, (_, i) => i);
  for (let tries = 0; tries < 5; tries++) {
    const s = shuffle(identity);
    // An "order" question must never start already solved.
    if (q.type !== 'order' || s.some((v, i) => v !== i)) return s;
  }
  return identity.slice().reverse();
}

async function deckLanguage(deckId: string): Promise<string> {
  const d = await db.decks.get(deckId);
  if (!d) return 'auto';
  return d.quizLanguage === 'auto' ? d.notesLanguage : d.quizLanguage;
}

function toItem(q: QuestionRecord, quizLanguage: string): PlayItem {
  return { id: q.id, deckId: q.deckId, topicId: q.topicId, content: q.content, quizLanguage, order: displayOrder(q.content) };
}

/** Builds the question list for a session; may generate a few more questions first when the pool is small. */
async function loadItems(config: Exclude<SessionConfig, { mode: 'challenge' }>): Promise<PlayItem[]> {
  const now = Date.now();
  if (config.mode === 'review') {
    const cards: CardRecord[] = config.deckId ? await db.cardStates.where('deckId').equals(config.deckId).toArray() : await db.cardStates.toArray();
    const due = cards.filter((c) => isDue(c, now)).sort((a, b) => a.due - b.due).slice(0, 20);
    const qs = (await db.questions.bulkGet(due.map((c) => c.questionId))).filter((q): q is QuestionRecord => !!q && !q.reported);
    const langs = new Map<string, string>();
    for (const q of qs) if (!langs.has(q.deckId)) langs.set(q.deckId, await deckLanguage(q.deckId));
    return qs.map((q) => toItem(q, langs.get(q.deckId)!));
  }

  const deckId = config.deckId;
  const topicId = config.mode === 'topic' || config.mode === 'boss' ? config.topicId : config.mode === 'flashcards' ? config.topicId : undefined;
  const want = config.mode === 'exam' ? config.count : config.mode === 'boss' ? BOSS_QUESTIONS : config.mode === 'sudden' ? 30 : config.mode === 'flashcards' ? 20 : 10;

  let pool = await activeQuestions(deckId, topicId);
  if (pool.length < Math.min(want, 4)) {
    // Almost nothing to play yet: one quick top-up (capped at 20 s); otherwise play now and let the
    // background generator keep filling the deck.
    const topics = topicId ? [topicId] : (await db.topics.where('deckId').equals(deckId).toArray()).sort((a, b) => a.order - b.order).map((t) => t.id);
    const smallest = topics[0];
    if (smallest) {
      try {
        await Promise.race([ensureTopicQuestions(smallest, 4, { retries: 1 }), new Promise((r) => setTimeout(r, 20_000))]);
      } catch {
        /* offline or busy: continue with the existing pool */
      }
    }
    pool = await activeQuestions(deckId, topicId);
  }
  if (config.mode === 'flashcards') pool = pool.filter((q) => !isMultiStep(q.content));
  const cards = new Map((await db.cardStates.where('deckId').equals(deckId).toArray()).map((c) => [c.questionId, c]));
  const topics = new Map((await db.topics.where('deckId').equals(deckId).toArray()).map((t) => [t.id, t]));
  const candidates = pool.map((q) => ({ ...q, type: q.content.type, difficulty: q.content.difficulty, card: cards.get(q.id) }));
  let picked;
  if (config.mode === 'sudden') picked = shuffle(candidates).slice(0, want);
  else
    picked = selectQuestions(candidates, {
      count: want,
      now,
      hard: config.mode === 'boss',
      target: (t) => targetDifficulty(topics.get(t)?.skill ?? 1.5),
      ...(config.mode === 'boss' ? { types: ['mcq', 'tf', 'fill', 'match', 'order'] } : {}),
    });
  const lang = await deckLanguage(deckId);
  return picked.map((q) => toItem(q, lang));
}

const initial = {
  config: null,
  phase: 'loading' as Phase,
  items: [],
  index: 0,
  answers: [],
  combo: 0,
  bestCombo: 0,
  xp: 0,
  hearts: BOSS_HEARTS,
  hintUsed: false,
  questionStartedAt: 0,
  lastActivity: 0,
  activeMs: 0,
  startedAt: 0,
  deadline: null,
  daysAway: 0,
  isFirstSession: false,
  result: null,
  lastXp: 0,
  comboMilestone: false,
};

export const usePlay = create<PlayState>((set, get) => ({
  ...initial,

  async start(config) {
    set({ ...initial, config, phase: 'loading' });
    const now = Date.now();
    let items: PlayItem[];
    if (config.mode === 'challenge') {
      items = config.challenge.questions.map((content, i) => ({
        id: `challenge-${i}`,
        deckId: '',
        topicId: 'challenge',
        content,
        quizLanguage: 'auto',
        order: displayOrder(content),
      }));
    } else items = await loadItems(config);
    if (get().config !== config) return; // a newer session started meanwhile
    const profile = await getProfile();
    const sessions = await db.sessions.count();
    set({
      items,
      phase: items.length ? 'question' : 'empty',
      startedAt: now,
      questionStartedAt: Date.now(),
      lastActivity: Date.now(),
      deadline: config.mode === 'exam' ? Date.now() + config.minutes * 60_000 : null,
      daysAway: daysAwayOf(profile),
      isFirstSession: sessions === 0,
    });
  },

  touch() {
    const now = Date.now();
    const s = get();
    set({ activeMs: s.activeMs + Math.min(60_000, Math.max(0, now - s.lastActivity)), lastActivity: now });
  },

  useHint() {
    const s = get();
    if (s.config?.mode === 'exam' || s.config?.mode === 'boss') return;
    get().touch();
    set({ hintUsed: true });
  },

  async submit(input, extra) {
    const s = get();
    const item = s.items[s.index];
    if (!item || s.phase !== 'question' || !s.config) return null;
    const now = Date.now();
    const gained = Math.min(60_000, Math.max(0, now - s.lastActivity));
    const durationMs = now - s.questionStartedAt;
    const evaluation = evaluate(item.content, input);
    const combo = evaluation.correct ? s.combo + 1 : 0;
    const selfGrade: SelfGrade | undefined = input.type === 'flashcard' ? input.grade : undefined;
    let xp: number;
    const mode: GameMode = s.config.mode;
    if (mode === 'challenge') {
      xp = xpForAnswer({ type: item.content.type, difficulty: item.content.difficulty, correct: evaluation.correct, score: evaluation.score, usedHint: s.hintUsed, combo });
    } else {
      const r = await recordAnswer({
        questionId: item.id,
        deckId: item.deckId,
        topicId: item.topicId,
        type: item.content.type,
        difficulty: item.content.difficulty,
        correct: evaluation.correct,
        score: evaluation.score,
        usedHint: s.hintUsed,
        durationMs,
        activeMs: gained,
        combo,
        mode,
        selfGrade,
        quizLanguage: item.quizLanguage,
      });
      xp = r.xp;
    }
    const log: AnswerLog = {
      itemId: item.id,
      topicId: item.topicId,
      correct: evaluation.correct,
      score: evaluation.score,
      usedHint: s.hintUsed,
      durationMs,
      xp,
      input,
      evaluation,
      ...(extra ? { explain: extra } : {}),
    };
    const hearts = mode === 'boss' && !evaluation.correct ? s.hearts - 1 : s.hearts;
    set({
      answers: [...s.answers, log],
      combo,
      bestCombo: Math.max(s.bestCombo, combo),
      xp: s.xp + xp,
      hearts,
      lastXp: xp,
      comboMilestone: combo > 0 && combo % 3 === 0,
      activeMs: s.activeMs + gained,
      lastActivity: now,
      phase: mode === 'exam' || mode === 'flashcards' ? 'question' : 'feedback',
    });
    if (mode === 'exam' || mode === 'flashcards') await get().next();
    return log;
  },

  async next() {
    const s = get();
    get().touch();
    const last = s.answers.at(-1);
    const mode = s.config?.mode;
    const bossOver = mode === 'boss' && (s.hearts <= 0 || s.answers.filter((a) => a.correct).length >= s.items.length);
    const suddenOver = mode === 'sudden' && last && !last.correct && !last.reported;
    if (s.index + 1 >= s.items.length || bossOver || suddenOver) {
      await get().finish();
      return;
    }
    set({ index: s.index + 1, phase: 'question', hintUsed: false, questionStartedAt: Date.now(), comboMilestone: false });
  },

  async report(reason) {
    const s = get();
    const item = s.items[s.index];
    if (!item || s.config?.mode === 'challenge') return null;
    await reportQuestion(item.id, reason);
    const answered = s.answers.findIndex((a) => a.itemId === item.id);
    const revoked = answered >= 0 ? s.answers[answered]!.xp : 0;
    if (revoked) await revokeXp(revoked);
    const snapshot = { items: s.items, answers: s.answers, xp: s.xp, index: s.index, phase: s.phase };
    const answers = s.answers.map((a) => (a.itemId === item.id ? { ...a, reported: reason, xp: 0 } : a));
    // Remove the question from this session immediately.
    const items = s.items.filter((x) => x.id !== item.id);
    if (!items.length || s.index >= items.length) {
      set({ items, answers, xp: s.xp - revoked });
      await get().finish();
    } else {
      set({ items, answers, xp: s.xp - revoked, phase: 'question', hintUsed: false, questionStartedAt: Date.now() });
    }
    return {
      undo: async () => {
        await undoReport(item.id);
        if (get().phase !== 'done') set({ ...snapshot });
      },
    };
  },

  async finish() {
    const s = get();
    if (!s.config || s.phase === 'done') return;
    const counted = s.answers.filter((a) => !a.reported);
    const mode = s.config.mode;
    if (mode === 'challenge') {
      set({ phase: 'done', result: null });
      return;
    }
    const deckId = 'deckId' in s.config ? (s.config.deckId ?? null) : null;
    const result = await finishSession({
      deckId,
      mode,
      startedAt: s.startedAt,
      answers: counted.map((a) => ({ correct: a.correct, durationMs: a.durationMs, usedHint: a.usedHint, topicId: a.topicId })),
      xp: s.xp,
      bestCombo: s.bestCombo,
      activeMs: s.activeMs,
      bossWon: mode === 'boss' && s.hearts > 0 && counted.filter((a) => a.correct).length >= s.items.length,
      perfectExam: mode === 'exam' && counted.length >= 10 && counted.every((a) => a.correct),
      suddenDeathScore: mode === 'sudden' ? counted.filter((a) => a.correct).length : undefined,
      daysAway: s.daysAway,
      isFirstSession: s.isFirstSession,
    });
    set({ phase: 'done', result });
  },

  reset() {
    set({ ...initial });
  },
}));
