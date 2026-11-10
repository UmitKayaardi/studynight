import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SampleSchema } from '../../src/lib/samples';
import samples from '../../src/samples/index';

const dir = 'src/samples';
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

describe('shipped sample decks', () => {
  it('every deck in the index has a file, and the counts match', () => {
    expect(samples.map((s) => `${s.id}.json`).sort()).toEqual([...files].sort());
    for (const s of samples) {
      const deck = SampleSchema.parse(JSON.parse(readFileSync(`${dir}/${s.id}.json`, 'utf8')));
      expect(deck.questions.length).toBe(s.questions);
    }
  });

  it.each(files)('%s is valid, with known topics and no duplicate prompts', (file) => {
    const deck = SampleSchema.parse(JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')));
    const topicKeys = new Set(deck.topics.map((t) => t.key));
    const prompts = deck.questions.map((q) => q.content.prompt);
    expect(new Set(prompts).size).toBe(prompts.length);
    for (const q of deck.questions) expect(topicKeys.has(q.topic)).toBe(true);
  });
});
