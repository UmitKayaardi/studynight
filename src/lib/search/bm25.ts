/**
 * BM25 keyword index — always available instantly, no download. Tokens are folded words; scripts written
 * without spaces (CJK, Thai) are indexed as overlapping character bigrams.
 */
import { foldText } from '../../../shared/text';

const NO_SPACE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const word of foldText(text).split(' ')) {
    if (!word) continue;
    if (NO_SPACE.test(word)) {
      const chars = Array.from(word);
      if (chars.length === 1) out.push(chars[0]!);
      for (let i = 0; i + 1 < chars.length; i++) out.push(chars[i]! + chars[i + 1]!);
    } else if (word.length > 1 || /\p{N}/u.test(word)) out.push(word);
  }
  return out;
}

export interface Bm25Index {
  ids: string[];
  lengths: number[];
  tfs: Array<Map<string, number>>;
  df: Map<string, number>;
  avgdl: number;
}

export function buildBm25(docs: Array<{ id: string; text: string }>): Bm25Index {
  const ids: string[] = [];
  const lengths: number[] = [];
  const tfs: Array<Map<string, number>> = [];
  const df = new Map<string, number>();
  for (const d of docs) {
    const tokens = tokenize(d.text);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    ids.push(d.id);
    lengths.push(tokens.length);
    tfs.push(tf);
  }
  const avgdl = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  return { ids, lengths, tfs, df, avgdl };
}

export interface Hit {
  id: string;
  score: number;
}

export function searchBm25(index: Bm25Index, query: string, k = 10, k1 = 1.2, b = 0.75): Hit[] {
  const q = [...new Set(tokenize(query))];
  const N = index.ids.length;
  if (!N || !q.length) return [];
  const hits: Hit[] = [];
  for (let i = 0; i < N; i++) {
    const tf = index.tfs[i]!;
    let score = 0;
    for (const t of q) {
      const f = tf.get(t);
      if (!f) continue;
      const n = index.df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * index.lengths[i]!) / (index.avgdl || 1)));
    }
    if (score > 0) hits.push({ id: index.ids[i]!, score });
  }
  return hits.sort((a, b2) => b2.score - a.score).slice(0, k);
}
