/**
 * Generous best-effort per-IP guard against scripted floods (not a usage cap): at most 120 AI requests per
 * 10 minutes per IP, per server instance. Stores only hashed-free IP strings in memory, never content.
 */

export const GUARD_LIMIT = 120;
export const GUARD_WINDOW_MS = 10 * 60_000;

export class RateGuard {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit = GUARD_LIMIT,
    private readonly windowMs = GUARD_WINDOW_MS,
  ) {}

  /** Returns 0 if allowed, otherwise the seconds until a slot frees up. */
  check(key: string, now = Date.now()): number {
    const since = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return Math.max(1, Math.ceil((list[0]! + this.windowMs - now) / 1000));
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) this.sweep(since);
    return 0;
  }

  private sweep(since: number) {
    for (const [k, v] of this.hits) if (!v.some((t) => t > since)) this.hits.delete(k);
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export const guard = new RateGuard();
