/**
 * Fixed-window, per-key request limiter held in memory.
 *
 * Best-effort only: each server instance counts separately and counts reset on
 * cold start, so this dampens abuse from one signed-in account rather than
 * guaranteeing a global quota. A durable limiter (shared store) is tracked in #7.
 */
type Window = { start: number; count: number };

const windows = new Map<string, Window>();
const MAX_KEYS = 10_000;

/** retryAfterSeconds is 0 when the request is allowed. */
export type RateLimitResult = { ok: boolean; retryAfterSeconds: number };

export function rateLimit(
  key: string,
  { limit, windowMs, now = Date.now() }: { limit: number; windowMs: number; now?: number },
): RateLimitResult {
  let entry = windows.get(key);
  if (!entry || now - entry.start >= windowMs) {
    entry = { start: now, count: 0 };
    windows.set(key, entry);
    if (windows.size > MAX_KEYS) {
      for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
    }
  }
  entry.count++;
  if (entry.count <= limit) return { ok: true, retryAfterSeconds: 0 };
  return {
    ok: false,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.start + windowMs - now) / 1000)),
  };
}

/** Test helper. */
export function resetRateLimits(): void {
  windows.clear();
}
