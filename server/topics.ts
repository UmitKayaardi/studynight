/** Topic map: map (batch of chunk summaries) and reduce (merge partial topics), with deterministic repair. */
import type { Topic, TopicsRequest, TopicsResponse } from '../shared/api.js';
import { getConfig } from './env.js';
import { ApiError } from './errors.js';
import { chatJson } from './groq.js';
import { topicsMapSystem, topicsReduceSystem } from './prompts.js';

export const MAX_TOPICS = 15;

/** Target topic range for a number of chunks: roughly one topic per 3–4 chunks, 4–15 when possible. */
export function topicRange(chunks: number, final: boolean): { min: number; max: number } {
  if (!final) return { min: 2, max: Math.min(8, Math.max(2, Math.ceil(chunks / 3))) };
  const max = Math.min(MAX_TOPICS, Math.max(1, Math.ceil(chunks / 2)));
  const min = Math.min(4, max);
  return { min, max: Math.max(min, Math.min(max, Math.ceil(chunks / 3) + 3)) };
}

interface RawTopic {
  title?: unknown;
  summary?: unknown;
  chunkIds?: unknown;
}

/**
 * Repairs a model topic list: keeps only known chunk ids, drops empty topics, merges duplicate titles,
 * assigns every orphan chunk to the topic of its nearest preceding (or following) chunk, caps the count
 * by merging the smallest topic into its neighbour, and numbers the topics.
 */
export function repairTopics(raw: RawTopic[], order: string[], maxTopics = MAX_TOPICS): Topic[] {
  const known = new Set(order);
  const pos = new Map(order.map((id, i) => [id, i]));
  let topics = raw
    .map((t) => ({
      title: String(t.title ?? '')
        .trim()
        .slice(0, 120),
      summary: String(t.summary ?? '')
        .trim()
        .slice(0, 300),
      chunkIds: [
        ...new Set((Array.isArray(t.chunkIds) ? t.chunkIds : []).map(String).filter((id) => known.has(id))),
      ],
    }))
    .filter((t) => t.title && t.chunkIds.length);

  // Merge topics with the same title.
  const byTitle = new Map<string, (typeof topics)[number]>();
  for (const t of topics) {
    const key = t.title.toLowerCase();
    const prev = byTitle.get(key);
    if (prev) prev.chunkIds = [...new Set([...prev.chunkIds, ...t.chunkIds])];
    else byTitle.set(key, t);
  }
  topics = [...byTitle.values()];

  if (!topics.length) {
    throw new ApiError('UPSTREAM');
  }

  // Cap the number of topics: merge the smallest into the topic whose chunks are closest.
  const centre = (t: (typeof topics)[number]) =>
    t.chunkIds.reduce((s, id) => s + pos.get(id)!, 0) / t.chunkIds.length;
  while (topics.length > maxTopics) {
    topics.sort((a, b) => a.chunkIds.length - b.chunkIds.length);
    const small = topics.shift()!;
    const c = centre(small);
    let best = topics[0]!;
    for (const t of topics) if (Math.abs(centre(t) - c) < Math.abs(centre(best) - c)) best = t;
    best.chunkIds = [...new Set([...best.chunkIds, ...small.chunkIds])];
  }

  // Orphans: give each to the topic of the nearest assigned chunk (preceding first).
  const owner = new Map<string, number>();
  topics.forEach((t, i) => t.chunkIds.forEach((id) => owner.has(id) || owner.set(id, i)));
  for (let i = 0; i < order.length; i++) {
    const id = order[i]!;
    if (owner.has(id)) continue;
    let target: number | undefined;
    for (let d = 1; d < order.length && target === undefined; d++) {
      const before = order[i - d];
      const after = order[i + d];
      if (before !== undefined && owner.has(before)) target = owner.get(before);
      else if (after !== undefined && owner.has(after)) target = owner.get(after);
    }
    target ??= 0;
    topics[target]!.chunkIds.push(id);
    owner.set(id, target);
  }

  // Document order: topics by their first chunk, chunk ids sorted.
  topics.forEach((t) => t.chunkIds.sort((a, b) => pos.get(a)! - pos.get(b)!));
  topics.sort((a, b) => pos.get(a.chunkIds[0]!)! - pos.get(b.chunkIds[0]!)!);
  return topics.map((t, i) => ({ id: `t${i + 1}`, ...t }));
}

export async function buildTopics(req: TopicsRequest): Promise<TopicsResponse> {
  const cfg = getConfig();
  const order = req.stage === 'map' ? req.chunks.map((c) => c.id) : req.chunkIds;
  const final = req.stage === 'reduce' || req.final;
  const { min, max } = topicRange(order.length, final);
  const system =
    req.stage === 'map'
      ? topicsMapSystem(req.language, min, max)
      : topicsReduceSystem(req.language, min, max);
  const user =
    req.stage === 'map'
      ? req.chunks.map((c) => `[${c.id}] ${c.summary.replaceAll('<<<', '‹‹‹')}`).join('\n')
      : req.topics
          .map((t, i) => `${i + 1}. ${t.title} — ${t.summary} (chunks: ${t.chunkIds.join(', ')})`)
          .join('\n');
  const out = (await chatJson({
    model: cfg.generator,
    fallbackModel: cfg.generatorFallback,
    system,
    user: req.stage === 'map' ? `<<<SOURCE id="summaries">>>\n${user}\n<<<END>>>` : user,
    temperature: 0.2,
    maxTokens: 4000,
    timeoutMs: 30_000,
    reasoningEffort: 'low',
  })) as { language?: unknown; topics?: unknown };
  const raw = Array.isArray(out.topics) ? (out.topics as RawTopic[]) : [];
  const topics = repairTopics(raw, order, final ? MAX_TOPICS : max);
  const lang =
    typeof out.language === 'string' && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(out.language)
      ? out.language
      : 'und';
  return { topics, detectedLanguage: lang };
}
