/** HTML (from mammoth's DOCX conversion) → blocks with headings preserved. Main thread (uses DOMParser). */
import { cleanText } from '../../../shared/text';
import { assignHeadingPaths } from './text';
import type { Block } from './types';

export function htmlToBlocks(html: string, sourceId: string): Block[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: Block[] = [];
  const ref = { sourceId, headingPath: [] as string[] };
  const visit = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    const h = /^h([1-6])$/.exec(tag);
    if (h) {
      const text = cleanText(el.textContent ?? '');
      if (text) blocks.push({ kind: 'heading', level: Number(h[1]), text, ref: { ...ref } });
      return;
    }
    if (tag === 'p' || tag === 'li' || tag === 'pre' || tag === 'blockquote') {
      const text = cleanText(el.textContent ?? '');
      if (text) blocks.push({ kind: 'text', text: tag === 'li' ? `• ${text}` : text, ref: { ...ref } });
      return;
    }
    if (tag === 'table') {
      for (const row of Array.from(el.querySelectorAll('tr'))) {
        const cells = Array.from(row.querySelectorAll('th,td')).map((c) => cleanText(c.textContent ?? ''));
        const text = cells.filter(Boolean).join(' | ');
        if (text) blocks.push({ kind: 'text', text, ref: { ...ref } });
      }
      return;
    }
    for (const child of Array.from(el.children)) visit(child);
  };
  for (const child of Array.from(doc.body.children)) visit(child);
  return assignHeadingPaths(mergeShortParagraphs(blocks));
}

/** Joins consecutive list items/short lines so that chunks are not split into one-line fragments. */
function mergeShortParagraphs(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    const prev = out.at(-1);
    if (prev && prev.kind === 'text' && b.kind === 'text' && prev.text.length < 400 && b.text.length < 200) {
      out[out.length - 1] = { ...prev, text: `${prev.text}\n${b.text}` };
    } else out.push(b);
  }
  return out;
}

export async function extractDocx(data: ArrayBuffer, sourceId: string): Promise<Block[]> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.convertToHtml({ arrayBuffer: data });
  return htmlToBlocks(value, sourceId);
}
