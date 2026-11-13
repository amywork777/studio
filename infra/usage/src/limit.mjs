/**
 * An in-memory rate limit per caller, kept by each answering instance; past it, a refusal and the
 * wait, nothing queued. Keys are held only as hashes with the instance's unwritten salt, for their
 * window, in a map of at most `size` keys, oldest evicted. From text-to-cad's `apps/api` (MIT).
 */
import * as NodeCrypto from "node:crypto";

export const FORGET_LIMIT = { limit: 5, windowMs: 10 * 60_000, size: 1000 };

/**
 * Per client address. One Studio sends at most about 60 batches a minute (one a second, 20 events
 * each), a few in real use; 120 leaves room for several people behind one address or a backlog sent
 * after being offline. Studio retries a refused batch five times, each wait longer.
 */
export const EVENTS_LIMIT = { limit: 120, windowMs: 60_000, size: 1000 };

/** Wrong passwords for the numbers page (`/`): ten per address every ten minutes. */
export const PASSWORD_LIMIT = { limit: 10, windowMs: 10 * 60_000, size: 1000 };

/**
 * @param {{ limit?: number, windowMs?: number, size?: number, now?: () => number }} [options]
 * @returns {{ take(key: string): { ok: true } | { ok: false, retryAfter: number }, readonly size: number }}
 *   `take`: counts one request under `key`; refused, it counts nothing and says how many seconds to wait.
 */
export function rateLimiter({
  limit = FORGET_LIMIT.limit,
  windowMs = FORGET_LIMIT.windowMs,
  size = FORGET_LIMIT.size,
  now = Date.now,
} = {}) {
  const salt = NodeCrypto.randomBytes(16);
  const seen = new Map(); // hashed key -> the times of its requests in the window, oldest first; oldest key first
  const hash = (key) =>
    NodeCrypto.createHash("sha256").update(salt).update(String(key)).digest("base64url");
  return {
    take(key) {
      const at = now();
      const id = hash(key);
      const times = (seen.get(id) ?? []).filter((time) => at - time < windowMs);
      seen.delete(id); // re-inserted below as the newest
      if (times.length >= limit) {
        seen.set(id, times);
        return { ok: false, retryAfter: Math.max(1, Math.ceil((times[0] + windowMs - at) / 1000)) };
      }
      times.push(at);
      seen.set(id, times);
      while (seen.size > size) seen.delete(seen.keys().next().value);
      return { ok: true };
    },
    get size() {
      return seen.size;
    },
  };
}

/**
 * The client's address as the host gives it: Vercel's own `x-vercel-forwarded-for`, else the first hop of
 * `x-forwarded-for`. Null when neither names one.
 * @param {Headers} headers
 */
export function clientOf(headers) {
  const address = (headers.get("x-vercel-forwarded-for") || headers.get("x-forwarded-for") || "")
    .split(",")[0]
    .trim();
  return address || null;
}
