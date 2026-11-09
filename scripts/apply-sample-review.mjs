// Applies the hand review of the sample decks (samples/review.json) to the generated decks in src/samples/.
// Each entry matches a question by its exact generated prompt and either removes it or patches fields.
// Usage: node scripts/apply-sample-review.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const review = JSON.parse(readFileSync('samples/review.json', 'utf8'));
for (const [id, entries] of Object.entries(review)) {
  const file = `src/samples/${id}.json`;
  if (!existsSync(file)) continue;
  const deck = JSON.parse(readFileSync(file, 'utf8'));
  let removed = 0;
  let patched = 0;
  for (const e of entries) {
    const i = deck.questions.findIndex((q) => q.content.prompt === e.prompt);
    if (i < 0) continue;
    if (e.remove) {
      deck.questions.splice(i, 1);
      removed++;
    } else if (e.set) {
      deck.questions[i].content = { ...deck.questions[i].content, ...e.set };
      patched++;
    }
  }
  writeFileSync(file, JSON.stringify(deck, null, 1) + '\n');
  console.log(`${id}: ${removed} removed, ${patched} corrected, ${deck.questions.length} questions`);
}

// Keep the index counts in sync.
const indexFile = 'src/samples/index.ts';
let index = readFileSync(indexFile, 'utf8');
for (const id of Object.keys(review)) {
  if (!existsSync(`src/samples/${id}.json`)) continue;
  const n = JSON.parse(readFileSync(`src/samples/${id}.json`, 'utf8')).questions.length;
  index = index.replace(new RegExp(`("id": "${id}"[\\s\\S]*?"questions": )\\d+`), `$1${n}`);
}
writeFileSync(indexFile, index);
