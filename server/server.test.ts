// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateGuard, clientIp } from './guard';
import { backoffMs, chatJson, mapError, parseJsonObject, setChatClient, type ChatClient } from './groq';
import { repairTopics, topicRange } from './topics';
import { checkDraft, isDuplicate, passes } from './verify';
import { generateQuestions } from './questions';
import { ask, grade } from './answers';
import { ApiError } from './errors';
import { POST as topicsPost } from '../api/topics';
import { POST as questionsPost } from '../api/questions';
import { GET as health } from '../api/health';

const CHUNK =
  'Photosynthesis takes place in the chloroplasts of plant cells. It converts light energy into chemical energy stored in glucose. Oxygen is released as a by-product.';

function fakeClient(
  replies: Array<string | Error>,
): ChatClient & { calls: Array<{ model: string; system: string; user: unknown }> } {
  const calls: Array<{ model: string; system: string; user: unknown }> = [];
  return {
    calls,
    async chat(o) {
      calls.push({ model: o.model, system: o.system, user: o.user });
      const r = replies.shift();
      if (r === undefined) throw new Error('no reply');
      if (r instanceof Error) throw r;
      return r;
    },
    async transcribe() {
      return { text: 'hello', language: 'en' };
    },
  };
}

const rateLimit = () =>
  Object.assign(new Error('429'), { status: 429, headers: new Headers({ 'retry-after': '1' }) });

beforeEach(() => {
  process.env.GROQ_API_KEY = 'test-key-not-real';
});
afterEach(() => {
  setChatClient(null);
  delete process.env.GROQ_API_KEY;
});

describe('guard', () => {
  it('allows up to the limit per key and then reports a wait', () => {
    const g = new RateGuard(3, 1000);
    expect([g.check('a', 0), g.check('a', 1), g.check('a', 2)]).toEqual([0, 0, 0]);
    expect(g.check('a', 3)).toBeGreaterThan(0);
    expect(g.check('b', 3)).toBe(0);
    expect(g.check('a', 1001)).toBe(0);
  });
  it('reads the client IP from proxy headers', () => {
    expect(clientIp(new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } }))).toBe(
      '1.2.3.4',
    );
    expect(clientIp(new Request('http://x'))).toBe('unknown');
  });
});

describe('groq helpers', () => {
  it('maps errors to codes without leaking messages', () => {
    expect(mapError(rateLimit()).code).toBe('RATE_LIMITED');
    expect(mapError(Object.assign(new Error('x'), { status: 413 })).code).toBe('TOO_LARGE');
    expect(mapError(Object.assign(new Error('x'), { name: 'APIConnectionTimeoutError' })).code).toBe(
      'TIMEOUT',
    );
    expect(mapError(new Error('secret upstream details')).message).toBe('UPSTREAM');
  });
  it('backs off exponentially with jitter', () => {
    expect(backoffMs(0, 100, () => 1)).toBe(100);
    expect(backoffMs(3, 100, () => 1)).toBe(800);
    expect(backoffMs(3, 100, () => 0)).toBe(0);
  });
  it('parses JSON with fences or stray text', () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonObject('Sure! {"a":2} done')).toEqual({ a: 2 });
    expect(() => parseJsonObject('nope')).toThrow(ApiError);
  });
  it('falls back to the second model on a rate limit', async () => {
    const c = fakeClient([rateLimit(), '{"ok":true}']);
    setChatClient(c);
    const out = await chatJson({
      model: 'm1',
      fallbackModel: 'm2',
      system: 's',
      user: 'u',
      maxTokens: 10,
      timeoutMs: 5000,
    });
    expect(out).toEqual({ ok: true });
    expect(c.calls.map((x) => x.model)).toEqual(['m1', 'm2']);
  });
  it('gives up with RATE_LIMITED when every model is busy', async () => {
    setChatClient(fakeClient([rateLimit(), rateLimit(), rateLimit(), rateLimit()]));
    await expect(
      chatJson(
        { model: 'm1', fallbackModel: 'm2', system: 's', user: 'u', maxTokens: 10, timeoutMs: 2000 },
        Date.now() + 4000,
      ),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
  it('retries once on invalid JSON', async () => {
    setChatClient(fakeClient(['not json', '{"x":1}']));
    expect(await chatJson({ model: 'm', system: 's', user: 'u', maxTokens: 10, timeoutMs: 5000 })).toEqual({
      x: 1,
    });
  });
});

describe('repairTopics', () => {
  const order = ['c1', 'c2', 'c3', 'c4', 'c5'];
  it('drops unknown ids and empty topics, assigns orphans to neighbours and numbers topics', () => {
    const topics = repairTopics(
      [
        { title: 'B', summary: 's', chunkIds: ['c4', 'zzz'] },
        { title: 'A', summary: 's', chunkIds: ['c1'] },
        { title: 'Empty', summary: 's', chunkIds: ['nope'] },
      ],
      order,
    );
    expect(topics.map((t) => t.title)).toEqual(['A', 'B']);
    expect(topics.map((t) => t.id)).toEqual(['t1', 't2']);
    const all = topics.flatMap((t) => t.chunkIds);
    for (const c of order) expect(all).toContain(c);
    expect(topics[0]!.chunkIds).toEqual(['c1', 'c2', 'c3']);
  });
  it('merges duplicate titles and caps the count', () => {
    const many = order.map((c, i) => ({ title: `T${i}`, summary: '', chunkIds: [c] }));
    expect(repairTopics(many, order, 3)).toHaveLength(3);
    expect(
      repairTopics(
        [
          { title: 'X', chunkIds: ['c1'] },
          { title: 'x', chunkIds: ['c2'] },
        ],
        order,
      ),
    ).toHaveLength(1);
  });
  it('fails cleanly when the model returns nothing usable', () => {
    expect(() => repairTopics([], order)).toThrow(ApiError);
  });
  it('targets 4–15 topics for final maps when possible', () => {
    expect(topicRange(40, true)).toEqual({ min: 4, max: 15 });
    expect(topicRange(2, true)).toEqual({ min: 1, max: 1 });
    expect(topicRange(9, true).min).toBe(4);
  });
});

describe('checkDraft', () => {
  const ctx = { topicId: 't1', chunks: new Map([['c1', CHUNK]]), existing: [] as string[] };
  const mcq = {
    type: 'mcq',
    prompt: 'Where does photosynthesis take place?',
    options: ['Chloroplasts', 'Mitochondria', 'Nucleus', 'Ribosomes'],
    answerIndex: 0,
    explanation: 'The notes say it happens in chloroplasts.',
    hint: 'Think green.',
    difficulty: 1,
    sourceChunkIds: ['c1'],
    evidenceQuote: 'Photosynthesis takes place in the chloroplasts of plant cells.',
  };
  it('accepts a valid draft and forces the topic id', () => {
    const r = checkDraft({ ...mcq, topicId: 'other' }, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.question.topicId).toBe('t1');
  });
  it('rejects schema problems', () => {
    expect(checkDraft({ ...mcq, options: ['a', 'b'] }, ctx)).toEqual({ ok: false, reason: 'schema' });
    expect(checkDraft('junk', ctx)).toEqual({ ok: false, reason: 'schema' });
  });
  it('rejects evidence that is not in the notes', () => {
    expect(
      checkDraft({ ...mcq, evidenceQuote: 'Mitochondria are the powerhouse of the cell.' }, ctx),
    ).toEqual({
      ok: false,
      reason: 'evidence',
    });
  });
  it('accepts lightly different evidence and repairs the citation', () => {
    const r = checkDraft(
      {
        ...mcq,
        sourceChunkIds: ['missing'],
        evidenceQuote: 'photosynthesis takes place in the chloroplast of plant cells',
      },
      ctx,
    );
    expect(r.ok && r.question.sourceChunkIds).toEqual(['c1']);
  });
  it('rejects structural problems', () => {
    expect(checkDraft({ ...mcq, options: ['A', 'a', 'B', 'C'] }, ctx)).toMatchObject({ reason: 'structure' });
    expect(checkDraft({ ...mcq, options: ['A', 'B', 'C', 'All of the above'] }, ctx)).toMatchObject({
      reason: 'structure',
    });
    const tf = { ...mcq, type: 'tf', prompt: mcq.evidenceQuote, answer: true };
    expect(checkDraft(tf, ctx)).toMatchObject({ reason: 'structure' });
    expect(
      checkDraft({ ...tf, prompt: 'Photosynthesis happens in mitochondria.', answer: false }, ctx),
    ).toMatchObject({
      reason: 'structure',
    });
    const fill = {
      ...mcq,
      type: 'fill',
      prompt: 'Photosynthesis happens in the ____.',
      answer: 'chloroplasts',
    };
    expect(checkDraft(fill, ctx).ok).toBe(true);
    expect(checkDraft({ ...fill, prompt: 'No blank here.' }, ctx)).toMatchObject({ reason: 'structure' });
    expect(
      checkDraft({ ...fill, prompt: 'Chloroplasts: photosynthesis happens in the ____.' }, ctx),
    ).toMatchObject({
      reason: 'structure',
    });
  });
  it('rejects personal data and duplicates', () => {
    expect(checkDraft({ ...mcq, hint: 'Email jane.doe@example.com' }, ctx)).toMatchObject({
      reason: 'structure',
    });
    expect(
      checkDraft(mcq, { ...ctx, existing: ['Where does photosynthesis take place? Chloroplasts'] }),
    ).toMatchObject({
      reason: 'duplicate',
    });
    expect(
      isDuplicate('Totally different question about oxygen', ['Where does photosynthesis take place?']),
    ).toBe(false);
  });
});

describe('generateQuestions', () => {
  const draft = (prompt: string, answerIndex = 0) => ({
    type: 'mcq',
    prompt,
    options: ['Chloroplasts', 'Mitochondria', 'Nucleus', 'Ribosomes'],
    answerIndex,
    explanation: 'Stated in the notes.',
    hint: 'Green parts.',
    difficulty: 1,
    sourceChunkIds: ['c1'],
    evidenceQuote: 'Photosynthesis takes place in the chloroplasts of plant cells.',
  });
  const req = {
    language: 'en',
    topic: { id: 't1', title: 'Photosynthesis', summary: 'How plants make food.' },
    chunks: [{ id: 'c1', text: CHUNK }],
    types: ['mcq' as const],
    count: 3,
    difficulty: 1 as const,
    existing: [],
  };

  it('returns only questions that pass both checks and the verifier', async () => {
    const all = {
      supported: true,
      singleCorrectAnswer: true,
      answerCorrect: true,
      distractorsClearlyWrong: true,
      clear: true,
    };
    const c = fakeClient([
      JSON.stringify({
        questions: [
          draft('Where does photosynthesis happen?'),
          draft('Which organelle hosts photosynthesis in plant cells?'),
          { type: 'bad' },
        ],
      }),
      JSON.stringify({
        results: [
          { i: 1, ...all },
          { i: 2, ...all, answerCorrect: false, reason: 'x' },
        ],
      }),
    ]);
    setChatClient(c);
    const res = await generateQuestions(req);
    expect(res.questions).toHaveLength(1);
    expect(res.questions[0]!.prompt).toBe('Where does photosynthesis happen?');
    expect(res.rejected).toMatchObject({ schema: 1, verifier: 1 });
    expect(res.drafted).toBe(3);
    // The verifier is a different model and sees the sources wrapped as data.
    expect(c.calls[1]!.model).not.toBe(c.calls[0]!.model);
    expect(String(c.calls[1]!.user)).toContain('<<<SOURCE id="c1">>>');
  });

  it('skips the verifier when no draft survives the checks', async () => {
    const c = fakeClient([JSON.stringify({ questions: [] })]);
    setChatClient(c);
    const res = await generateQuestions(req);
    expect(res.questions).toEqual([]);
    expect(c.calls).toHaveLength(1);
  });

  it('marks figure questions with the figure id', async () => {
    const all = {
      supported: true,
      singleCorrectAnswer: true,
      answerCorrect: true,
      distractorsClearlyWrong: true,
      clear: true,
    };
    const fig = {
      ...draft('What does the diagram label as the site of photosynthesis?'),
      sourceChunkIds: ['fig:img1'],
      evidenceQuote: 'The diagram labels the chloroplast',
    };
    setChatClient(
      fakeClient([JSON.stringify({ questions: [fig] }), JSON.stringify({ results: [{ i: 1, ...all }] })]),
    );
    const res = await generateQuestions({
      ...req,
      figure: {
        id: 'img1',
        description: 'The diagram labels the chloroplast as the site of photosynthesis.',
      },
    });
    expect(res.questions[0]!.figureId).toBe('img1');
  });

  it('requires every verifier flag', () => {
    expect(
      passes({
        supported: true,
        singleCorrectAnswer: true,
        answerCorrect: true,
        distractorsClearlyWrong: true,
        clear: true,
      }),
    ).toBe(true);
    expect(passes({ supported: true })).toBe(false);
    expect(passes(undefined)).toBe(false);
  });
});

describe('grade and ask', () => {
  it('pads grader output to the key points and computes nothing else', async () => {
    setChatClient(fakeClient([JSON.stringify({ covered: [true], feedback: ['', 'Mention oxygen.'] })]));
    const r = await grade({
      language: 'en',
      question: 'q',
      keyPoints: ['a', 'b'],
      modelAnswer: 'm',
      evidence: [CHUNK],
      answer: 'answer',
    });
    expect(r).toEqual({ covered: [true, false], feedback: ['', 'Mention oxygen.'] });
  });
  it('does not call the model for an empty answer', async () => {
    const c = fakeClient([]);
    setChatClient(c);
    const r = await grade({
      language: 'en',
      question: 'q',
      keyPoints: ['a'],
      modelAnswer: 'm',
      evidence: [CHUNK],
      answer: '  ',
    });
    expect(r.covered).toEqual([false]);
    expect(c.calls).toHaveLength(0);
  });
  it('keeps only valid citations and refuses uncited answers', async () => {
    setChatClient(
      fakeClient([JSON.stringify({ found: true, answer: 'In chloroplasts [1][9].', citations: [1, 9] })]),
    );
    expect(await ask({ language: 'en', question: 'Where?', passages: [{ n: 1, text: CHUNK }] })).toEqual({
      found: true,
      answer: 'In chloroplasts [1][9].',
      citations: [1],
    });
    setChatClient(fakeClient([JSON.stringify({ found: true, answer: 'A guess.', citations: [] })]));
    expect((await ask({ language: 'en', question: 'Where?', passages: [{ n: 1, text: CHUNK }] })).found).toBe(
      false,
    );
  });
});

describe('HTTP handlers', () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request('http://localhost/api/topics', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}`,
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  it('rejects wrong methods, content types, invalid JSON and invalid schemas', async () => {
    expect((await topicsPost(new Request('http://x', { method: 'GET' }))).status).toBe(400);
    expect((await topicsPost(post('{}', { 'content-type': 'text/plain' }))).status).toBe(400);
    expect((await topicsPost(post('{bad'))).status).toBe(400);
    const r = await topicsPost(post({ stage: 'map', language: 'en', chunks: [] }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: { code: 'BAD_INPUT', message: expect.any(String) } });
  });

  it('rejects oversized bodies', async () => {
    expect((await questionsPost(post('x', { 'content-length': '9999999' }))).status).toBe(413);
  });

  it('returns a validated topic map', async () => {
    setChatClient(
      fakeClient([
        JSON.stringify({
          language: 'en',
          topics: [{ title: 'Light', summary: 'About light.', chunkIds: ['a', 'b'] }],
        }),
      ]),
    );
    const r = await topicsPost(
      post({
        stage: 'map',
        language: 'auto',
        chunks: [
          { id: 'a', summary: 'x' },
          { id: 'b', summary: 'y' },
        ],
      }),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      topics: [{ id: 't1', title: 'Light', summary: 'About light.', chunkIds: ['a', 'b'] }],
      detectedLanguage: 'en',
    });
  });

  it('never leaks upstream error details', async () => {
    setChatClient(fakeClient([new Error('upstream secret: request body ...'), new Error('again')]));
    const r = await topicsPost(post({ stage: 'map', language: 'en', chunks: [{ id: 'a', summary: 'x' }] }));
    const text = await r.text();
    expect(r.status).toBe(502);
    expect(text).not.toContain('secret');
  });

  it('reports a missing key without exposing anything', async () => {
    delete process.env.GROQ_API_KEY;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await topicsPost(post({ stage: 'map', language: 'en', chunks: [{ id: 'a', summary: 'x' }] }));
    expect(r.status).toBe(502);
    expect(spy.mock.calls.join(' ')).not.toContain('summary');
  });

  it('health shows models but never the key', async () => {
    const body = await health().json();
    expect(body.configured).toBe(true);
    expect(JSON.stringify(body)).not.toContain('test-key');
  });
});

describe('normaliseLanguage', () => {
  it('maps Whisper language names to codes', async () => {
    const { normaliseLanguage } = await import('./answers');
    expect(normaliseLanguage('English')).toBe('en');
    expect(normaliseLanguage('turkish')).toBe('tr');
    expect(normaliseLanguage('ja')).toBe('ja');
    expect(normaliseLanguage('')).toBe('und');
    expect(normaliseLanguage('klingon')).toBe('und');
  });
});

describe('normaliseDraft', () => {
  it('strips "front:"/"back:" labels from flashcards', async () => {
    const { normaliseDraft } = await import('./verify');
    const d = normaliseDraft({ type: 'flashcard', prompt: 'Front: What is X?', back: 'Back: Y' }, 't') as {
      prompt: string;
      back: string;
    };
    expect(d.prompt).toBe('What is X?');
    expect(d.back).toBe('Y');
  });
});

describe('JSON and LaTeX repair', () => {
  it('repairs invalid escapes and swallowed LaTeX commands', async () => {
    const { parseJsonObject, repairLatex, failedGeneration } = await import('./groq');
    expect(parseJsonObject(String.raw`{"q":"Solve \( x \) and $\alpha$"}`)).toEqual({
      q: String.raw`Solve \( x \) and $\alpha$`,
    });
    expect(parseJsonObject(String.raw`{"q":"$a \times b$ and $\frac{1}{2}$ and $x \neq y$"}`)).toEqual({
      q: String.raw`$a \times b$ and $\frac{1}{2}$ and $x \neq y$`,
    });
    expect(repairLatex('Line one\nline two')).toBe('Line one\nline two');
    expect(
      failedGeneration({ error: { error: { code: 'json_validate_failed', failed_generation: '{"a":1}' } } }),
    ).toBe('{"a":1}');
    expect(failedGeneration(new Error('x'))).toBeNull();
  });
  it('recovers from a json_validate_failed error using the failed generation', async () => {
    const err = Object.assign(new Error('400'), {
      status: 400,
      error: { error: { code: 'json_validate_failed', failed_generation: String.raw`{"ok":"$\beta$"}` } },
    });
    setChatClient(fakeClient([err]));
    expect(await chatJson({ model: 'm', system: 's', user: 'u', maxTokens: 10, timeoutMs: 5000 })).toEqual({
      ok: String.raw`$\beta$`,
    });
  });
});

describe('draft repairs', () => {
  it('wraps undelimited LaTeX options and treats identical prompts as duplicates', async () => {
    const { normaliseDraft, isDuplicate, wrapLatex } = await import('./verify');
    const d = normaliseDraft(
      { type: 'mcq', options: ['6CO_2 \rightarrow C_6H_{12}O_6', 'plain text', '$x$', 'a_{1}'] },
      't',
    ) as { options: string[] };
    expect(d.options).toEqual(['$6CO_2 \rightarrow C_6H_{12}O_6$', 'plain text', '$x$', '$a_{1}$']);
    expect(wrapLatex('Use \n in code')).toBe('Use \n in code');
    expect(isDuplicate('Stoma Leaf pores that take in CO2', ['Stoma Small pores in leaves'], 'Stoma')).toBe(
      true,
    );
    expect(isDuplicate('Stomata open in daylight', ['Stoma Small pores'], 'Stomata open')).toBe(false);
  });
});
