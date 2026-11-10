/**
 * The store: Studio's own Postgres table, as Backplane keeps its own (no analytics vendor). It is a Supabase
 * project reached through its REST API (PostgREST), so the function needs nothing but `fetch`. Every row a batch
 * makes (`events.mjs`) becomes one row of `usage_events` (schema.sql), keyed by the event's own id: a batch
 * sent again inserts nothing new (`resolution=ignore-duplicates`). Beside the batch's context and the event's
 * properties it keeps the country the host placed the request in, never the IP address nor anything finer.
 *
 * An opt-out deletes every row under the install's id (`/forget`), at once.
 *
 * Its settings are the host's (api/v1.mjs): the project's URL and its service role key, which only this
 * function holds; the table allows nothing to anyone else (schema.sql turns row-level security on with no
 * policy). `fetch` is handed in, so the tests need no network.
 */

export const SETTINGS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const TABLE = "usage_events";
const TIMEOUT_MS = 8000; // well inside a function's own limit: a database that hangs is a failure, and the batch waits
// How long an instance keeps health's answer: /v1/health is open to anyone.
export const READY_TTL_MS = 60_000;

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
    // The numbers page's rows (page.mjs): the two daily views from `since` (`YYYY-MM-DD`) on, nothing finer.
    async numbers(since) {
      const view = (name, order) =>
        call(`${url}/rest/v1/${name}?day=gte.${since}&order=${order}`).then((answer) =>
          answer.json(),
        );
      const [installs, events] = await Promise.all([
        view("usage_daily_installs", "day.desc"),
        view("usage_daily_events", "day.desc,times.desc"),
      ]);
      return { installs, events };
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
