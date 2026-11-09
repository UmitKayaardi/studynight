/**
 * Chunker: ~250–400 words per chunk, respecting headings and sentence boundaries, ~15 % overlap between
 * consecutive chunks inside the same section. Every chunk keeps the source refs of the text it contains.
 */
import { wordCount } from '../../../shared/text';
import type { Block, SourceRef } from './types';

export const CHUNK_TARGET = 300;
export const CHUNK_MAX = 400;
/** A heading starts a new chunk once the current one has at least this many words. */
export const CHUNK_MIN_AT_HEADING = 120;
const OVERLAP_RATIO = 0.15;

export interface Unit {
  text: string;
  words: number;
  ref: SourceRef;
  /** Index of the block it came from (for joining). */
  block: number;
  heading: boolean;
}

export interface Chunk {
  index: number;
  text: string;
  wordCount: number;
  headingPath: string[];
  refs: SourceRef[];
  /** Unit range [start, end) — overlap means start can be before the previous chunk's end. */
  start: number;
  end: number;
}

let segmenter: Intl.Segmenter | null | undefined;
function sentences(text: string): string[] {
  if (segmenter === undefined) {
    segmenter =
      typeof Intl !== 'undefined' && 'Segmenter' in Intl
        ? new Intl.Segmenter('und', { granularity: 'sentence' })
        : null;
  }
  const out: string[] = [];
  // Line breaks inside a block (bullets, slide lines) are boundaries too.
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    if (segmenter) {
      for (const s of segmenter.segment(line)) if (s.segment.trim()) out.push(s.segment.trim());
    } else out.push(...line.split(/(?<=[.!?。！？؟।])\s+/).filter((s) => s.trim()));
  }
  return out;
}

/** Splits a run of words that is longer than the maximum into pieces. */
function splitLong(text: string, max: number): string[] {
  if (wordCount(text) <= max) return [text];
  const tokens = text.split(/(\s+)/);
  if (tokens.length <= 1) {
    // No spaces (e.g. CJK): split by characters (2 chars ≈ 1 word).
    const chars = Array.from(text);
    const size = max * 2;
    const out: string[] = [];
    for (let i = 0; i < chars.length; i += size) out.push(chars.slice(i, i + size).join(''));
    return out;
  }
  const out: string[] = [];
  let cur = '';
  for (const t of tokens) {
    if (wordCount(cur + t) > max && cur.trim()) {
      out.push(cur.trim());
      cur = '';
    }
    cur += t;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.flatMap((p) => (wordCount(p) > max ? splitLong(p.replace(/\s+/g, ''), max) : [p]));
}

export function toUnits(blocks: Block[], max = CHUNK_MAX): Unit[] {
  const units: Unit[] = [];
  blocks.forEach((b, i) => {
    const parts = b.kind === 'heading' ? [b.text] : sentences(b.text);
    for (const s of parts) {
      for (const piece of splitLong(s, max)) {
        units.push({
          text: piece,
          words: wordCount(piece),
          ref: b.ref,
          block: i,
          heading: b.kind === 'heading',
        });
      }
    }
  });
  return units;
}

const refKey = (r: SourceRef) => `${r.sourceId}|${r.page ?? ''}|${r.slide ?? ''}`;

function build(units: Unit[], start: number, end: number, index: number): Chunk {
  let text = '';
  for (let i = start; i < end; i++) {
    const u = units[i]!;
    if (i > start)
      text += u.block === units[i - 1]!.block && !u.heading && !units[i - 1]!.heading ? ' ' : '\n';
    text += u.text;
  }
  const refs: SourceRef[] = [];
  const seen = new Set<string>();
  for (let i = start; i < end; i++) {
    const k = refKey(units[i]!.ref);
    if (!seen.has(k)) {
      seen.add(k);
      refs.push({ ...units[i]!.ref });
    }
  }
  const words = units.slice(start, end).reduce((s, u) => s + u.words, 0);
  const firstOwn = units[start]!;
  return { index, text, wordCount: words, headingPath: firstOwn.ref.headingPath, refs, start, end };
}

export function chunkUnits(units: Unit[], max = CHUNK_MAX, target = CHUNK_TARGET): Chunk[] {
  const chunks: Chunk[] = [];
  let start = 0;
  let words = 0;
  let i = 0;
  while (i < units.length) {
    const u = units[i]!;
    const atHeading = u.heading && i > start && words >= CHUNK_MIN_AT_HEADING;
    if (i > start && (words + u.words > max || atHeading)) {
      chunks.push(build(units, start, i, chunks.length));
      // Overlap: carry trailing sentences of the previous chunk (not across a heading).
      let ostart = i;
      if (!u.heading) {
        let ow = 0;
        const budget = Math.floor(words * OVERLAP_RATIO);
        while (ostart - 1 > start && !units[ostart - 1]!.heading && ow + units[ostart - 1]!.words <= budget) {
          ostart--;
          ow += units[ostart]!.words;
        }
        if (ow + u.words > max) ostart = i;
      }
      start = ostart;
      words = units.slice(start, i).reduce((s, x) => s + x.words, 0);
    }
    words += u.words;
    i++;
    // Close a chunk at a sentence boundary once it reaches the target size.
    if (words >= target && i < units.length && !units[i]!.heading) {
      chunks.push(build(units, start, i, chunks.length));
      let ostart = i;
      let ow = 0;
      const budget = Math.floor(words * OVERLAP_RATIO);
      while (ostart - 1 > start && !units[ostart - 1]!.heading && ow + units[ostart - 1]!.words <= budget) {
        ostart--;
        ow += units[ostart]!.words;
      }
      if (ow + units[i]!.words > max) ostart = i;
      start = ostart;
      words = ow === 0 && ostart === i ? 0 : units.slice(start, i).reduce((s, x) => s + x.words, 0);
    }
  }
  if (start < units.length && (chunks.length === 0 || chunks.at(-1)!.end < units.length)) {
    chunks.push(build(units, start, units.length, chunks.length));
  }
  return chunks;
}

export function chunkBlocks(blocks: Block[]): Chunk[] {
  return chunkUnits(toUnits(blocks));
}
