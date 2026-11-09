/**
 * Text utilities shared by the server (evidence checks) and the app (answer checking, search).
 * Pure functions, no dependencies.
 */

/** NFC + normalised whitespace — used for stored text. */
export function cleanText(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Comparison form: compatibility-decomposed, diacritics and punctuation removed, lower case, single spaces.
 * Turkish dotless ı is folded to i so "Istanbul" and "ıstanbul" match.
 */
export function foldText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Levenshtein distance; stops early and returns `max + 1` once the distance exceeds `max`. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  const A = Array.from(a);
  const B = Array.from(b);
  if (Math.abs(A.length - B.length) > max) return max + 1;
  let prev = Array.from({ length: B.length + 1 }, (_, i) => i);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= B.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (A[i - 1] === B[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[B.length]!;
}

/** 1 − distance / longer length (1 = identical). */
export function similarity(a: string, b: string): number {
  const len = Math.max(Array.from(a).length, Array.from(b).length);
  return len === 0 ? 1 : 1 - editDistance(a, b) / len;
}

/**
 * How well `needle` occurs somewhere inside `haystack` (approximate substring match, Sellers' algorithm),
 * after folding both. 1 = exact occurrence. Used to verify that an evidence quote really comes from the notes.
 */
export function quoteMatch(haystack: string, needle: string): number {
  const h = Array.from(foldText(haystack));
  const n = Array.from(foldText(needle));
  if (n.length === 0) return 0;
  if (h.join('').includes(n.join(''))) return 1;
  // dp over needle positions; first row is 0 everywhere (match may start anywhere in the haystack).
  let prev = Array.from({ length: n.length + 1 }, (_, i) => i);
  let best = prev[n.length]!;
  for (let j = 1; j <= h.length; j++) {
    const cur = [0];
    for (let i = 1; i <= n.length; i++) {
      cur.push(Math.min(prev[i]! + 1, cur[i - 1]! + 1, prev[i - 1]! + (n[i - 1] === h[j - 1] ? 0 : 1)));
    }
    if (cur[n.length]! < best) best = cur[n.length]!;
    prev = cur;
  }
  return Math.max(0, 1 - best / n.length);
}

/** Parses a number written with either decimal separator ("3.5", "3,5", "1 000", "1,000.5", "-2e3"). */
export function parseNumber(s: string): number | null {
  let t = s.trim().replace(/[\s\u00a0\u202f']/g, '');
  if (!/^[-+−]?[\d.,]+(e[-+]?\d+)?%?$/i.test(t)) return null;
  t = t.replace('−', '-').replace(/%$/, '');
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // The later separator is the decimal one.
    t = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (lastComma > -1) {
    // "1,000" (thousands) vs "3,5" (decimal): three digits after a single comma means thousands.
    const parts = t.split(',');
    t = parts.length > 2 || parts[1]!.length === 3 ? parts.join('') : parts.join('.');
  }
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** Edit distance allowed for a typed answer of this length: none for very short answers, then ~1 per 5 letters. */
export function typoAllowance(length: number): number {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  if (length <= 12) return 2;
  return Math.min(4, Math.floor(length / 5));
}

export interface FillCheck {
  correct: boolean;
  /** True when it matched without needing typo tolerance. */
  exact: boolean;
}

/**
 * Deterministic fill-in-the-blank check: Unicode-normalised, case/diacritic/whitespace-insensitive,
 * accepted alternatives, typo tolerance scaled to answer length, numbers compared numerically.
 */
export function checkFillAnswer(input: string, answer: string, accepted: readonly string[] = []): FillCheck {
  const given = foldText(input);
  if (!given) return { correct: false, exact: false };
  const candidates = [answer, ...accepted];

  const givenNum = parseNumber(input);
  for (const c of candidates) {
    const n = parseNumber(c);
    if (n !== null && givenNum !== null) {
      if (Math.abs(n - givenNum) <= 1e-9 * Math.max(1, Math.abs(n))) return { correct: true, exact: true };
    }
  }
  for (const c of candidates) if (foldText(c) === given) return { correct: true, exact: true };
  for (const c of candidates) {
    const target = foldText(c);
    if (parseNumber(c) !== null) continue; // numbers never get typo tolerance
    const allow = typoAllowance(Array.from(target).length);
    if (allow > 0 && editDistance(given, target, allow) <= allow) return { correct: true, exact: false };
  }
  return { correct: false, exact: false };
}

/** Rough word count that also works for scripts written without spaces (CJK, Thai): 2 characters ≈ 1 word. */
export function wordCount(s: string): number {
  const noSpace =
    s.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/gu)?.length ?? 0;
  const rest = s.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/gu, ' ');
  const words = rest.match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}'’-]*/gu)?.length ?? 0;
  return words + Math.ceil(noSpace / 2);
}
