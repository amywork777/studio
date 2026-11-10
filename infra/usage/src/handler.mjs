/**
 * Studio's usage receiver, after text-to-cad's (`apps/api/src/handler.mjs` there): the one place Studio sends
 * usage counts, served by this project's one function (`api/v1.mjs`, which vercel.json sends every /v1 path
 * to). A plain fetch handler over a `store` (Studio's own table, store.mjs), so what keeps the counts can
 * change without a release of Studio, and no build of Studio carries a key to it.
 *
 *   POST   /v1/events          a batch of counts (events.mjs) -> 204, or 429 past the limit per address
 *                              (limit.mjs)
 *   POST   /v1/forget          {install}: forget everything sent under an install id -> 204, or 429 past
 *                              the limit per address and per install id (limit.mjs)
 *   GET    /v1/health          -> 200, or 503 naming a missing setting (store.mjs: SETTINGS)
 *                              or the database's status when it will not answer
 *
 * It keeps no IP address and passes on nothing the batch does not name. The one thing it adds is the
 * country the host places the request in, on each of the batch's events.
 */
import { Invalid, isUuid, MAX_BYTES, rowsOf } from "./events.mjs";

const COUNTRY = /^[A-Z]{2}$/; // ISO 3166-1 alpha-2, as the host gives it; anything else is no country
const JSON_TYPE = /^application\/json\s*(?:;|$)/i;

// No CORS headers, so no page can read a reply, and every POST a browser sends is refused below.
const reply = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
  });

// An error by its code or its name only: a service's message can quote what it was sent, an install id among
// them, and the host's logs keep each line beside the caller's IP address.
const codeOf = (error) =>
  (typeof error?.code === "string" && error.code) ||
  (typeof error?.name === "string" && error.name) ||
  "error";

// A refused request is logged with a reason and nothing it carried: an `Invalid` message names a field's
// path or a rule, and only an unknown field's own key, kept when it is a plain name.
const PLAIN_NAME = /^[a-z][a-z_]{0,31}$/;
const KEPT_MESSAGE = /^[A-Za-z0-9_.,:'[\] -]{1,200}$/;
export function reasonOf(message) {
  const reason = String(message).replace(/\bunknown field (.*)$/s, (_, key) =>
    PLAIN_NAME.test(key) ? `unknown field ${key}` : "unknown field",
  );
  return KEPT_MESSAGE.test(reason) ? reason : "invalid";
}
const ENDPOINTS = new Set(["/v1/events", "/v1/forget"]);
const refuse = (status, path, reason) => {
  console.warn(`usage ${ENDPOINTS.has(path) ? path : "request"} refused ${status}: ${reason}`);
  return reply(status, { error: reason });
};

async function json(request) {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BYTES)
    throw new Invalid("the batch is too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new Invalid("the body is not JSON");
  }
}

/**
 * @param {Request} request
 * @param {{ insert(rows: object[], context: { country: string | null }): Promise<void>,
 *   forget(id: string): Promise<void>, ready(): Promise<void> }} store
 * @typedef {{ take(key: string): { ok: boolean, retryAfter?: number } }} Limiter
 * @param {{ missing?: string[], country?: string | null, limiter?: Limiter, eventsLimiter?: Limiter,
 *   client?: string | null }} [options] `missing`: settings the host lacks, by name. `country`: where the
 *   host places the request. `limiter`: how often one caller may ask to forget, by `client`, the address
 *   the host says the request came from, and by install id. `eventsLimiter`: how often one `client` may
 *   send a batch.
 */
export async function handle(
  request,
  store,
  { missing = [], country, limiter, eventsLimiter, client } = {},
) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  // Past a limit, a refusal and the seconds to wait. Nothing the request carried is read or kept.
  const limited = (by, key) => {
    const taken = by.take(key);
    if (taken.ok) return null;
    const refused = refuse(429, path, "too many requests");
    refused.headers.set("retry-after", String(taken.retryAfter));
    return refused;
  };
  try {
    if (path === "/v1/health" && request.method === "GET") {
      if (missing.length) return reply(503, { ok: false, missing });
      try {
        await store.ready();
      } catch (error) {
        return reply(503, { ok: false, error: codeOf(error) });
      }
      return reply(200, { ok: true });
    }
    // No browser posts here: Studio's server sends no Origin header, while a browser sends one with every POST.
    if (request.method === "POST") {
      if (request.headers.has("origin")) return refuse(403, path, "not from a browser");
      if (!JSON_TYPE.test(request.headers.get("content-type") ?? "")) {
        return refuse(415, path, "the body must be application/json");
      }
    }
    // Anyone can post a batch and each one adds rows, so an address may send only so many a minute.
    if (path === "/v1/events" && request.method === "POST") {
      if (eventsLimiter && client) {
        const refused = limited(eventsLimiter, `address ${client}`);
        if (refused) return refused;
      }
      const rows = rowsOf(await json(request));
      await store.insert(rows, { country: COUNTRY.test(country ?? "") ? country : null });
      return reply(204);
    }
    // The id rides in the body, never the path: the host's request logs keep each path beside the
    // caller's IP address. Each deletion spends the personal key, so a caller may ask only so often.
    if (path === "/v1/forget" && request.method === "POST") {
      if (limiter && client) {
        const refused = limited(limiter, `address ${client}`);
        if (refused) return refused;
      }
      const { install } = (await json(request)) ?? {};
      if (!isUuid(install)) return refuse(400, path, "not an install id");
      if (limiter) {
        const refused = limited(limiter, `install ${install.toLowerCase()}`);
        if (refused) return refused;
      }
      await store.forget(install.toLowerCase());
      return reply(204);
    }
    return reply(404, { error: "not found" });
  } catch (error) {
    if (error instanceof Invalid) return refuse(400, path, reasonOf(error.message));
    console.error("usage request failed:", codeOf(error));
    return reply(500, { error: "internal error" });
  }
}
