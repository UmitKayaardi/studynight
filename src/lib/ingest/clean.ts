/**
 * Cleaning: removes running headers/footers and page numbers (detected by repetition across pages),
 * repairs line-end hyphenation, normalises whitespace and Unicode (NFC).
 */
import { cleanText } from '../../../shared/text';
import type { Block } from './types';

const PAGE_NUMBER =
  /^\s*(?:page|p\.|seite|página|pagina|sayfa|страница|стр\.?)?\s*\d{1,4}\s*(?:(?:of|\/|von|de|di|из)\s*\d{1,4})?\s*$/i;

/** Line signature for repetition detection: digits collapsed so "Page 3" and "Page 4" match. */
const signature = (line: string) => line.trim().toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ');

/**
 * Finds lines that repeat on at least 40 % of pages (min. 3) within the first or last two lines of a page.
 * Works on blocks that carry a page or slide number.
 */
export function findRepeatedLines(blocks: Block[]): Set<string> {
  const byPage = new Map<number, string[]>();
  for (const b of blocks) {
    const unit = b.ref.page ?? b.ref.slide;
    if (unit === undefined) continue;
    const lines = byPage.get(unit) ?? [];
    lines.push(...b.text.split('\n'));
    byPage.set(unit, lines);
  }
  const pages = byPage.size;
  if (pages < 3) return new Set();
  const counts = new Map<string, number>();
  for (const lines of byPage.values()) {
    const edge = new Set(
      [...lines.slice(0, 2), ...lines.slice(-2)].map(signature).filter((s) => s.length > 0),
    );
    for (const s of edge) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const threshold = Math.max(3, Math.ceil(pages * 0.4));
  return new Set([...counts].filter(([, c]) => c >= threshold).map(([s]) => s));
}

/** Joins "exam-\nple" into "example" when the next line starts with a lower-case letter. */
export function fixHyphenation(text: string): string {
  return text.replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2');
}

/** Joins hard-wrapped lines inside a paragraph (PDF line breaks) while keeping bullet/numbered lines apart. */
export function unwrapLines(text: string): string {
  return text.replace(/([^\n.!?:;。！？])\n(?![\s•\-–*·▪●◦]|\d+[.)]\s)(?=\p{Ll})/gu, '$1 ');
}

export function cleanBlocks(blocks: Block[]): Block[] {
  const repeated = findRepeatedLines(blocks);
  const out: Block[] = [];
  for (const b of blocks) {
    const lines = b.text.split('\n').filter((l) => !PAGE_NUMBER.test(l) && !repeated.has(signature(l)));
    let text = lines.join('\n');
    if (b.kind === 'text') text = unwrapLines(fixHyphenation(text));
    text = cleanText(text);
    if (text) out.push({ ...b, text });
  }
  return out;
}
