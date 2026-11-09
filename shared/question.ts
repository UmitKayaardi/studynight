/**
 * The question model shared by the API (validation of model output) and the app (storage, rendering).
 * Every question carries its evidence: the source chunk ids and a verbatim quote from one of them.
 */
import { z } from 'zod';

export const QUESTION_TYPES = ['mcq', 'tf', 'fill', 'flashcard', 'match', 'order', 'explain'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const LIMITS = {
  prompt: 600,
  option: 220,
  explanation: 700,
  hint: 240,
  evidenceQuote: 300,
  answer: 160,
  keyPoint: 200,
  modelAnswer: 1200,
} as const;

const text = (max: number) => z.string().trim().min(1).max(max);

const base = {
  prompt: text(LIMITS.prompt),
  explanation: text(LIMITS.explanation),
  hint: text(LIMITS.hint),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  topicId: z.string().min(1).max(64),
  sourceChunkIds: z.array(z.string().min(1).max(64)).min(1).max(6),
  evidenceQuote: text(LIMITS.evidenceQuote),
  /** Set for figure questions: the id of the page/photo image the question is about. */
  figureId: z.string().max(64).optional(),
};

export const McqSchema = z.object({
  ...base,
  type: z.literal('mcq'),
  options: z.array(text(LIMITS.option)).length(4),
  answerIndex: z.number().int().min(0).max(3),
});

export const TfSchema = z.object({
  ...base,
  type: z.literal('tf'),
  answer: z.boolean(),
  /** The corrected statement, shown when the statement is false. */
  correction: z.string().trim().max(LIMITS.prompt).optional(),
});

export const FillSchema = z.object({
  ...base,
  type: z.literal('fill'),
  answer: text(LIMITS.answer),
  acceptedAnswers: z.array(text(LIMITS.answer)).max(8).default([]),
});

export const FlashcardSchema = z.object({
  ...base,
  type: z.literal('flashcard'),
  back: text(LIMITS.explanation),
});

export const MatchSchema = z.object({
  ...base,
  type: z.literal('match'),
  pairs: z
    .array(z.object({ term: text(LIMITS.option), definition: text(LIMITS.option) }))
    .min(4)
    .max(5),
});

export const OrderSchema = z.object({
  ...base,
  type: z.literal('order'),
  /** Steps in the correct order. */
  steps: z.array(text(LIMITS.option)).min(3).max(6),
});

export const ExplainSchema = z.object({
  ...base,
  type: z.literal('explain'),
  modelAnswer: text(LIMITS.modelAnswer),
  keyPoints: z.array(text(LIMITS.keyPoint)).min(3).max(5),
});

export const QuestionContentSchema = z.discriminatedUnion('type', [
  McqSchema,
  TfSchema,
  FillSchema,
  FlashcardSchema,
  MatchSchema,
  OrderSchema,
  ExplainSchema,
]);
export type QuestionContent = z.infer<typeof QuestionContentSchema>;
export type McqQuestion = z.infer<typeof McqSchema>;
export type TfQuestion = z.infer<typeof TfSchema>;
export type FillQuestion = z.infer<typeof FillSchema>;
export type FlashcardQuestion = z.infer<typeof FlashcardSchema>;
export type MatchQuestion = z.infer<typeof MatchSchema>;
export type OrderQuestion = z.infer<typeof OrderSchema>;
export type ExplainQuestion = z.infer<typeof ExplainSchema>;

/** The text that identifies a question for duplicate detection. */
export function questionKeyText(q: QuestionContent): string {
  switch (q.type) {
    case 'mcq':
      return `${q.prompt} ${q.options[q.answerIndex]}`;
    case 'fill':
      return `${q.prompt} ${q.answer}`;
    case 'flashcard':
      return `${q.prompt} ${q.back}`;
    case 'match':
      return q.pairs.map((p) => p.term).join(' ');
    case 'order':
      return `${q.prompt} ${q.steps.join(' ')}`;
    default:
      return q.prompt;
  }
}
