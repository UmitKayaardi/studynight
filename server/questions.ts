/**
 * Question generation and verification. The client receives only questions that passed both the
 * deterministic checks and the independent verifier model, plus rejection counts.
 */
import type { QuestionsRequest, QuestionsResponse, RejectReason } from '../shared/api.js';
import { questionKeyText, type QuestionContent } from '../shared/question.js';
import { getConfig } from './env.js';
import { chatJson } from './groq.js';
import { questionsSystem, questionsUser, VERIFY_SYSTEM, verifyUser } from './prompts.js';
import { checkDraft, describeForVerifier, passes, type Verdict } from './verify.js';

export const FIGURE_CHUNK_PREFIX = 'fig:';

export async function generateQuestions(req: QuestionsRequest): Promise<QuestionsResponse> {
  const cfg = getConfig();
  const sources = req.chunks.map((c) => ({ id: c.id, text: c.text }));
  if (req.figure) sources.push({ id: FIGURE_CHUNK_PREFIX + req.figure.id, text: req.figure.description });
  const chunks = new Map(sources.map((s) => [s.id, s.text]));

  const rejected: Record<RejectReason, number> = {
    schema: 0,
    evidence: 0,
    structure: 0,
    duplicate: 0,
    verifier: 0,
  };
  const draftOut = (await chatJson({
    model: cfg.generator,
    fallbackModel: cfg.generatorFallback,
    system: questionsSystem(req.language, req.types),
    user: questionsUser({
      topicTitle: req.topic.title,
      topicSummary: req.topic.summary,
      count: req.count,
      types: req.types,
      difficulty: req.difficulty,
      existing: req.existing,
      sources,
      figure: !!req.figure,
    }),
    temperature: 0.5,
    maxTokens: 6000,
    timeoutMs: 40_000,
    reasoningEffort: 'medium',
  })) as { questions?: unknown };
  const drafts = Array.isArray(draftOut.questions) ? draftOut.questions.slice(0, req.count + 2) : [];

  // 1. Deterministic checks (dedupe against existing questions and earlier drafts in this batch).
  const accepted: QuestionContent[] = [];
  const seen = [...req.existing];
  for (const raw of drafts) {
    const r = checkDraft(raw, { topicId: req.topic.id, chunks, existing: seen });
    if (!r.ok) {
      rejected[r.reason]++;
      continue;
    }
    if (!req.types.includes(r.question.type)) {
      rejected.structure++;
      continue;
    }
    seen.push(questionKeyText(r.question));
    accepted.push(r.question);
  }
  if (!accepted.length) return { questions: [], rejected, drafted: drafts.length };

  // 2. Independent model check, given only the evidence chunks and the questions.
  const usedIds = new Set(accepted.flatMap((q) => q.sourceChunkIds));
  const evidence = sources.filter((s) => usedIds.has(s.id));
  const verdictOut = (await chatJson({
    model: cfg.verifier,
    fallbackModel: cfg.verifierFallback,
    system: VERIFY_SYSTEM,
    user: verifyUser(evidence, accepted.map(describeForVerifier)),
    temperature: 0,
    maxTokens: 2500,
    timeoutMs: 30_000,
    reasoningEffort: 'medium',
  })) as { results?: unknown };
  const results = Array.isArray(verdictOut.results)
    ? (verdictOut.results as Array<Partial<Verdict> & { i?: unknown }>)
    : [];
  const byIndex = new Map<number, Partial<Verdict>>();
  results.forEach((r, k) => byIndex.set(typeof r.i === 'number' ? r.i : Number(r.i) || k + 1, r));

  const questions: QuestionContent[] = [];
  accepted.forEach((q, k) => {
    if (passes(byIndex.get(k + 1))) {
      const figureChunk = q.sourceChunkIds.find((id) => id.startsWith(FIGURE_CHUNK_PREFIX));
      if (figureChunk) {
        q.figureId = figureChunk.slice(FIGURE_CHUNK_PREFIX.length);
        q.sourceChunkIds = q.sourceChunkIds.filter((id) => !id.startsWith(FIGURE_CHUNK_PREFIX));
        if (!q.sourceChunkIds.length) q.sourceChunkIds = [figureChunk];
      }
      questions.push(q);
    } else rejected.verifier++;
  });
  return { questions, rejected, drafted: drafts.length };
}
