/**
 * Typed client for the /api functions. Every response is validated with Zod. Errors become `ApiFailure` with a
 * code the UI can translate; rate limits are retried with jittered back-off before giving up.
 */
import type { ZodType } from 'zod';
import {
  AskResponseSchema,
  ErrorBodySchema,
  GradeResponseSchema,
  HealthResponseSchema,
  QuestionsResponseSchema,
  ReadImageResponseSchema,
  TopicsResponseSchema,
  TranscribeResponseSchema,
  type AskRequest,
  type ErrorCode,
  type GradeRequest,
  type QuestionsRequest,
  type ReadImageRequest,
  type TopicsRequest,
  type TranscribeRequest,
} from '../../shared/api';

export type FailureCode = ErrorCode | 'OFFLINE';

export class ApiFailure extends Error {
  constructor(
    readonly code: FailureCode,
    readonly retryAfter?: number,
  ) {
    super(code);
    this.name = 'ApiFailure';
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

export interface CallOptions {
  signal?: AbortSignal;
  /** Rate-limit retries before giving up (default 3). */
  retries?: number;
  timeoutMs?: number;
  /** Called when the request is waiting because the service is busy. */
  onBusy?: (waitMs: number) => void;
}

async function post<T>(path: string, body: unknown, schema: ZodType<T>, o: CallOptions = {}): Promise<T> {
  const retries = o.retries ?? 3;
  for (let attempt = 0; ; attempt++) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ApiFailure('OFFLINE');
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 90_000);
    const onAbort = () => ctrl.abort();
    o.signal?.addEventListener('abort', onAbort);
    let res: Response;
    try {
      res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      if (o.signal?.aborted) throw e;
      throw new ApiFailure(
        ctrl.signal.aborted ? 'TIMEOUT' : navigator.onLine === false ? 'OFFLINE' : 'UPSTREAM',
      );
    } finally {
      clearTimeout(timeout);
      o.signal?.removeEventListener('abort', onAbort);
    }
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) {
      const parsed = schema.safeParse(json);
      if (!parsed.success) throw new ApiFailure('UPSTREAM');
      return parsed.data;
    }
    const err = ErrorBodySchema.safeParse(json);
    const code: ErrorCode = err.success
      ? err.data.error.code
      : res.status === 429
        ? 'RATE_LIMITED'
        : 'UPSTREAM';
    const retryAfter = Number(res.headers.get('retry-after')) || undefined;
    if (code === 'RATE_LIMITED' && attempt < retries) {
      const wait = Math.min(30_000, (retryAfter ?? 3) * 1000 + Math.random() * 2000 * (attempt + 1));
      o.onBusy?.(wait);
      await sleep(wait, o.signal);
      continue;
    }
    throw new ApiFailure(code, retryAfter);
  }
}

export const api = {
  topics: (b: TopicsRequest, o?: CallOptions) => post('/api/topics', b, TopicsResponseSchema, o),
  questions: (b: QuestionsRequest, o?: CallOptions) => post('/api/questions', b, QuestionsResponseSchema, o),
  grade: (b: GradeRequest, o?: CallOptions) => post('/api/grade', b, GradeResponseSchema, o),
  ask: (b: AskRequest, o?: CallOptions) => post('/api/ask', b, AskResponseSchema, o),
  readImage: (b: ReadImageRequest, o?: CallOptions) => post('/api/read-image', b, ReadImageResponseSchema, o),
  transcribe: (b: TranscribeRequest, o?: CallOptions) =>
    post('/api/transcribe', b, TranscribeResponseSchema, o),
  async health() {
    const res = await fetch('/api/health');
    return HealthResponseSchema.parse(await res.json());
  },
};

export function isAbort(e: unknown): boolean {
  return (e as { name?: string })?.name === 'AbortError';
}
