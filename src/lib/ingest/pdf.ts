/**
 * PDF → blocks per page via pdf.js (parsing runs in pdf.js's own Web Worker). Large text lines become headings.
 * Pages with almost no text are reported for vision reading; pages can be rendered to JPEG for that.
 */
import { cleanText } from '../../../shared/text';
import { assignHeadingPaths } from './text';
import { IngestError, INGEST_LIMITS, type Block } from './types';

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  size: number;
  eol: boolean;
}

export interface PdfLine {
  text: string;
  size: number;
}

/** Groups positioned text items into lines (same baseline) in reading order. */
export function linesFromItems(items: PdfTextItem[]): PdfLine[] {
  const lines: Array<{ parts: string[]; size: number; y: number }> = [];
  let cur: { parts: string[]; size: number; y: number } | null = null;
  for (const it of items) {
    const sameLine = cur && Math.abs(cur.y - it.y) <= Math.max(2, it.size * 0.4);
    if (!cur || !sameLine) {
      cur = { parts: [], size: it.size, y: it.y };
      lines.push(cur);
    }
    cur.parts.push(it.str);
    cur.size = Math.max(cur.size, it.size);
    if (it.eol) cur = null;
  }
  return lines
    .map((l) => ({ text: cleanText(l.parts.join('').replace(/\s+/g, ' ')), size: l.size }))
    .filter((l) => l.text);
}

/** Median of the sizes, weighted by text length (the body text size). */
export function bodySize(lines: PdfLine[]): number {
  const sizes = lines
    .flatMap((l) => Array<number>(Math.min(200, l.text.length)).fill(l.size))
    .sort((a, b) => a - b);
  return sizes.length ? sizes[Math.floor(sizes.length / 2)]! : 0;
}

/** Lines → blocks: noticeably larger short lines are headings; consecutive body lines form paragraphs. */
export function pageBlocks(lines: PdfLine[], body: number, sourceId: string, page: number): Block[] {
  const blocks: Block[] = [];
  const ref = { sourceId, page, headingPath: [] as string[] };
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'text', text: para.join('\n'), ref });
    para = [];
  };
  for (const l of lines) {
    const ratio = body ? l.size / body : 1;
    if (ratio >= 1.3 && l.text.length <= 120 && /\p{L}/u.test(l.text)) {
      flush();
      blocks.push({ kind: 'heading', level: ratio >= 1.8 ? 1 : 2, text: l.text, ref });
    } else para.push(l.text);
  }
  flush();
  return blocks;
}

export interface PdfExtraction {
  blocks: Block[];
  pages: number;
  /** Pages with almost no extractable text (scanned or image-only). */
  visionPages: number[];
  /** Renders a page to a JPEG (for vision reading and figure crops). */
  renderPage: (page: number, maxEdge?: number) => Promise<Blob>;
  close: () => Promise<void>;
}

const MIN_PAGE_CHARS = 40;

export async function extractPdf(
  data: ArrayBuffer,
  sourceId: string,
  onPage?: (page: number, total: number) => void,
  signal?: AbortSignal,
): Promise<PdfExtraction> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  let doc: Awaited<(typeof task)['promise']>;
  try {
    doc = await task.promise;
  } catch (e) {
    if ((e as { name?: string }).name === 'PasswordException') throw new IngestError('PASSWORD');
    throw new IngestError('CORRUPT');
  }
  if (doc.numPages > INGEST_LIMITS.units) {
    await task.destroy();
    throw new IngestError('TOO_MANY_PAGES');
  }

  const perPage: PdfLine[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    if (signal?.aborted) {
      await task.destroy();
      throw new DOMException('Aborted', 'AbortError');
    }
    onPage?.(p, doc.numPages);
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const it of content.items) {
      if (!('str' in it)) continue;
      items.push({
        str: it.str,
        x: it.transform[4] as number,
        y: it.transform[5] as number,
        size: Math.abs((it.transform[3] as number) || it.height || 0),
        eol: it.hasEOL,
      });
    }
    perPage.push(linesFromItems(items));
    page.cleanup();
  }

  const body = bodySize(perPage.flat());
  const blocks: Block[] = [];
  const visionPages: number[] = [];
  perPage.forEach((lines, i) => {
    const chars = lines.reduce((s, l) => s + l.text.length, 0);
    if (chars < MIN_PAGE_CHARS) visionPages.push(i + 1);
    blocks.push(...pageBlocks(lines, body, sourceId, i + 1));
  });

  const renderPage = async (pageNo: number, maxEdge = 1600): Promise<Blob> => {
    const page = await doc.getPage(pageNo);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, maxEdge / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    page.cleanup();
    return canvasToJpeg(canvas, 0.8);
  };

  return {
    blocks: assignHeadingPaths(blocks),
    pages: doc.numPages,
    visionPages,
    renderPage,
    close: () => task.destroy(),
  };
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new IngestError('CORRUPT'))), 'image/jpeg', quality),
  );
}
