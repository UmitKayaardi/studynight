/**
 * Builds the sample decks: runs the real pipeline (chunker → topic map → generation → deterministic checks →
 * verifier) over the original notes in samples/notes/, then writes src/samples/<id>.json. The output is
 * reviewed by hand before shipping: generated decks go to samples/generated/, and scripts/apply-sample-review.mjs
 * applies the review (samples/review.json) and writes the shipped decks to src/samples/.
 * Usage: node scripts/run-ts.mjs scripts/build-samples.ts [sampleId ...]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { textToBlocks } from '../src/lib/ingest/text';
import { cleanBlocks } from '../src/lib/ingest/clean';
import { chunkBlocks } from '../src/lib/ingest/chunk';
import { chunkSummary } from '../src/lib/deck/summary';
import { roundChunks, roundTypes } from '../src/lib/deck/rounds';
import { buildTopics } from '../server/topics';
import { generateQuestions } from '../server/questions';
import { ApiError } from '../server/errors';
import { questionKeyText, type QuestionContent } from '../shared/question';
import type { SampleDeck } from '../src/lib/samples';

export const SAMPLES = [
  {
    id: 'solar-system',
    file: 'solar-system.md',
    title: 'The Solar System',
    language: 'en',
    description:
      'How the Solar System formed, the Sun, the eight planets and the smaller bodies around them.',
  },
  {
    id: 'vaccines',
    file: 'vaccines.md',
    title: 'How Vaccines Work',
    language: 'en',
    description:
      'The immune system, immune memory and how vaccines use it. General science, not medical advice.',
  },
  {
    id: 'machine-learning',
    file: 'machine-learning.md',
    title: 'Intro to Machine Learning',
    language: 'en',
    description:
      'Types of learning, linear regression, gradient descent, overfitting and evaluation — with formulas and code.',
  },
  {
    id: 'personal-finance',
    file: 'personal-finance.md',
    title: 'Basics of Personal Finance',
    language: 'en',
    description:
      'Budgeting, saving, interest, inflation, borrowing and risk. Concepts only, not financial advice.',
  },
  {
    id: 'fotosentez',
    file: 'fotosentez.md',
    title: 'Fotosentez',
    language: 'tr',
    description: 'Bitkilerin ışık enerjisini kimyasal enerjiye nasıl dönüştürdüğü.',
  },
  {
    id: 'ciclo-del-agua',
    file: 'ciclo-del-agua.md',
    title: 'El ciclo del agua',
    language: 'es',
    description: 'Evaporación, condensación, precipitación y escorrentía.',
  },
];

const PER_TOPIC = 9;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (
        attempt >= 12 ||
        !(e instanceof ApiError) ||
        !['RATE_LIMITED', 'TIMEOUT', 'UPSTREAM'].includes(e.code)
      )
        throw e;
      // Daily token caps answer with a long retry-after: wait it out (up to 15 minutes) instead of failing.
      const wait = e.retryAfter ? Math.min(900, e.retryAfter + 5) * 1000 : 15_000 + attempt * 10_000;
      console.log(`  waiting ${Math.round(wait / 1000)} s (${e.code})`);
      await sleep(wait);
    }
  }
}

export default async function main(args: string[]) {
  const rejectedFile = 'samples/rejected.json';
  const rejected: string[] = existsSync(rejectedFile) ? JSON.parse(readFileSync(rejectedFile, 'utf8')) : [];
  const only = args.length ? SAMPLES.filter((s) => args.includes(s.id)) : SAMPLES;
  for (const s of only) {
    const md = readFileSync(`samples/notes/${s.file}`, 'utf8');
    const chunks = chunkBlocks(cleanBlocks(textToBlocks(md, 'sample', true)));
    const ids = chunks.map((c) => `c${c.index}`);
    const topics = (
      await withRetry(() =>
        buildTopics({
          stage: 'map',
          language: s.language,
          final: true,
          chunks: chunks.map((c, i) => ({ id: ids[i]!, summary: chunkSummary(c) })),
        }),
      )
    ).topics;
    console.log(`${s.id}: ${chunks.length} chunks, ${topics.length} topics`);
    const questions: SampleDeck['questions'] = [];
    for (const topic of topics) {
      const topicChunks = topic.chunkIds.map((id) => ({ id, text: chunks[Number(id.slice(1))]!.text }));
      const mine: QuestionContent[] = [];
      for (let round = 0; round < 2 && mine.length < PER_TOPIC; round++) {
        const res = await withRetry(() =>
          generateQuestions({
            language: s.language,
            topic: { id: topic.id, title: topic.title, summary: topic.summary },
            chunks: roundChunks(topicChunks, round),
            types: roundTypes(round),
            count: 6,
            difficulty: ((round % 3) + 1) as 1 | 2 | 3,
            existing: mine.map((q) => questionKeyText(q).slice(0, 240)),
          }),
        );
        for (const q of res.questions) if (!rejected.includes(q.prompt)) mine.push(q);
        process.stdout.write(`  ${topic.title}: +${res.questions.length} (drafted ${res.drafted})\n`);
      }
      questions.push(...mine.map((content) => ({ topic: topic.id, content })));
    }
    const deck: SampleDeck = {
      id: s.id,
      title: s.title,
      language: s.language,
      description: s.description,
      source: s.file,
      chunks: chunks.map((c) => ({ text: c.text, headingPath: c.headingPath, wordCount: c.wordCount })),
      topics: topics.map((t) => ({
        key: t.id,
        title: t.title,
        summary: t.summary,
        chunks: t.chunkIds.map((id) => Number(id.slice(1))),
      })),
      questions,
    };
    writeFileSync(`samples/generated/${s.id}.json`, JSON.stringify(deck, null, 1) + '\n');
    console.log(`${s.id}: ${questions.length} questions written`);
  }
  console.log(
    'Now review the questions, record edits in samples/review.json and run node scripts/apply-sample-review.mjs',
  );
}
