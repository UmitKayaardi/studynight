/**
 * Picks the questions for a session. Deterministic rules, secure shuffling:
 * 1. due reviews first (most overdue first),
 * 2. then unseen questions closest to the target difficulty,
 * 3. then seen questions with the lowest retrievability,
 * with question types interleaved so the same type rarely appears twice in a row.
 */
import { isDue, retrievability, type CardState } from './fsrs';
import { shuffle } from './random';
import type { QuestionType } from '../../../shared/question';

export interface Candidate {
  id: string;
  type: QuestionType;
  difficulty: 1 | 2 | 3;
  topicId: string;
  card?: CardState;
}

export interface SelectOptions {
  count: number;
  now: number;
  /** Target difficulty per topic (from the skill estimate); defaults to 2. */
  target?: (topicId: string) => 1 | 2 | 3;
  /** Only questions with these types. */
  types?: QuestionType[];
  /** Only due questions (Review mode). */
  dueOnly?: boolean;
  /** Prefer harder questions (Boss battle). */
  hard?: boolean;
}

export function selectQuestions<T extends Candidate>(pool: T[], o: SelectOptions): T[] {
  const allowed = o.types ? pool.filter((q) => o.types!.includes(q.type)) : pool;
  const randomised = shuffle(allowed); // random tie-break
  const due = randomised.filter((q) => isDue(q.card, o.now)).sort((a, b) => a.card!.due - b.card!.due);
  if (o.dueOnly) return interleave(due.slice(0, o.count));

  const target = (q: T) => (o.hard ? 3 : (o.target?.(q.topicId) ?? 2));
  const unseen = randomised
    .filter((q) => !q.card || q.card.reps === 0)
    .sort((a, b) => Math.abs(a.difficulty - target(a)) - Math.abs(b.difficulty - target(b)));
  const seenNotDue = randomised
    .filter((q) => q.card && q.card.reps > 0 && !isDue(q.card, o.now))
    .sort((a, b) => {
      if (o.hard && a.difficulty !== b.difficulty) return b.difficulty - a.difficulty;
      return retrievability(a.card, o.now) - retrievability(b.card, o.now);
    });

  const picked: T[] = [];
  const seen = new Set<string>();
  for (const list of o.hard
    ? [unseen.filter((q) => q.difficulty >= 2), due, seenNotDue, unseen]
    : [due, unseen, seenNotDue]) {
    for (const q of list) {
      if (picked.length >= o.count) break;
      if (!seen.has(q.id)) {
        seen.add(q.id);
        picked.push(q);
      }
    }
  }
  return interleave(picked);
}

/** Reorders so that the same question type rarely appears twice in a row (greedy). */
export function interleave<T extends { type: QuestionType }>(items: T[]): T[] {
  const rest = items.slice();
  const out: T[] = [];
  while (rest.length) {
    const last = out.at(-1)?.type;
    const i = rest.findIndex((q) => q.type !== last);
    out.push(rest.splice(i === -1 ? 0 : i, 1)[0]!);
  }
  return out;
}
