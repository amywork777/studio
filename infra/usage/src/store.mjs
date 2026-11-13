/**
 * Studio's own Postgres table, Supabase over PostgREST so only `fetch` (handed in for tests) is
 * needed. Rows are keyed by event id, so a resent batch adds nothing; the country is kept, never the
 * IP. Only this function holds the service role key, and RLS with no policy shuts everyone else out.
 */

export const SETTINGS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const TABLE = "usage_events";
const TIMEOUT_MS = 8000; // well inside a function's own limit: a database that hangs is a failure, and the batch waits
// How long an instance keeps health's answer: /v1/health is open to anyone.
export const READY_TTL_MS = 60_000;
// The database answers at most this many rows a call; the page reads launches this many calls at most.
const PAGE_ROWS = 1000;
const LAUNCH_PAGES = 50;

/** The settings a host lacks, by name: missing, or not what the store would take (health says so). */
export function missingSettings(env) {
  const valid = { SUPABASE_URL: (value) => /^https:\/\/[^\s/]+\/?$/.test(value ?? "") };
  return SETTINGS.filter((name) => !(env[name] && (valid[name] ?? Boolean)(env[name])));
}

/** The store's settings, from the host's environment. */
export function settingsOf(env) {
  return { url: (env.SUPABASE_URL ?? "").replace(/\/+$/, ""), key: env.SUPABASE_SERVICE_ROLE_KEY };
}

/** A row as the table keeps it. */
export function recordOf(row, country) {
  return {
    id: row.id,
    install: row.install,
    event: row.event,
    at: row.at,
    version: row.version,
    platform: row.platform,
    arch: row.arch,
    mode: row.mode,
    country: country ?? null,
    properties: row.properties,
  };
}

/**
 * @param {{ url: string, key: string }} settings
 * @param {{ fetch?: typeof fetch, now?: () => number }} [options] `now`: the clock health's answer is kept by.
 */
export function databaseStore({ url, key }, { fetch: send = fetch, now = Date.now } = {}) {
  const rest = `${url}/rest/v1/${TABLE}`;
  const headers = { apikey: key, authorization: `Bearer ${key}` };
  // Anything but a 2xx is the receiver's failure, never the client's: a 5xx tells it to keep its batch, or
  // the deletion it owes, and ask again. The database's answer is named by its status alone.
  const call = async (target, init = {}) => {
    const response = await send(target, {
      ...init,
      headers: { ...headers, ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw Object.assign(new Error(`the database answered ${response.status}`), {
        code: `database_${response.status}`,
      });
    }
    return response;
  };
  let checked = null;
  return {
    /** @param {object[]} rows @param {{ country?: string | null }} [context] */
    async insert(rows, { country = null } = {}) {
      await call(`${rest}?on_conflict=id`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          prefer: "resolution=ignore-duplicates,return=minimal",
        },
        body: JSON.stringify(rows.map((row) => recordOf(row, country))),
      });
    },
    async forget(install) {
      await call(`${rest}?install=eq.${encodeURIComponent(install)}`, {
        method: "DELETE",
        headers: { prefer: "return=minimal" },
      });
    },
    // Rows for page.mjs from `since` (`YYYY-MM-DD`): the daily views, failed-turn counts and the first
    // 1000 failed turns, and each launch's version (`client.connected`), read a page at a time since the
    // database answers 1000 rows a call.
    async numbers(since) {
      const view = (name, order) =>
        call(`${url}/rest/v1/${name}?day=gte.${since}&order=${order}`).then((answer) =>
          answer.json(),
        );
      const failedTurns = call(
        `${rest}?select=id&event=eq.provider.turn.completed&properties->>terminalStatus=eq.failed&at=gte.${since}`,
        { method: "HEAD", headers: { prefer: "count=exact" } },
      ).then((answer) => Number(answer.headers.get("content-range")?.split("/")[1] ?? 0));
      const failedRows = (query) =>
        call(`${rest}?${query}&at=gte.${since}&order=id&limit=${PAGE_ROWS}`).then((answer) =>
          answer.json(),
        );
      const failures = Promise.all([
        failedRows(
          "select=install,provider:properties->>provider,model:properties->>model&event=eq.provider.turn.completed&properties->>terminalStatus=eq.failed",
        ),
        failedRows(
          "select=install,provider:properties->>provider,reason:properties->>reason&event=eq.provider.turn.failed",
        ),
      ]).then(([turns, reasons]) => ({ turns, reasons }));
      const launches = async () => {
        const rows = [];
        for (let page = 0; page < LAUNCH_PAGES; page += 1) {
          const answer = await call(
            `${rest}?select=version,install&event=eq.client.connected&at=gte.${since}&order=id&limit=${PAGE_ROWS}&offset=${page * PAGE_ROWS}`,
          );
          const found = await answer.json();
          rows.push(...found);
          if (found.length < PAGE_ROWS) return { rows, complete: true };
        }
        return { rows, complete: false };
      };
      const [installs, events, failed, failedWhy, versions] = await Promise.all([
        view("usage_daily_installs", "day.desc"),
        view("usage_daily_events", "day.desc,times.desc"),
        failedTurns,
        failures,
        launches(),
      ]);
      return { installs, events, failedTurns: failed, failures: failedWhy, launches: versions };
    },
    // Health's question: the table is there and answers to the key. Kept, failure or not, for READY_TTL_MS.
    ready() {
      const at = now();
      if (!checked || at - checked.at >= READY_TTL_MS) {
        checked = { at, answer: call(`${rest}?select=id&limit=1`).then(() => undefined) };
      }
      return checked.answer;
    },
  };
}
