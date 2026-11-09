/**
 * Deck creation: extract → (vision for scanned pages/photos) → clean → detect language → chunk → topic map →
 * first topic's questions. The deck becomes playable as soon as the first topic has questions; the rest is
 * generated in the background. Only text chunks and resized images ever leave the device.
 */
import { api, ApiFailure } from '../api';
import { db } from '../../db/schema';
import { createDeck, deleteDeck, updateDeck } from '../../db/repo';
import { requestPersistence } from '../../db/storage';
import type { Chunk, ImageRecord, Source, TopicRecord } from '../../db/types';
import { cleanBlocks } from '../ingest/clean';
import { chunkBlocks } from '../ingest/chunk';
import { detectLanguage } from '../ingest/lang';
import { extractDocx } from '../ingest/html';
import { blobToBase64, resizeImage } from '../ingest/image';
import { extractPdf } from '../ingest/pdf';
import { extractPptx } from '../ingest/pptx';
import { textToBlocks } from '../ingest/text';
import { IngestError, INGEST_LIMITS, kindOf, type Block, type SourceKind } from '../ingest/types';
import { newId } from '../learning/random';
import { SKILL_START } from '../learning/mastery';
import { startBackgroundGeneration, ensureTopicQuestions } from './generate';
import { chunkKey, shortId } from './ids';
import { chunkSummary } from './summary';

export { chunkKey, shortId, chunkSummary };

export interface NewDeckInput {
  title: string;
  quizLanguage: string;
  examDate: string | null;
  files: File[];
  pasted: string;
}

export type Progress =
  | { stage: 'reading'; file: string; page?: number; total?: number }
  | { stage: 'vision'; done: number; total: number }
  | { stage: 'topics' }
  | { stage: 'questions'; topic: string }
  | { stage: 'busy'; waitMs: number };

export interface PipelineHooks {
  onProgress: (p: Progress) => void;
  /** Called when more pages need vision reading than the cap; returns the pages to read. */
  choosePages?: (pages: number[], max: number) => Promise<number[]>;
  signal?: AbortSignal;
}

/** Validates the selection before anything is processed. Throws IngestError with a friendly code. */
export function validateInput(files: File[], pasted: string): void {
  if (!files.length && !pasted.trim()) throw new IngestError('EMPTY');
  let photos = 0;
  for (const f of files) {
    const kind = kindOf(f);
    if (!kind) throw new IngestError('UNSUPPORTED', f.name);
    if (f.size > INGEST_LIMITS.fileBytes) throw new IngestError('FILE_TOO_LARGE', f.name);
    if (kind === 'photo') photos++;
  }
  if (photos > INGEST_LIMITS.photos) throw new IngestError('TOO_MANY_PHOTOS');
  if (pasted.length > INGEST_LIMITS.chars) throw new IngestError('TOO_LONG');
}

interface VisionJob {
  sourceId: string;
  page: number | null;
  blob: () => Promise<Blob>;
}

async function readImages(
  deckId: string,
  jobs: VisionJob[],
  hooks: PipelineHooks,
  languageHint: string,
): Promise<Block[]> {
  const blocks: Block[] = [];
  let done = 0;
  hooks.onProgress({ stage: 'vision', done, total: jobs.length });
  for (const job of jobs) {
    if (hooks.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const blob = await job.blob();
    try {
      const res = await api.readImage(
        { image: await blobToBase64(blob), mime: 'image/jpeg', languageHint },
        { signal: hooks.signal, onBusy: (waitMs) => hooks.onProgress({ stage: 'busy', waitMs }) },
      );
      const image: ImageRecord = {
        id: newId(),
        deckId,
        sourceId: job.sourceId,
        page: job.page,
        blob,
        hasFigure: res.hasFigure,
        description: res.figureDescription,
      };
      await db.images.add(image);
      const ref = { sourceId: job.sourceId, ...(job.page ? { page: job.page } : {}) };
      blocks.push(...textToBlocks(res.text, job.sourceId, true, ref));
      if (res.hasFigure && res.figureDescription) {
        blocks.push({ kind: 'text', text: res.figureDescription, ref: { ...ref, headingPath: [] } });
      }
    } catch (e) {
      // An unreadable photo is skipped; other failures stop the pipeline.
      if (!(e instanceof ApiFailure && e.code === 'UNREADABLE')) throw e;
    }
    hooks.onProgress({ stage: 'vision', done: ++done, total: jobs.length });
  }
  return blocks;
}

export async function createDeckFromInput(input: NewDeckInput, hooks: PipelineHooks): Promise<string> {
  validateInput(input.files, input.pasted);
  void requestPersistence();
  const deck = await createDeck({
    title: input.title.trim().slice(0, 120),
    quizLanguage: input.quizLanguage,
    examDate: input.examDate,
  });
  try {
    await runPipeline(deck.id, input, hooks);
    return deck.id;
  } catch (e) {
    await deleteDeck(deck.id);
    throw e;
  }
}

async function runPipeline(deckId: string, input: NewDeckInput, hooks: PipelineHooks): Promise<void> {
  const blocks: Block[] = [];
  const sources: Source[] = [];
  const vision: VisionJob[] = [];
  let units = 0;
  const closers: Array<() => Promise<void>> = [];
  const addSource = (name: string, kind: SourceKind, u: number, bytes: number) => {
    const s: Source = { id: newId(), deckId, name, kind, units: u, bytes, addedAt: Date.now() };
    sources.push(s);
    return s;
  };

  try {
    for (const file of input.files) {
      const kind = kindOf(file)!;
      hooks.onProgress({ stage: 'reading', file: file.name });
      if (kind === 'photo') {
        const src = addSource(file.name, kind, 1, file.size);
        vision.push({ sourceId: src.id, page: null, blob: () => resizeImage(file) });
        continue;
      }
      const data = await file.arrayBuffer();
      if (kind === 'pdf') {
        const src = addSource(file.name, kind, 0, file.size);
        const pdf = await extractPdf(
          data,
          src.id,
          (page, total) => hooks.onProgress({ stage: 'reading', file: file.name, page, total }),
          hooks.signal,
        );
        closers.push(pdf.close);
        src.units = pdf.pages;
        blocks.push(...pdf.blocks);
        let pages = pdf.visionPages;
        if (pages.length > INGEST_LIMITS.visionPages) {
          pages = hooks.choosePages
            ? await hooks.choosePages(pages, INGEST_LIMITS.visionPages)
            : pages.slice(0, INGEST_LIMITS.visionPages);
          pages = pages.slice(0, INGEST_LIMITS.visionPages);
        }
        for (const p of pages) vision.push({ sourceId: src.id, page: p, blob: () => pdf.renderPage(p) });
      } else if (kind === 'pptx') {
        const src = addSource(file.name, kind, 0, file.size);
        const r = await extractPptx(data, src.id);
        src.units = r.slides;
        blocks.push(...r.blocks);
      } else if (kind === 'docx') {
        const src = addSource(file.name, kind, 1, file.size);
        try {
          blocks.push(...(await extractDocx(data, src.id)));
        } catch {
          throw new IngestError('CORRUPT', file.name);
        }
      } else {
        const src = addSource(file.name, kind, 1, file.size);
        blocks.push(...textToBlocks(new TextDecoder().decode(data), src.id, kind === 'markdown'));
      }
      units = sources.reduce((s, x) => s + x.units, 0);
      if (units > INGEST_LIMITS.units) throw new IngestError('TOO_MANY_PAGES');
    }
    if (input.pasted.trim()) {
      const src = addSource('', 'paste', 1, input.pasted.length);
      blocks.push(...textToBlocks(input.pasted, src.id, true));
    }
    if (vision.length + units > INGEST_LIMITS.units + INGEST_LIMITS.photos)
      throw new IngestError('TOO_MANY_PAGES');

    const textHint = detectLanguage(blocks.map((b) => b.text).join('\n'));
    if (vision.length) {
      await updateDeck(deckId, { stage: 'vision' });
      blocks.push(...(await readImages(deckId, vision, hooks, textHint === 'und' ? 'auto' : textHint)));
    }
  } finally {
    for (const close of closers) void close().catch(() => undefined);
  }

  const cleaned = cleanBlocks(blocks);
  const allText = cleaned.map((b) => b.text).join('\n');
  if (!allText.trim())
    throw new IngestError(input.files.some((f) => kindOf(f) === 'pdf') ? 'NO_TEXT' : 'EMPTY');
  if (allText.length > INGEST_LIMITS.chars) throw new IngestError('TOO_LONG');

  const notesLanguage = detectLanguage(allText);
  const chunked = chunkBlocks(cleaned);
  const chunks: Chunk[] = chunked.map((c) => ({
    id: chunkKey(deckId, c.index),
    deckId,
    index: c.index,
    text: c.text,
    headingPath: c.headingPath,
    refs: c.refs,
    wordCount: c.wordCount,
  }));
  await db.transaction('rw', db.sources, db.chunks, async () => {
    await db.sources.bulkAdd(sources);
    await db.chunks.bulkAdd(chunks);
  });

  // Topic map (map in batches, then reduce).
  await updateDeck(deckId, { stage: 'topics', notesLanguage });
  hooks.onProgress({ stage: 'topics' });
  const deck = (await db.decks.get(deckId))!;
  const language =
    deck.quizLanguage === 'auto' ? (notesLanguage === 'und' ? 'auto' : notesLanguage) : deck.quizLanguage;
  const callOpts = {
    signal: hooks.signal,
    onBusy: (waitMs: number) => hooks.onProgress({ stage: 'busy', waitMs }),
  };
  const BATCH = 60;
  const batches: Chunk[][] = [];
  for (let i = 0; i < chunks.length; i += BATCH) batches.push(chunks.slice(i, i + BATCH));
  let topicMap: Array<{ id: string; title: string; summary: string; chunkIds: string[] }>;
  let detected = 'und';
  if (batches.length === 1) {
    const r = await api.topics(
      {
        stage: 'map',
        language,
        final: true,
        chunks: chunks.map((c) => ({ id: shortId(c.id), summary: chunkSummary(c) })),
      },
      callOpts,
    );
    topicMap = r.topics;
    detected = r.detectedLanguage;
  } else {
    const partial: Array<{ title: string; summary: string; chunkIds: string[] }> = [];
    for (const b of batches) {
      const r = await api.topics(
        {
          stage: 'map',
          language,
          final: false,
          chunks: b.map((c) => ({ id: shortId(c.id), summary: chunkSummary(c) })),
        },
        callOpts,
      );
      partial.push(...r.topics.map(({ title, summary, chunkIds }) => ({ title, summary, chunkIds })));
      detected = r.detectedLanguage;
    }
    const r = await api.topics(
      {
        stage: 'reduce',
        language,
        topics: partial.slice(0, 150),
        chunkIds: chunks.map((c) => shortId(c.id)),
      },
      callOpts,
    );
    topicMap = r.topics;
  }
  const finalNotesLanguage = notesLanguage === 'und' && detected !== 'und' ? detected : notesLanguage;
  const topics: TopicRecord[] = topicMap.map((t, i) => ({
    id: `${deckId}:${t.id}`,
    deckId,
    key: t.id,
    order: i,
    title: t.title,
    summary: t.summary,
    chunkIds: t.chunkIds.map((s) => `${deckId}:${s}`),
    skill: SKILL_START,
    status: 'pending',
    emptyRounds: 0,
  }));
  await db.topics.bulkAdd(topics);
  await updateDeck(deckId, { stage: 'questions', notesLanguage: finalNotesLanguage });

  // First playable questions: the first topic, then the deck is ready.
  hooks.onProgress({ stage: 'questions', topic: topics[0]!.title });
  await ensureTopicQuestions(topics[0]!.id, 4, { signal: hooks.signal, onBusy: callOpts.onBusy });
  const count = await db.questions.where('deckId').equals(deckId).count();
  if (count === 0) throw new ApiFailure('UPSTREAM');
  await updateDeck(deckId, { status: 'ready', stage: 'done' });
  startBackgroundGeneration(deckId);
}
