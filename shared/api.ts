/**
 * API contract shared by the serverless functions and the app. Every request and response is validated with
 * these schemas on both sides. Only text chunks (never whole files) and resized images/short audio are sent.
 */
import { z } from 'zod';
import { QUESTION_TYPES, QuestionContentSchema } from './question.js';

export const ERROR_CODES = [
  'RATE_LIMITED',
  'TOO_LARGE',
  'BAD_INPUT',
  'UNREADABLE',
  'UPSTREAM',
  'TIMEOUT',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
export const ErrorBodySchema = z.object({
  error: z.object({ code: z.enum(ERROR_CODES), message: z.string() }),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

/** Requests above this size are rejected (Vercel's body limit is 4.5 MB). */
export const MAX_BODY_BYTES = 4_000_000;

const id = z.string().min(1).max(64);
/** A language code like "en", "pt-BR", "zh-CN", or "auto" (= same as the notes). */
export const LanguageSchema = z
  .string()
  .regex(/^(auto|[a-z]{2,3}(-[A-Za-z0-9]{2,8})?)$/)
  .max(16);

// ---- /api/topics -------------------------------------------------------------------------------------------

export const TopicsMapRequestSchema = z.object({
  stage: z.literal('map'),
  language: LanguageSchema,
  /** Compact chunk summaries: headings + first sentences. Never the full deck at once. */
  chunks: z
    .array(z.object({ id, summary: z.string().min(1).max(700) }))
    .min(1)
    .max(80),
  /** True when this batch is the whole deck (no reduce stage follows): the result is the final topic map. */
  final: z.boolean().default(true),
});
export const TopicsReduceRequestSchema = z.object({
  stage: z.literal('reduce'),
  language: LanguageSchema,
  /** Partial topics from the map stage. */
  topics: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        summary: z.string().max(300),
        chunkIds: z.array(id).min(1).max(400),
      }),
    )
    .min(1)
    .max(150),
  /** All chunk ids of the deck, in document order. */
  chunkIds: z.array(id).min(1).max(2000),
});
export const TopicsRequestSchema = z.discriminatedUnion('stage', [
  TopicsMapRequestSchema,
  TopicsReduceRequestSchema,
]);
export type TopicsRequest = z.infer<typeof TopicsRequestSchema>;

export const TopicSchema = z.object({
  id,
  title: z.string().min(1).max(120),
  summary: z.string().max(300),
  chunkIds: z.array(id).min(1),
});
export type Topic = z.infer<typeof TopicSchema>;
export const TopicsResponseSchema = z.object({
  topics: z.array(TopicSchema).min(1),
  /** Language of the notes as judged by the model (BCP-47), or "und". */
  detectedLanguage: z.string().max(16),
});
export type TopicsResponse = z.infer<typeof TopicsResponseSchema>;

// ---- /api/questions ----------------------------------------------------------------------------------------

export const SourceChunkSchema = z.object({ id, text: z.string().min(1).max(4000) });
export type SourceChunk = z.infer<typeof SourceChunkSchema>;

export const QuestionsRequestSchema = z.object({
  language: LanguageSchema,
  topic: z.object({ id, title: z.string().min(1).max(120), summary: z.string().max(300) }),
  chunks: z.array(SourceChunkSchema).min(1).max(6),
  types: z.array(z.enum(QUESTION_TYPES)).min(1).max(QUESTION_TYPES.length),
  count: z.number().int().min(1).max(8),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** Prompts of questions that already exist for this topic — the model must not repeat them. */
  existing: z.array(z.string().max(240)).max(60).default([]),
  /** For figure questions: the image id and its vision description (the description is the evidence chunk). */
  figure: z.object({ id, description: z.string().min(1).max(3000) }).optional(),
});
export type QuestionsRequest = z.infer<typeof QuestionsRequestSchema>;

export const REJECT_REASONS = ['schema', 'evidence', 'structure', 'duplicate', 'verifier'] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];
export const QuestionsResponseSchema = z.object({
  questions: z.array(QuestionContentSchema),
  rejected: z.record(z.enum(REJECT_REASONS), z.number().int().min(0)),
  drafted: z.number().int().min(0),
});
export type QuestionsResponse = z.infer<typeof QuestionsResponseSchema>;

// ---- /api/grade --------------------------------------------------------------------------------------------

export const GradeRequestSchema = z.object({
  language: LanguageSchema,
  question: z.string().min(1).max(600),
  keyPoints: z.array(z.string().min(1).max(200)).min(1).max(5),
  modelAnswer: z.string().max(1200),
  evidence: z.array(z.string().min(1).max(4000)).min(1).max(3),
  answer: z.string().max(2500),
});
export type GradeRequest = z.infer<typeof GradeRequestSchema>;
export const GradeResponseSchema = z.object({
  covered: z.array(z.boolean()),
  /** One short sentence per key point (empty for covered points). */
  feedback: z.array(z.string().max(300)),
});
export type GradeResponse = z.infer<typeof GradeResponseSchema>;

// ---- /api/ask ----------------------------------------------------------------------------------------------

export const AskRequestSchema = z.object({
  language: LanguageSchema,
  question: z.string().min(1).max(500),
  passages: z
    .array(z.object({ n: z.number().int().min(1).max(20), text: z.string().min(1).max(4000) }))
    .min(1)
    .max(8),
});
export type AskRequest = z.infer<typeof AskRequestSchema>;
export const AskResponseSchema = z.object({
  found: z.boolean(),
  answer: z.string().max(2500),
  citations: z.array(z.number().int().min(1).max(20)),
});
export type AskResponse = z.infer<typeof AskResponseSchema>;

// ---- /api/read-image ---------------------------------------------------------------------------------------

/** Base64 JPEG/PNG/WebP, already resized in the browser (≤ 1,600 px, ~0.8 quality). */
export const ReadImageRequestSchema = z.object({
  image: z.string().min(100).max(3_000_000),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  languageHint: LanguageSchema.optional(),
});
export type ReadImageRequest = z.infer<typeof ReadImageRequestSchema>;
export const ReadImageResponseSchema = z.object({
  /** Structured text (Markdown headings/bullets, formulas in LaTeX). Empty when the image has no readable text. */
  text: z.string().max(20_000),
  hasFigure: z.boolean(),
  /** Factual description of the figure/diagram/chart, used as evidence for figure questions. */
  figureDescription: z.string().max(3000),
  language: z.string().max(16),
});
export type ReadImageResponse = z.infer<typeof ReadImageResponseSchema>;

// ---- /api/transcribe ---------------------------------------------------------------------------------------

export const AUDIO_MIME = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mpeg',
] as const;
export const TranscribeRequestSchema = z.object({
  /** Base64 audio, at most ~90 seconds. */
  audio: z.string().min(100).max(3_000_000),
  mime: z.enum(AUDIO_MIME),
  durationMs: z.number().int().min(0).max(91_000),
  /** Vocabulary hint: topic titles and key terms. */
  prompt: z.string().max(600).default(''),
  language: LanguageSchema.optional(),
});
export type TranscribeRequest = z.infer<typeof TranscribeRequestSchema>;
export const TranscribeResponseSchema = z.object({
  text: z.string().max(5000),
  language: z.string().max(16),
});
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;

// ---- /api/health -------------------------------------------------------------------------------------------

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  configured: z.boolean(),
  models: z.object({ generator: z.string(), verifier: z.string(), vision: z.string(), stt: z.string() }),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
