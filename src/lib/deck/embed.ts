/** Smart search: downloads the embedding model once, embeds a deck's chunks and questions in the background. */
import { create } from 'zustand';
import { db } from '../../db/schema';
import { updateDeck } from '../../db/repo';
import { questionKeyText } from '../../../shared/question';
import { embedClient } from '../search/embedClient';

export type SmartStatus = 'idle' | 'downloading' | 'embedding' | 'ready' | 'error';

interface SmartState {
  status: SmartStatus;
  loaded: number;
  total: number;
  set: (p: Partial<Omit<SmartState, 'set'>>) => void;
}

export const useSmartSearch = create<SmartState>((set) => ({
  status: 'idle',
  loaded: 0,
  total: 0,
  set: (p) => set(p),
}));

let loading: Promise<void> | null = null;

/** Loads the model (downloading it the first time). Never throws: failures fall back to keyword search. */
export function loadSmartSearch(): Promise<void> {
  if (embedClient.ready) return Promise.resolve();
  if (!loading) {
    const s = useSmartSearch.getState();
    s.set({ status: 'downloading', loaded: 0, total: 0 });
    const off = embedClient.onProgress((loaded, total) => useSmartSearch.getState().set({ loaded, total }));
    loading = embedClient
      .load()
      .then(() => useSmartSearch.getState().set({ status: 'ready' }))
      .catch(() => useSmartSearch.getState().set({ status: 'error' }))
      .finally(() => {
        off();
        loading = null;
      });
  }
  return loading;
}

const running = new Set<string>();

/** Embeds everything in a deck that has no vector yet, then hands the vectors to the search worker. */
export async function embedDeck(deckId: string): Promise<void> {
  if (running.has(deckId)) return;
  running.add(deckId);
  try {
    await loadSmartSearch();
    if (!embedClient.ready) return;
    useSmartSearch.getState().set({ status: 'embedding' });
    const chunks = await db.chunks.where('deckId').equals(deckId).toArray();
    const missing = chunks.filter((c) => !c.vector);
    for (let i = 0; i < missing.length; i += 8) {
      const batch = missing.slice(i, i + 8);
      const vectors = await embedClient.embed(
        batch.map((c) => c.text),
        'passage',
      );
      await db.transaction('rw', db.chunks, async () => {
        for (let k = 0; k < batch.length; k++)
          if (vectors[k]) await db.chunks.update(batch[k]!.id, { vector: vectors[k] });
      });
    }
    const questions = (await db.questions.where('deckId').equals(deckId).toArray()).filter((q) => !q.vector);
    for (let i = 0; i < questions.length; i += 16) {
      const batch = questions.slice(i, i + 16);
      const vectors = await embedClient.embed(
        batch.map((q) => questionKeyText(q.content)),
        'query',
      );
      await db.transaction('rw', db.questions, async () => {
        for (let k = 0; k < batch.length; k++)
          if (vectors[k]) await db.questions.update(batch[k]!.id, { vector: vectors[k] });
      });
    }
    await updateDeck(deckId, { embedState: 'done' });
    await ensureIndex(deckId, true);
    useSmartSearch.getState().set({ status: 'ready' });
  } catch {
    useSmartSearch.getState().set({ status: embedClient.ready ? 'ready' : 'error' });
  } finally {
    running.delete(deckId);
  }
}

/** Gives the search worker this deck's vectors (once per app session). */
export async function ensureIndex(deckId: string, force = false): Promise<void> {
  if (!embedClient.ready || (!force && embedClient.hasIndex(deckId))) return;
  const chunks = (await db.chunks.where('deckId').equals(deckId).toArray()).filter((c) => c.vector);
  if (chunks.length)
    await embedClient.setIndex(
      deckId,
      chunks.map((c) => ({ id: c.id, vector: c.vector! })),
    );
}
