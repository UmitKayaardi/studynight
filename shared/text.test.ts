import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  checkFillAnswer,
  cleanText,
  editDistance,
  foldText,
  parseNumber,
  quoteMatch,
  similarity,
  wordCount,
} from './text.js';

describe('foldText / cleanText', () => {
  it('folds case, diacritics, punctuation and whitespace', () => {
    expect(foldText('  Électron   Café!! ')).toBe('electron cafe');
    expect(foldText('İSTANBUL')).toBe('istanbul');
    expect(foldText('ıstanbul')).toBe('istanbul');
    expect(foldText('ﬁle')).toBe('file');
  });
  it('cleans whitespace and normalises to NFC', () => {
    expect(cleanText('a  b\n\n\n\nc  ')).toBe('a b\n\nc');
    expect(cleanText('é')).toBe('é');
  });
});

describe('editDistance', () => {
  it('computes known distances', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('abc', 'abc')).toBe(0);
  });
  it('is symmetric and bounded', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        const d = editDistance(a, b);
        return d === editDistance(b, a) && d <= Math.max(Array.from(a).length, Array.from(b).length);
      }),
    );
  });
  it('early exit never under-reports', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), fc.string({ maxLength: 20 }), fc.nat(5), (a, b, max) => {
        const full = editDistance(a, b);
        const capped = editDistance(a, b, max);
        return full <= max ? capped === full : capped > max;
      }),
    );
  });
  it('similarity is 1 for identical strings', () => expect(similarity('abc', 'abc')).toBe(1));
});

describe('quoteMatch', () => {
  const chunk =
    'Photosynthesis converts light energy into chemical energy. It takes place in the chloroplasts of plant cells.';
  it('finds exact quotes regardless of case and punctuation', () => {
    expect(quoteMatch(chunk, 'it takes place in the CHLOROPLASTS')).toBe(1);
  });
  it('tolerates small differences', () => {
    expect(quoteMatch(chunk, 'It takes place in the chloroplast of plant cells')).toBeGreaterThan(0.9);
  });
  it('rejects text that is not in the chunk', () => {
    expect(quoteMatch(chunk, 'Mitochondria are the powerhouse of the cell')).toBeLessThan(0.6);
    expect(quoteMatch(chunk, '')).toBe(0);
  });
  it('always finds any substring', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 60 }), fc.nat(), fc.nat(), (s, i, j) => {
        const a = Math.min(i, j) % (s.length + 1);
        const b = Math.max(i, j) % (s.length + 1);
        const sub = s.slice(a, b);
        return foldText(sub) === '' || quoteMatch(s, sub) === 1;
      }),
    );
  });
});

describe('parseNumber', () => {
  it.each([
    ['3.5', 3.5],
    ['3,5', 3.5],
    ['1,000', 1000],
    ['1 000', 1000],
    ['1.000,5', 1000.5],
    ['1,000.5', 1000.5],
    ['-2e3', -2000],
    ['50%', 50],
    ['abc', null],
    ['12abc', null],
  ])('%s → %s', (s, v) => expect(parseNumber(s)).toBe(v));
});

describe('checkFillAnswer', () => {
  it('accepts exact answers regardless of case, accents and spacing', () => {
    expect(checkFillAnswer('  MITOCHONDRIA ', 'mitochondria')).toEqual({ correct: true, exact: true });
    expect(checkFillAnswer('cafe', 'Café').correct).toBe(true);
  });
  it('accepts listed alternatives', () => {
    expect(checkFillAnswer('UK', 'United Kingdom', ['UK', 'Britain']).correct).toBe(true);
  });
  it('tolerates small typos in longer answers only', () => {
    expect(checkFillAnswer('photosynthsis', 'photosynthesis')).toEqual({ correct: true, exact: false });
    expect(checkFillAnswer('cot', 'cat').correct).toBe(false);
    expect(checkFillAnswer('ribosome', 'chromosome').correct).toBe(false);
  });
  it('compares numbers numerically and without typo tolerance', () => {
    expect(checkFillAnswer('3,14', '3.14').correct).toBe(true);
    expect(checkFillAnswer('1000', '1,000').correct).toBe(true);
    expect(checkFillAnswer('1001', '1000').correct).toBe(false);
  });
  it('rejects empty input', () => expect(checkFillAnswer('  ', 'x').correct).toBe(false));
  it('always accepts the answer itself', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => foldText(s) !== ''),
        (s) => checkFillAnswer(s, s).correct,
      ),
    );
  });
});

describe('wordCount', () => {
  it('counts words in spaced and unspaced scripts', () => {
    expect(wordCount('The cell is the unit of life.')).toBe(7);
    expect(wordCount('細胞は生命の単位です')).toBe(5);
    expect(wordCount('')).toBe(0);
  });
});
