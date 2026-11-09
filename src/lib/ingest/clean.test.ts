import { describe, expect, it } from 'vitest';
import { cleanBlocks, findRepeatedLines, fixHyphenation, unwrapLines } from './clean';
import { detectLanguage } from './lang';
import type { Block } from './types';

const page = (n: number, text: string): Block => ({
  kind: 'text',
  text,
  ref: { sourceId: 's', page: n, headingPath: [] },
});

describe('cleaning', () => {
  const topics = ['membranes', 'nuclei', 'ribosomes', 'vacuoles', 'chloroplasts'];
  const blocks = topics.map((t, i) =>
    page(
      i + 1,
      `Intro to Biology — Week 3\nThis page is about ${t}.\nThey matter for ${t} reasons.\nPage ${i + 1} of 5`,
    ),
  );

  it('finds repeated headers and footers', () => {
    const rep = findRepeatedLines(blocks);
    expect(rep.has('intro to biology — week #')).toBe(true);
    expect(rep.has('page # of #')).toBe(true);
    expect(rep.has('this page is about membranes.')).toBe(false);
  });

  it('removes them and keeps content', () => {
    const out = cleanBlocks(blocks);
    expect(out[0]!.text).not.toContain('Week 3');
    expect(out[0]!.text).not.toContain('Page 1');
    expect(out[0]!.text).toContain('This page is about membranes.');
  });

  it('does nothing on short documents', () => {
    expect(findRepeatedLines(blocks.slice(0, 2)).size).toBe(0);
  });

  it('repairs hyphenation and unwraps hard line breaks', () => {
    expect(fixHyphenation('photo-\nsynthesis is well-\nKnown')).toBe('photosynthesis is well-\nKnown');
    expect(unwrapLines('The cell membrane\ncontrols what enters.\n• bullet\n1. step')).toBe(
      'The cell membrane controls what enters.\n• bullet\n1. step',
    );
  });

  it('drops blocks that become empty', () => {
    expect(cleanBlocks([page(1, '12')])).toEqual([]);
  });
});

describe('detectLanguage', () => {
  it.each([
    ['The mitochondrion is the part of the cell that releases energy from food through respiration.', 'en'],
    [
      'La mitocondria es la parte de la célula que libera energía de los alimentos mediante la respiración.',
      'es',
    ],
    [
      'Mitokondri, hücrenin besinlerden solunum yoluyla enerji açığa çıkaran bölümüdür ve çok önemlidir.',
      'tr',
    ],
    ['الميتوكوندريا هي جزء الخلية الذي يطلق الطاقة من الغذاء عن طريق التنفس الخلوي في جميع الكائنات.', 'ar'],
    ['ミトコンドリアは、呼吸によって食物からエネルギーを取り出す細胞の部分です。とても大切です。', 'ja'],
    ['미토콘드리아는 호흡을 통해 음식에서 에너지를 방출하는 세포의 부분입니다. 매우 중요합니다.', 'ko'],
  ])('%s', (text, lang) => expect(detectLanguage(text)).toBe(lang));

  it('returns und for too little text', () => expect(detectLanguage('ok')).toBe('und'));
});
