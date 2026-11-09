import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { contrastRatio } from './contrast';

/** Parses the light (:root) and dark ([data-theme='dark']) token blocks from styles.css. */
function tokens(): { light: Record<string, string>; dark: Record<string, string> } {
  const css = readFileSync('src/styles.css', 'utf8');
  const block = (selector: string) => {
    const start = css.indexOf(selector + ' {');
    const body = css.slice(start, css.indexOf('}', start));
    return Object.fromEntries(
      [...body.matchAll(/--sn-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]),
    );
  };
  return { light: block(':root'), dark: block("[data-theme='dark']") };
}

const TEXT_PAIRS: Array<[string, string]> = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'surface-2'],
  ['text-muted', 'bg'],
  ['text-muted', 'surface'],
  ['accent', 'bg'],
  ['accent', 'surface'],
  ['on-accent', 'accent'],
  ['star-text', 'bg'],
  ['star-text', 'surface'],
  ['good', 'surface'],
  ['bad', 'surface'],
  ['good', 'good-soft'],
  ['bad', 'bad-soft'],
  ['text', 'accent-soft'],
  ['text', 'star-soft'],
  ['star-text', 'star-soft'],
];

describe('design tokens meet WCAG AA', () => {
  const { light, dark } = tokens();
  for (const [theme, t] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    for (const [fg, bg] of TEXT_PAIRS) {
      it(`${theme}: ${fg} on ${bg} ≥ 4.5`, () => {
        expect(t[fg], fg).toBeDefined();
        expect(t[bg], bg).toBeDefined();
        expect(contrastRatio(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('computes known ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
});
