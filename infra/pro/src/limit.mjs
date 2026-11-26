/**
 * An in-memory limit per caller and route, kept by each answering instance: so many requests in a
 * window, past which a refusal. It slows a loop or a guess down; the cap that holds is the
 * account's weekly spend, kept in the database.
 */
export const LIMIT = { limit: 60, windowMs: 60_000, size: 2000 };

export function rateLimiter({ limit, windowMs, size } = LIMIT, now = Date.now) {
  const seen = new Map(); // key -> request times in the window, oldest key first
  return {
    take(key) {
      const at = now();
      const times = (seen.get(key) ?? []).filter((time) => at - time < windowMs);
      seen.delete(key);
      if (times.length >= limit) {
        seen.set(key, times);
        return { ok: false };
      }
      times.push(at);
      seen.set(key, times);
      while (seen.size > size) seen.delete(seen.keys().next().value);
      return { ok: true };
    },
  };
}
