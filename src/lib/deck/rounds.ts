import type { QuestionType } from '../../../shared/question';

const ROTATING: QuestionType[] = ['tf', 'fill', 'flashcard', 'match', 'order', 'explain'];

/** Types for a round: multiple choice always, plus three rotating types for variety. */
export function roundTypes(round: number): QuestionType[] {
  const picked = [0, 1, 2].map((k) => ROTATING[(round * 3 + k) % ROTATING.length]!);
  return ['mcq', ...new Set(picked)];
}

/** Chunks for a round: a window of up to 4 consecutive chunks that moves each round, under ~10k characters. */
export function roundChunks<T extends { text: string }>(chunks: T[], round: number): T[] {
  if (chunks.length <= 4) return chunks;
  const start = (round * 2) % chunks.length;
  const out: T[] = [];
  let chars = 0;
  for (let i = 0; i < Math.min(4, chunks.length); i++) {
    const c = chunks[(start + i) % chunks.length]!;
    if (out.length && chars + c.text.length > 10_000) break;
    out.push(c);
    chars += c.text.length;
  }
  return out;
}
