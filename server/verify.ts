/**
 * Deterministic question checks (code, not the model). A draft passes only if:
 * schema valid; cited chunks exist; the evidence quote is found in a cited chunk (≥ 0.9 fuzzy similarity);
 * multiple choice has 4 distinct options and one answer; a true/false statement is not the evidence verbatim;
 * match/order items are unique; no personal-data patterns; no duplicate of an existing question.
 */
import { questionKeyText, QuestionContentSchema, type QuestionContent } from '../shared/question.js';
import { foldText, quoteMatch } from '../shared/text.js';
import type { RejectReason } from '../shared/api.js';

export const EVIDENCE_MIN = 0.9;

export type CheckResult = { ok: true; question: QuestionContent } | { ok: false; reason: RejectReason };

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(?:\+?\d[\s-]?){9,}\d/;
const ALL_NONE = /\b(all|none) of the above\b/i;

const distinct = (items: string[]) => new Set(items.map(foldText)).size === items.length;

/** Word-bigram Jaccard similarity of folded texts (cheap near-duplicate measure). */
export function textSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const w = foldText(s).split(' ').filter(Boolean);
    const g = new Set<string>();
    if (w.length === 1) g.add(w[0]!);
    for (let i = 0; i + 1 < w.length; i++) g.add(`${w[i]} ${w[i + 1]}`);
    return g;
  };
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return foldText(a) === foldText(b) ? 1 : 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export const DUPLICATE_TEXT_SIMILARITY = 0.8;

export function isDuplicate(text: string, existing: string[], prompt?: string): boolean {
  const f = foldText(text);
  const p = prompt ? foldText(prompt) : '';
  return existing.some((e) => {
    const fe = foldText(e);
    // Same question text (e.g. two flashcards with the same front) counts as a duplicate whatever the answer.
    if (p && p.length >= 4 && (fe === p || fe.startsWith(`${p} `))) return true;
    return fe === f || textSimilarity(text, e) >= DUPLICATE_TEXT_SIMILARITY;
  });
}

const LATEX_HINT =
  /\\(rightarrow|leftarrow|frac|times|cdot|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|sum|sqrt|leq|geq|neq|approx|hat|text|mathrm|infty)\b|[_^]\{/;

/** Wraps a short answer that is clearly LaTeX but has no $…$ delimiters, so it renders as maths. */
export function wrapLatex(s: unknown): unknown {
  if (typeof s !== 'string' || s.includes('$') || s.includes('```') || !LATEX_HINT.test(s)) return s;
  return `$${s.trim()}$`;
}

/**
 * Puts the maths in free text (an Ask answer) between $…$, the only delimiters the app renders: converts \(…\) and
 * \[…\], and, when the text has no $ at all, wraps a bracketed formula that contains a LaTeX command.
 */
export function normaliseMaths(s: string): string {
  const out = s
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m: string) => `$$${m.trim()}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m: string) => `$${m.trim()}$`);
  if (out.includes('$')) return out;
  return out.replace(/\(([^()$\n]*\\[a-zA-Z]+[^()$\n]*)\)/g, (_, m: string) => `$${m.trim()}$`);
}

/** Normalises a raw model draft before schema validation (common harmless deviations). */
export function normaliseDraft(raw: unknown, topicId: string): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const d = { ...(raw as Record<string, unknown>) };
  d.topicId = topicId;
  if (typeof d.difficulty === 'string') d.difficulty = Number(d.difficulty);
  if (typeof d.difficulty === 'number') d.difficulty = Math.min(3, Math.max(1, Math.round(d.difficulty)));
  if (typeof d.sourceChunkIds === 'string') d.sourceChunkIds = [d.sourceChunkIds];
  if (d.type === 'tf' && typeof d.answer === 'string') d.answer = /^(true|yes)$/i.test(d.answer);
  if (d.type === 'tf' && (d.correction === null || d.correction === '')) delete d.correction;
  if (d.type === 'fill' && !Array.isArray(d.acceptedAnswers)) d.acceptedAnswers = [];
  if (d.type === 'fill' && typeof d.prompt === 'string')
    d.prompt = d.prompt.replace(/_{3,}|\[blank\]|\{blank\}/gi, '____');
  if (d.type === 'mcq' && typeof d.answerIndex === 'string') d.answerIndex = Number(d.answerIndex);
  if (d.type === 'flashcard') {
    if (typeof d.prompt === 'string') d.prompt = d.prompt.replace(/^\s*(front|question)\s*:\s*/i, '');
    if (typeof d.back === 'string') d.back = d.back.replace(/^\s*(back|answer)\s*:\s*/i, '');
  }
  if (Array.isArray(d.options)) d.options = d.options.map(wrapLatex);
  if (Array.isArray(d.steps)) d.steps = d.steps.map(wrapLatex);
  if (Array.isArray(d.acceptedAnswers)) d.acceptedAnswers = d.acceptedAnswers.map(wrapLatex);
  if (Array.isArray(d.pairs))
    d.pairs = d.pairs.map((p: unknown) =>
      p && typeof p === 'object'
        ? {
            ...(p as object),
            term: wrapLatex((p as { term?: unknown }).term),
            definition: wrapLatex((p as { definition?: unknown }).definition),
          }
        : p,
    );
  if (d.type === 'flashcard') d.back = wrapLatex(d.back);
  delete d.figureId; // set by the server only
  return d;
}

export function checkDraft(
  raw: unknown,
  ctx: { topicId: string; chunks: Map<string, string>; existing: string[] },
): CheckResult {
  const parsed = QuestionContentSchema.safeParse(normaliseDraft(raw, ctx.topicId));
  if (!parsed.success) return { ok: false, reason: 'schema' };
  const q = parsed.data;

  // Cited chunks must exist; the evidence quote must come from one of them (or, leniently, any given chunk).
  const cited = q.sourceChunkIds.filter((id) => ctx.chunks.has(id));
  const matchIn = (ids: string[]) =>
    ids.find((id) => quoteMatch(ctx.chunks.get(id)!, q.evidenceQuote) >= EVIDENCE_MIN);
  let evidenceChunk = matchIn(cited);
  if (!evidenceChunk) evidenceChunk = matchIn([...ctx.chunks.keys()]);
  if (!evidenceChunk) return { ok: false, reason: 'evidence' };
  q.sourceChunkIds = [...new Set([evidenceChunk, ...cited])];

  const allText = JSON.stringify(q);
  if (EMAIL.test(allText) || PHONE.test(allText.replace(/\$[^$]*\$/g, '')))
    return { ok: false, reason: 'structure' };

  switch (q.type) {
    case 'mcq':
      if (!distinct(q.options) || q.options.some((o) => ALL_NONE.test(o)))
        return { ok: false, reason: 'structure' };
      break;
    case 'tf':
      if (foldText(q.prompt) === foldText(q.evidenceQuote)) return { ok: false, reason: 'structure' };
      if (!q.answer && !q.correction?.trim()) return { ok: false, reason: 'structure' };
      break;
    case 'fill': {
      const blanks = q.prompt.match(/____/g)?.length ?? 0;
      if (blanks !== 1) return { ok: false, reason: 'structure' };
      const rest = foldText(q.prompt.replace('____', ' '));
      const ans = foldText(q.answer);
      if (!ans || ` ${rest} `.includes(` ${ans} `)) return { ok: false, reason: 'structure' };
      q.acceptedAnswers = [...new Set(q.acceptedAnswers.filter((a) => foldText(a) && foldText(a) !== ans))];
      break;
    }
    case 'match':
      if (!distinct(q.pairs.map((p) => p.term)) || !distinct(q.pairs.map((p) => p.definition)))
        return { ok: false, reason: 'structure' };
      break;
    case 'order':
      if (!distinct(q.steps)) return { ok: false, reason: 'structure' };
      break;
    case 'explain':
      if (!distinct(q.keyPoints)) return { ok: false, reason: 'structure' };
      break;
    case 'flashcard':
      if (foldText(q.prompt) === foldText(q.back)) return { ok: false, reason: 'structure' };
      break;
  }

  if (isDuplicate(questionKeyText(q), ctx.existing, q.prompt)) return { ok: false, reason: 'duplicate' };
  return { ok: true, question: q };
}

/** How a question and its stated answer are shown to the verifier. */
export function describeForVerifier(q: QuestionContent): string {
  const head = `[${q.type}] ${q.prompt}`;
  switch (q.type) {
    case 'mcq':
      return `${head}\nOptions: ${q.options.map((o, i) => `(${String.fromCharCode(65 + i)}) ${o}`).join(' ')}\nStated correct answer: (${String.fromCharCode(65 + q.answerIndex)}) ${q.options[q.answerIndex]}\nExplanation: ${q.explanation}`;
    case 'tf':
      return `${head}\nStated truth value: ${q.answer ? 'TRUE' : 'FALSE'}${q.correction ? `\nCorrected statement: ${q.correction}` : ''}\nExplanation: ${q.explanation}`;
    case 'fill':
      return `${head}\nStated answer for the blank: ${q.answer}${q.acceptedAnswers.length ? ` (also accepted: ${q.acceptedAnswers.join(', ')})` : ''}\nExplanation: ${q.explanation}`;
    case 'flashcard':
      return `${head}\nStated answer (back of card): ${q.back}`;
    case 'match':
      return `${head}\nStated pairs: ${q.pairs.map((p) => `"${p.term}" ↔ "${p.definition}"`).join('; ')}`;
    case 'order':
      return `${head}\nStated correct order: ${q.steps.map((s, i) => `${i + 1}) ${s}`).join(' ')}`;
    case 'explain':
      return `${head}\nModel answer: ${q.modelAnswer}\nKey points: ${q.keyPoints.join('; ')}`;
  }
}

export interface Verdict {
  supported: boolean;
  singleCorrectAnswer: boolean;
  answerCorrect: boolean;
  distractorsClearlyWrong: boolean;
  clear: boolean;
}

export function passes(v: Partial<Verdict> | undefined): boolean {
  return (
    !!v &&
    v.supported === true &&
    v.singleCorrectAnswer === true &&
    v.answerCorrect === true &&
    v.distractorsClearlyWrong === true &&
    v.clear === true
  );
}
