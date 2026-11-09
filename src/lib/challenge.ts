/**
 * Challenge links (no server): up to 10 questions of a session (question, options, correct answer, short
 * explanation — never the source passages), plus the challenger's nickname, avatar and score, compressed into
 * the URL fragment (#c=…) so they never reach the server. Validated with Zod when opened.
 */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { z } from 'zod';
import type { QuestionContent } from '../../shared/question';

export const MAX_LINK_LENGTH = 1800;
export const MAX_CHALLENGE_QUESTIONS = 10;

const s = (max: number) => z.string().min(1).max(max);
const CQ = z.discriminatedUnion('t', [
  z.object({ t: z.literal('mcq'), p: s(300), o: z.array(s(160)).length(4), a: z.number().int().min(0).max(3), e: z.string().max(200) }),
  z.object({ t: z.literal('tf'), p: s(300), a: z.boolean(), c: z.string().max(300).optional(), e: z.string().max(200) }),
  z.object({ t: z.literal('fill'), p: s(300), a: s(120), x: z.array(s(120)).max(4), e: z.string().max(200) }),
  z.object({ t: z.literal('match'), p: s(200), m: z.array(z.tuple([s(120), s(160)])).min(4).max(5), e: z.string().max(200) }),
  z.object({ t: z.literal('order'), p: s(200), s: z.array(s(160)).min(3).max(6), e: z.string().max(200) }),
]);
type CQ = z.infer<typeof CQ>;

const PayloadSchema = z.object({
  v: z.literal(1),
  n: z.string().max(24),
  av: z.number().int().min(0).max(63),
  sc: z.number().int().min(0).max(MAX_CHALLENGE_QUESTIONS),
  q: z.array(CQ).min(1).max(MAX_CHALLENGE_QUESTIONS),
});

export interface ChallengeData {
  nickname: string;
  avatar: number;
  score: number;
  questions: QuestionContent[];
}

const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

function toCompact(q: QuestionContent): CQ | null {
  const e = cut(q.explanation, 200);
  switch (q.type) {
    case 'mcq':
      if (q.options.some((o) => o.length > 160) || q.prompt.length > 300) return null;
      return { t: 'mcq', p: q.prompt, o: q.options, a: q.answerIndex, e };
    case 'tf':
      return q.prompt.length > 300 ? null : { t: 'tf', p: q.prompt, a: q.answer, ...(q.correction ? { c: cut(q.correction, 300) } : {}), e };
    case 'fill':
      return q.prompt.length > 300 || q.answer.length > 120 ? null : { t: 'fill', p: q.prompt, a: q.answer, x: q.acceptedAnswers.filter((x) => x.length <= 120).slice(0, 4), e };
    case 'match':
      if (q.pairs.some((p) => p.term.length > 120 || p.definition.length > 160)) return null;
      return { t: 'match', p: cut(q.prompt, 200), m: q.pairs.map((p) => [p.term, p.definition] as [string, string]), e };
    case 'order':
      return q.steps.some((x) => x.length > 160) ? null : { t: 'order', p: cut(q.prompt, 200), s: q.steps, e };
    default:
      return null; // flashcards and explain questions are not competitive
  }
}

function fromCompact(c: CQ): QuestionContent {
  const base = { explanation: c.e || '—', hint: '', difficulty: 2 as const, topicId: 'challenge', sourceChunkIds: [] as string[], evidenceQuote: '' };
  switch (c.t) {
    case 'mcq':
      return { ...base, type: 'mcq', prompt: c.p, options: c.o, answerIndex: c.a };
    case 'tf':
      return { ...base, type: 'tf', prompt: c.p, answer: c.a, ...(c.c ? { correction: c.c } : {}) };
    case 'fill':
      return { ...base, type: 'fill', prompt: c.p, answer: c.a, acceptedAnswers: c.x };
    case 'match':
      return { ...base, type: 'match', prompt: c.p, pairs: c.m.map(([term, definition]) => ({ term, definition })) };
    case 'order':
      return { ...base, type: 'order', prompt: c.p, steps: c.s };
  }
}

/** Builds the link; drops questions from the end until it fits in ~1,800 characters. */
export function createChallengeLink(
  origin: string,
  data: { nickname: string; avatar: number; results: Array<{ content: QuestionContent; correct: boolean }> },
): { url: string; count: number } | null {
  const usable = data.results
    .map((r) => ({ c: toCompact(r.content), correct: r.correct }))
    .filter((r): r is { c: CQ; correct: boolean } => r.c !== null)
    .slice(0, MAX_CHALLENGE_QUESTIONS);
  for (let n = usable.length; n >= 1; n--) {
    const take = usable.slice(0, n);
    const payload = {
      v: 1 as const,
      n: data.nickname.slice(0, 24),
      av: data.avatar,
      sc: take.filter((r) => r.correct).length,
      q: take.map((r) => r.c),
    };
    const url = `${origin}/challenge#c=${compressToEncodedURIComponent(JSON.stringify(payload))}`;
    if (url.length <= MAX_LINK_LENGTH) return { url, count: n };
  }
  return null;
}

/** Parses a fragment like "#c=…". Returns null for anything malformed (never throws). */
export function parseChallenge(hash: string): ChallengeData | null {
  const m = /[#&]c=([^&]+)/.exec(hash);
  if (!m) return null;
  try {
    const json = decompressFromEncodedURIComponent(m[1]!);
    if (!json) return null;
    const r = PayloadSchema.safeParse(JSON.parse(json));
    if (!r.success) return null;
    const p = r.data;
    return { nickname: p.n, avatar: p.av, score: Math.min(p.sc, p.q.length), questions: p.q.map(fromCompact) };
  } catch {
    return null;
  }
}
