import { describe, expect, it } from 'vitest';
import { compressToEncodedURIComponent } from 'lz-string';
import { createChallengeLink, MAX_LINK_LENGTH, parseChallenge } from './challenge';
import type { QuestionContent } from '../../shared/question';

const base = {
  explanation: 'Because the notes say so.',
  hint: 'h',
  difficulty: 2 as const,
  topicId: 't',
  sourceChunkIds: ['secret-chunk'],
  evidenceQuote: 'SECRET SOURCE PASSAGE',
};
const mcq = (i: number): QuestionContent => ({
  ...base,
  type: 'mcq',
  prompt: `Question number ${i} about the solar system?`,
  options: ['Mercury', 'Venus', 'Earth', 'Mars'],
  answerIndex: i % 4,
});

describe('challenge links', () => {
  it('round-trips questions without source passages', () => {
    const link = createChallengeLink('https://x.app', {
      nickname: 'Ada',
      avatar: 3,
      results: [
        { content: mcq(1), correct: true },
        {
          content: {
            ...base,
            type: 'tf',
            prompt: 'The Sun is a planet.',
            answer: false,
            correction: 'It is a star.',
          },
          correct: false,
        },
        {
          content: { ...base, type: 'explain', prompt: 'Why?', modelAnswer: 'm', keyPoints: ['a', 'b', 'c'] },
          correct: true,
        },
      ],
    })!;
    expect(link.url.startsWith('https://x.app/challenge#c=')).toBe(true);
    expect(link.count).toBe(2); // explain questions are skipped
    expect(decodeURIComponent(link.url)).not.toContain('SECRET');
    const data = parseChallenge(new URL(link.url).hash)!;
    expect(data).toMatchObject({ nickname: 'Ada', avatar: 3, score: 1 });
    expect(data.questions[0]).toMatchObject({ type: 'mcq', answerIndex: 1, evidenceQuote: '' });
    expect(data.questions[1]).toMatchObject({ type: 'tf', answer: false, correction: 'It is a star.' });
  });

  it('reduces the number of questions to stay under the length limit', () => {
    const results = Array.from({ length: 10 }, (_, i) => ({
      content: {
        ...mcq(i),
        prompt: Array.from({ length: 30 }, () => Math.random().toString(36).slice(2, 8)).join(' '),
      },
      correct: true,
    }));
    const link = createChallengeLink('https://studynight.example', { nickname: 'Bo', avatar: 0, results })!;
    expect(link.url.length).toBeLessThanOrEqual(MAX_LINK_LENGTH);
    expect(link.count).toBeLessThan(10);
    expect(link.count).toBeGreaterThan(0);
  });

  it('rejects malformed links gracefully', () => {
    expect(parseChallenge('')).toBeNull();
    expect(parseChallenge('#c=!!!notvalid')).toBeNull();
    expect(
      parseChallenge('#c=' + compressToEncodedURIComponent('{"v":1,"n":"x","av":0,"sc":0,"q":[]}')),
    ).toBeNull();
    expect(
      parseChallenge(
        '#c=' +
          compressToEncodedURIComponent('{"v":1,"n":"x","av":0,"sc":0,"q":[{"t":"html","p":"<script>"}]}'),
      ),
    ).toBeNull();
    // Scores can never exceed the number of questions.
    const weird = compressToEncodedURIComponent(
      JSON.stringify({ v: 1, n: 'x', av: 0, sc: 9, q: [{ t: 'tf', p: 'p', a: true, e: '' }] }),
    );
    expect(parseChallenge('#c=' + weird)!.score).toBe(1);
  });
});
