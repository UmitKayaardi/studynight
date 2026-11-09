import { describe, expect, it } from 'vitest';
import { answerText, evaluate, explainLevel } from './check';
import type { QuestionContent } from '../../../shared/question';

const base = {
  explanation: 'e',
  hint: 'h',
  difficulty: 1 as const,
  topicId: 't',
  sourceChunkIds: ['c'],
  evidenceQuote: 'q',
};
const L = { true: 'True', false: 'False' };

describe('evaluate', () => {
  it('multiple choice', () => {
    const q: QuestionContent = {
      ...base,
      type: 'mcq',
      prompt: 'p',
      options: ['a', 'b', 'c', 'd'],
      answerIndex: 2,
    };
    expect(evaluate(q, { type: 'mcq', choice: 2 })).toEqual({ correct: true, score: 1 });
    expect(evaluate(q, { type: 'mcq', choice: 1 }).correct).toBe(false);
    expect(evaluate(q, { type: 'tf', value: true }).correct).toBe(false);
    expect(answerText(q, L)).toBe('c');
  });
  it('true/false with correction text', () => {
    const q: QuestionContent = { ...base, type: 'tf', prompt: 'p', answer: false, correction: 'Actually x.' };
    expect(evaluate(q, { type: 'tf', value: false }).correct).toBe(true);
    expect(answerText(q, L)).toBe('False — Actually x.');
  });
  it('fill-in with typo tolerance flag', () => {
    const q: QuestionContent = {
      ...base,
      type: 'fill',
      prompt: 'The ____.',
      answer: 'chloroplast',
      acceptedAnswers: [],
    };
    expect(evaluate(q, { type: 'fill', text: 'Chloroplast' })).toEqual({
      correct: true,
      score: 1,
      typoAccepted: false,
    });
    expect(evaluate(q, { type: 'fill', text: 'cloroplast' })).toEqual({
      correct: true,
      score: 1,
      typoAccepted: true,
    });
    expect(evaluate(q, { type: 'fill', text: 'nucleus' }).correct).toBe(false);
  });
  it('flashcards use the self-grade', () => {
    const q: QuestionContent = { ...base, type: 'flashcard', prompt: 'p', back: 'b' };
    expect(evaluate(q, { type: 'flashcard', grade: 'again' }).correct).toBe(false);
    expect(evaluate(q, { type: 'flashcard', grade: 'hard' }).correct).toBe(true);
  });
  it('match and order give partial credit', () => {
    const m: QuestionContent = {
      ...base,
      type: 'match',
      prompt: 'p',
      pairs: [0, 1, 2, 3].map((i) => ({ term: `t${i}`, definition: `d${i}` })),
    };
    expect(evaluate(m, { type: 'match', pairs: [0, 1, 2, 3] })).toEqual({ correct: true, score: 1 });
    expect(evaluate(m, { type: 'match', pairs: [1, 0, 2, 3] })).toEqual({ correct: false, score: 0.5 });
    const o: QuestionContent = { ...base, type: 'order', prompt: 'p', steps: ['a', 'b', 'c'] };
    expect(evaluate(o, { type: 'order', order: [0, 1, 2] }).correct).toBe(true);
    expect(evaluate(o, { type: 'order', order: [0, 2, 1] }).score).toBeCloseTo(1 / 3);
  });
  it('explain answers are scored by code from covered key points', () => {
    const q: QuestionContent = {
      ...base,
      type: 'explain',
      prompt: 'p',
      modelAnswer: 'm',
      keyPoints: ['a', 'b', 'c', 'd', 'e'],
    };
    expect(evaluate(q, { type: 'explain', covered: [true, true, true, true, false] })).toEqual({
      correct: true,
      score: 0.8,
    });
    expect(evaluate(q, { type: 'explain', covered: [true, true, false, false, false] }).correct).toBe(false);
    expect(explainLevel(0.8)).toBe('great');
    expect(explainLevel(0.4)).toBe('partly');
    expect(explainLevel(0.2)).toBe('notYet');
  });
});
