/**
 * Thin wrapper over the official groq-sdk: JSON chat completions with timeouts, exponential back-off with
 * jitter on 429, and a per-model fallback (Groq free-tier limits are per model). Errors are mapped to our
 * codes; upstream messages and request content are never logged or returned.
 */
import Groq, { toFile } from 'groq-sdk';
import { ApiError } from './errors.js';
import { getConfig } from './env.js';

export interface ChatJsonOptions {
  model: string;
  fallbackModel?: string;
  system: string;
  user: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
  temperature?: number;
  maxTokens: number;
  timeoutMs: number;
  /** For reasoning models (gpt-oss): how much to think. */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export interface ChatClient {
  chat(opts: {
    model: string;
    system: string;
    user: ChatJsonOptions['user'];
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
    reasoningEffort?: ChatJsonOptions['reasoningEffort'];
  }): Promise<string>;
  transcribe(opts: {
    model: string;
    audio: Buffer;
    fileName: string;
    prompt: string;
    language?: string;
    timeoutMs: number;
  }): Promise<{
    text: string;
    language: string;
  }>;
}

class GroqClient implements ChatClient {
  private client: Groq;
  constructor(apiKey: string) {
    this.client = new Groq({ apiKey, maxRetries: 0 });
  }

  async chat(o: Parameters<ChatClient['chat']>[0]): Promise<string> {
    const isGptOss = o.model.startsWith('openai/gpt-oss');
    const isQwen = o.model.startsWith('qwen/');
    const res = await this.client.chat.completions.create(
      {
        model: o.model,
        messages: [
          { role: 'system', content: o.system },
          { role: 'user', content: o.user as string },
        ],
        temperature: o.temperature,
        max_completion_tokens: o.maxTokens,
        response_format: { type: 'json_object' },
        ...(isGptOss && o.reasoningEffort ? { reasoning_effort: o.reasoningEffort } : {}),
        ...(isQwen ? { reasoning_format: 'hidden' as const } : {}),
      },
      { timeout: o.timeoutMs },
    );
    return res.choices[0]?.message?.content ?? '';
  }

  async transcribe(o: Parameters<ChatClient['transcribe']>[0]) {
    const res = (await this.client.audio.transcriptions.create(
      {
        file: await toFile(o.audio, o.fileName),
        model: o.model,
        prompt: o.prompt || undefined,
        language: o.language,
        response_format: 'verbose_json',
        temperature: 0,
      },
      { timeout: o.timeoutMs },
    )) as unknown as { text: string; language?: string };
    return { text: res.text ?? '', language: res.language ?? 'und' };
  }
}

let override: ChatClient | null = null;
let cached: { key: string; client: ChatClient } | null = null;

/** Tests inject a fake client here; production uses the real Groq client. */
export function setChatClient(c: ChatClient | null): void {
  override = c;
}

export function getChatClient(): ChatClient {
  if (override) return override;
  const { apiKey } = getConfig();
  if (!apiKey) throw new ApiError('UPSTREAM');
  if (!cached || cached.key !== apiKey) cached = { key: apiKey, client: new GroqClient(apiKey) };
  return cached.client;
}

/** Maps an SDK/network error to an API error code. */
export function mapError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  const err = e as { status?: number; name?: string; headers?: Headers | Record<string, string> };
  const status = err?.status;
  if (status === 429) {
    const h = err.headers;
    const ra = h instanceof Headers ? h.get('retry-after') : (h?.['retry-after'] ?? null);
    return new ApiError('RATE_LIMITED', ra ? Number(ra) || 10 : 10);
  }
  if (status === 413) return new ApiError('TOO_LARGE');
  if (status === 400 || status === 422) return new ApiError('UNREADABLE');
  const name = err?.name ?? '';
  if (/Timeout|Abort/i.test(name)) return new ApiError('TIMEOUT');
  return new ApiError('UPSTREAM');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Exponential back-off with full jitter: random in [0, base × 2^attempt]. */
export function backoffMs(attempt: number, base = 700, random = Math.random): number {
  return Math.round(random() * base * 2 ** attempt);
}

/** Extracts the first JSON object from a model reply (tolerates code fences or stray text). */
export function parseJsonObject(text: string): unknown {
  const t = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new ApiError('UPSTREAM');
  }
}

/**
 * Calls the model and returns parsed JSON. On 429 it switches to the fallback model (separate quota), then
 * backs off and retries within the time budget. On invalid JSON it retries once.
 */
export async function chatJson(
  o: ChatJsonOptions,
  deadline = Date.now() + o.timeoutMs + 8_000,
): Promise<unknown> {
  const client = getChatClient();
  const models = [o.model, ...(o.fallbackModel && o.fallbackModel !== o.model ? [o.fallbackModel] : [])];
  let lastError: ApiError = new ApiError('UPSTREAM');
  let jsonRetries = 1;
  for (let attempt = 0; attempt < 4; attempt++) {
    const model = models[Math.min(attempt, models.length - 1)]!;
    const remaining = deadline - Date.now();
    if (remaining < 2_000) break;
    try {
      const text = await client.chat({
        model,
        system: o.system,
        user: o.user,
        temperature: o.temperature ?? 0.4,
        maxTokens: o.maxTokens,
        timeoutMs: Math.min(o.timeoutMs, remaining),
        reasoningEffort: o.reasoningEffort,
      });
      try {
        return parseJsonObject(text);
      } catch (e) {
        lastError = mapError(e);
        if (jsonRetries-- > 0) continue;
        throw lastError;
      }
    } catch (e) {
      lastError = mapError(e);
      if (lastError.code === 'RATE_LIMITED') {
        // First retry goes straight to the fallback model; later ones wait with jittered back-off.
        if (attempt + 1 >= models.length) {
          const wait = Math.min(
            backoffMs(attempt),
            (lastError.retryAfter ?? 2) * 1000,
            deadline - Date.now() - 2_500,
          );
          if (wait <= 0) break;
          await sleep(wait);
        }
        continue;
      }
      if (lastError.code === 'UPSTREAM' && attempt === 0) continue; // one retry for transient 5xx
      throw lastError;
    }
  }
  throw lastError;
}

export async function transcribe(
  o: { audio: Buffer; fileName: string; prompt: string; language?: string },
  models: string[],
): Promise<{ text: string; language: string }> {
  const client = getChatClient();
  let last: ApiError = new ApiError('UPSTREAM');
  for (const model of models) {
    try {
      return await client.transcribe({ ...o, model, timeoutMs: 25_000 });
    } catch (e) {
      last = mapError(e);
      if (last.code !== 'RATE_LIMITED' && last.code !== 'UPSTREAM') throw last;
    }
  }
  throw last;
}
