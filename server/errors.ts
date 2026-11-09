import type { ErrorCode } from '../shared/api.js';

const STATUS: Record<ErrorCode, number> = {
  RATE_LIMITED: 429,
  TOO_LARGE: 413,
  BAD_INPUT: 400,
  UNREADABLE: 422,
  UPSTREAM: 502,
  TIMEOUT: 504,
};

/** Generic, content-free messages. Raw upstream errors are never returned. */
const MESSAGES: Record<ErrorCode, string> = {
  RATE_LIMITED: 'The AI service is busy. Please try again in a moment.',
  TOO_LARGE: 'The request is too large.',
  BAD_INPUT: 'The request is not valid.',
  UNREADABLE: 'The content could not be read.',
  UPSTREAM: 'The AI service returned an error.',
  TIMEOUT: 'The AI service took too long to answer.',
};

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    /** Seconds the client should wait before retrying (rate limits). */
    readonly retryAfter?: number,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

const SECURITY_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...SECURITY_HEADERS, ...extra } });
}

export function errorResponse(code: ErrorCode, retryAfter?: number): Response {
  const extra: Record<string, string> = {};
  if (retryAfter) extra['retry-after'] = String(Math.ceil(retryAfter));
  return json({ error: { code, message: MESSAGES[code] } }, STATUS[code], extra);
}
