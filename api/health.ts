import type { HealthResponse } from '../shared/api.js';
import { getConfig } from '../server/env.js';
import { json } from '../server/errors.js';

/** Liveness + configured model names. Never exposes the key (only whether one is configured). */
export function GET(): Response {
  const c = getConfig();
  const body: HealthResponse = {
    ok: true,
    configured: !!c.apiKey,
    models: { generator: c.generator, verifier: c.verifier, vision: c.vision, stt: c.stt },
  };
  return json(body);
}
