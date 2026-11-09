/**
 * Common endpoint wrapper: method + content-type + size checks, per-IP guard, Zod validation in and out,
 * error mapping. Logs contain only the endpoint, status, error code and timing — never request content.
 */
import type { ZodType } from 'zod';
import { MAX_BODY_BYTES } from '../shared/api.js';
import { ApiError, errorResponse, json } from './errors.js';
import { clientIp, guard } from './guard.js';
import { getConfig } from './env.js';

export function createHandler<I, O>(opts: {
  name: string;
  input: ZodType<I>;
  output: ZodType<O>;
  maxBytes?: number;
  run: (input: I) => Promise<O>;
}): (req: Request) => Promise<Response> {
  return async (req) => {
    const started = Date.now();
    const done = (res: Response, code?: string) => {
      if (code)
        console.error(
          JSON.stringify({ endpoint: opts.name, status: res.status, code, ms: Date.now() - started }),
        );
      return res;
    };
    try {
      if (req.method !== 'POST') return done(errorResponse('BAD_INPUT'), 'BAD_INPUT');
      if (!(req.headers.get('content-type') ?? '').includes('application/json'))
        return done(errorResponse('BAD_INPUT'), 'BAD_INPUT');
      const max = opts.maxBytes ?? MAX_BODY_BYTES;
      const declared = Number(req.headers.get('content-length') ?? '0');
      if (declared > max) return done(errorResponse('TOO_LARGE'), 'TOO_LARGE');

      const wait = guard.check(clientIp(req));
      if (wait > 0) return done(errorResponse('RATE_LIMITED', wait), 'RATE_LIMITED');
      if (!getConfig().apiKey) return done(errorResponse('UPSTREAM'), 'NO_KEY');

      const raw = await req.text();
      if (raw.length > max) return done(errorResponse('TOO_LARGE'), 'TOO_LARGE');
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return done(errorResponse('BAD_INPUT'), 'BAD_INPUT');
      }
      const parsed = opts.input.safeParse(body);
      if (!parsed.success) return done(errorResponse('BAD_INPUT'), 'BAD_INPUT');

      const result = await opts.run(parsed.data);
      const out = opts.output.safeParse(result);
      if (!out.success) return done(errorResponse('UPSTREAM'), 'BAD_OUTPUT');
      return done(json(out.data));
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('UPSTREAM');
      return done(errorResponse(err.code, err.retryAfter), err.code);
    }
  };
}
