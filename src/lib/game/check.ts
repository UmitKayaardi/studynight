/** Deterministic answer evaluation for every question type. The model never decides scores. */
import type { QuestionContent } from '../../../shared/question';
import { checkFillAnswer } from '../../../shared/text';
import type { SelfGrade } from '../learning/fsrs';

export type AnswerInput =
  | { type: 'mcq'; choice: number }
  | { type: 'tf'; value: boolean }
  | { type: 'fill'; text: string }
  | { type: 'flashcard'; grade: SelfGrade }
  /** For each term (original index), the chosen definition (original index). */
  | { type: 'match'; pairs: number[] }
  /** Original step indices in the order the learner arranged them. */
  | { type: 'order'; order: number[] }
  /** Explain: which key points the grader found covered. */
  | { type: 'explain'; covered: boolean[] };

export interface Evaluation {
  correct: boolean;
  /** 0..1 — partial credit for match/order/explain, 1/0 otherwise. */
  score: number;
  /** Fill-in: matched only thanks to typo tolerance. */
  typoAccepted?: boolean;
}

export type ExplainLevel = 'great' | 'partly' | 'notYet';
export function explainLevel(score: number): ExplainLevel {
  if (score >= 0.8) return 'great';
  if (score >= 0.4) return 'partly';
  return 'notYet';
}

export function evaluate(q: QuestionContent, a: AnswerInput): Evaluation {
  switch (q.type) {
    case 'mcq': {
      const ok = a.type === 'mcq' && a.choice === q.answerIndex;
      return { correct: ok, score: ok ? 1 : 0 };
    }
    case 'tf': {
      const ok = a.type === 'tf' && a.value === q.answer;
      return { correct: ok, score: ok ? 1 : 0 };
    }
    case 'fill': {
      if (a.type !== 'fill') return { correct: false, score: 0 };
      const r = checkFillAnswer(a.text, q.answer, q.acceptedAnswers);
      return { correct: r.correct, score: r.correct ? 1 : 0, typoAccepted: r.correct && !r.exact };
    }
    case 'flashcard': {
      const ok = a.type === 'flashcard' && a.grade !== 'again';
      return { correct: ok, score: ok ? 1 : 0 };
    }
    case 'match': {
      if (a.type !== 'match') return { correct: false, score: 0 };
      const right = q.pairs.filter((_, i) => a.pairs[i] === i).length;
      return { correct: right === q.pairs.length, score: right / q.pairs.length };
    }
    case 'order': {
      if (a.type !== 'order') return { correct: false, score: 0 };
      const right = q.steps.filter((_, i) => a.order[i] === i).length;
      return { correct: right === q.steps.length, score: right / q.steps.length };
    }
    case 'explain': {
      if (a.type !== 'explain' || !q.keyPoints.length) return { correct: false, score: 0 };
      const score = a.covered.filter(Boolean).length / q.keyPoints.length;
      return { correct: score >= 0.6, score };
    }
  }
}

/** The correct answer as plain text (feedback, flashcard backs, challenge links). */
export function answerText(q: QuestionContent, labels: { true: string; false: string }): string {
  switch (q.type) {
    case 'mcq':
      return q.options[q.answerIndex]!;
    case 'tf':
      return q.answer ? labels.true : `${labels.false}${q.correction ? ` — ${q.correction}` : ''}`;
    case 'fill':
      return q.answer;
    case 'flashcard':
      return q.back;
    case 'match':
      return q.pairs.map((p) => `${p.term} → ${p.definition}`).join('\n');
    case 'order':
      return q.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
    case 'explain':
      return q.modelAnswer;
  }
}
