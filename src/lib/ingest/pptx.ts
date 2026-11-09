/** PPTX → blocks: slide titles as headings, slide text, and speaker notes, per slide. */
import JSZip from 'jszip';
import { cleanText } from '../../../shared/text';
import { assignHeadingPaths } from './text';
import { IngestError, type Block } from './types';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

/** Paragraph texts of a DrawingML fragment. */
function paragraphs(xml: string): string[] {
  const out: string[] = [];
  for (const p of xml.match(/<a:p[ >][\s\S]*?<\/a:p>/g) ?? []) {
    const runs = [...p.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\s*\/>/g)].map((m) =>
      m[1] === undefined ? '\n' : decodeXml(m[1]),
    );
    const t = cleanText(runs.join(''));
    if (t) out.push(t);
  }
  return out;
}

export interface SlideContent {
  title: string;
  body: string[];
  notes: string[];
}

/** Parses one slide's XML. The title comes from the title placeholder. */
export function parseSlide(xml: string): Omit<SlideContent, 'notes'> {
  let title = '';
  const body: string[] = [];
  for (const sp of xml.match(/<p:sp[ >][\s\S]*?<\/p:sp>/g) ?? []) {
    const isTitle = /<p:ph[^>]*type="(title|ctrTitle)"/.test(sp);
    const paras = paragraphs(sp);
    if (isTitle && !title) title = paras.join(' ');
    else body.push(...paras);
  }
  // Tables live in graphic frames.
  for (const gf of xml.match(/<p:graphicFrame[ >][\s\S]*?<\/p:graphicFrame>/g) ?? []) {
    for (const row of gf.match(/<a:tr[ >][\s\S]*?<\/a:tr>/g) ?? []) {
      const cells = (row.match(/<a:tc[ >][\s\S]*?<\/a:tc>/g) ?? []).map((c) => paragraphs(c).join(' '));
      const line = cells.filter(Boolean).join(' | ');
      if (line) body.push(line);
    }
  }
  return { title, body };
}

/** Speaker notes text, without the slide-image and slide-number placeholders. */
export function parseNotes(xml: string): string[] {
  const out: string[] = [];
  for (const sp of xml.match(/<p:sp[ >][\s\S]*?<\/p:sp>/g) ?? []) {
    if (/<p:ph[^>]*type="(sldImg|sldNum|hdr|ftr|dt)"/.test(sp)) continue;
    out.push(...paragraphs(sp));
  }
  return out;
}

export async function extractPptx(
  data: ArrayBuffer,
  sourceId: string,
): Promise<{ blocks: Block[]; slides: number }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new IngestError('CORRUPT');
  }
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
  if (!slideFiles.length) throw new IngestError('CORRUPT');

  // Slide order from presentation.xml when available.
  const order = await slideOrder(zip);
  const ordered = order.length ? order.filter((f) => slideFiles.includes(f)) : slideFiles;

  const blocks: Block[] = [];
  let index = 0;
  for (const file of ordered) {
    index++;
    const xml = await zip.file(file)!.async('string');
    const { title, body } = parseSlide(xml);
    const relsPath = file.replace('slides/', 'slides/_rels/').replace('.xml', '.xml.rels');
    const rels = (await zip.file(relsPath)?.async('string')) ?? '';
    const notesTarget = /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/.exec(rels)?.[1];
    const notes = notesTarget
      ? parseNotes((await zip.file(`ppt/notesSlides/${notesTarget}`)?.async('string')) ?? '')
      : [];
    const ref = { sourceId, slide: index, headingPath: [] };
    if (title) blocks.push({ kind: 'heading', level: 2, text: title, ref });
    if (body.length) blocks.push({ kind: 'text', text: body.join('\n'), ref });
    if (notes.length) blocks.push({ kind: 'text', text: notes.join('\n'), ref });
  }
  return { blocks: assignHeadingPaths(blocks), slides: ordered.length };
}

async function slideOrder(zip: JSZip): Promise<string[]> {
  const pres = await zip.file('ppt/presentation.xml')?.async('string');
  const rels = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string');
  if (!pres || !rels) return [];
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g))
    targets.set(m[1]!, m[2]!);
  for (const m of rels.matchAll(/<Relationship[^>]*Target="([^"]+)"[^>]*Id="([^"]+)"/g))
    targets.set(m[2]!, m[1]!);
  const ids = [...pres.matchAll(/<p:sldId [^>]*r:id="([^"]+)"/g)].map((m) => m[1]!);
  return ids
    .map((id) => targets.get(id))
    .filter((t): t is string => !!t)
    .map((t) => `ppt/${t.replace(/^\.?\//, '')}`);
}
