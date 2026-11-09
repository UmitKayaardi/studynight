/** Plain text, Markdown and pasted text → blocks. */
import { cleanText } from '../../../shared/text';
import type { Block, SourceRef } from './types';

/** Light Markdown → text: keeps the words, drops formatting syntax. Code and LaTeX are kept verbatim. */
export function stripMarkdownInline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, '$1')
    .replace(/^>\s?/gm, '');
}

export function textToBlocks(
  raw: string,
  sourceId: string,
  markdown: boolean,
  ref: Partial<SourceRef> = {},
): Block[] {
  const text = cleanText(raw.replace(/\r\n?/g, '\n'));
  const blocks: Block[] = [];
  const base: SourceRef = { sourceId, headingPath: [], ...ref };
  // Keep fenced code blocks together.
  const parts = text.split(/(```[\s\S]*?```)/g);
  for (const part of parts) {
    if (!part.trim()) continue;
    if (part.startsWith('```')) {
      blocks.push({ kind: 'text', text: part.trim(), ref: { ...base } });
      continue;
    }
    for (const para of part.split(/\n\s*\n/)) {
      const lines = para.split('\n');
      let buf: string[] = [];
      const flush = () => {
        const t = buf.join('\n').trim();
        if (t) blocks.push({ kind: 'text', text: markdown ? stripMarkdownInline(t) : t, ref: { ...base } });
        buf = [];
      };
      for (const line of lines) {
        const h = markdown ? /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line) : null;
        if (h) {
          flush();
          blocks.push({
            kind: 'heading',
            level: h[1]!.length,
            text: stripMarkdownInline(h[2]!),
            ref: { ...base },
          });
        } else buf.push(line);
      }
      flush();
    }
  }
  return assignHeadingPaths(blocks);
}

/** Fills `ref.headingPath` of every block from the heading blocks before it. */
export function assignHeadingPaths(blocks: Block[]): Block[] {
  const stack: Array<{ level: number; text: string }> = [];
  return blocks.map((b) => {
    if (b.kind === 'heading') {
      const level = b.level ?? 1;
      while (stack.length && stack.at(-1)!.level >= level) stack.pop();
      stack.push({ level, text: b.text });
    }
    return { ...b, ref: { ...b.ref, headingPath: stack.map((s) => s.text).slice(-4) } };
  });
}
