/**
 * Pro's tables (schema.sql), Supabase over PostgREST so only `fetch` (handed in for tests) is
 * needed. Only this server holds the service role key, and RLS with no policy shuts everyone else out.
 */
export const SETTINGS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_STARTER",
  "STRIPE_PRICE_PRO",
  "LICENSE_SECRET",
  "OPENROUTER_API_KEY",
];
const TIMEOUT_MS = 8000;

/** The settings a host lacks, by name: what /v1/health reports. */
export function missingSettings(env) {
  return SETTINGS.filter((name) => !env[name]?.trim());
}

/** @param {{ url: string, key: string, fetch?: typeof fetch }} options */
export function databaseStore({ url, key, fetch: send = fetch }) {
  const rest = `${url.replace(/\/+$/, "")}/rest/v1`;
  const headers = { apikey: key, authorization: `Bearer ${key}` };
  const call = async (path, init = {}) => {
    const response = await send(`${rest}/${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw Object.assign(new Error(`the database answered ${response.status}`), {
        code: `database_${response.status}`,
      });
    }
    // `return=minimal` answers 201 or 204 with no body at all.
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
  const one = async (path) => (await call(path))?.[0] ?? null;
  const eq = (value) => `eq.${encodeURIComponent(value)}`;
  return {
    addClaim: ({ claimHash, sessionId, plan }) =>
      call("pro_claims?on_conflict=claim_hash", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ claim_hash: claimHash, session_id: sessionId, plan }),
      }),
    claimByHash: (claimHash) => one(`pro_claims?claim_hash=${eq(claimHash)}&select=*`),
    markClaimed: (claimHash, accountId) =>
      call(`pro_claims?claim_hash=${eq(claimHash)}`, {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify({ account_id: accountId, claimed_at: new Date().toISOString() }),
      }),
    /** The account for a Stripe customer, made or brought up to date; answers the row as kept. */
    async saveAccount(account) {
      const rows = await call("pro_accounts?on_conflict=stripe_customer", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(account),
      });
      return rows[0];
    },
    account: (id) => one(`pro_accounts?id=${eq(id)}&select=*`),
    updateAccount: (id, patch) =>
      call(`pro_accounts?id=${eq(id)}`, {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify(patch),
      }),
    addUsage: (row) =>
      call("pro_usage", {
        method: "POST",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify(row),
      }),
    async weekSpend(accountId) {
      const spent = await call("rpc/pro_week_spend", {
        method: "POST",
        body: JSON.stringify({ account: accountId }),
      });
      return Number(spent) || 0;
    },
    ready: () => call("pro_accounts?select=id&limit=1").then(() => undefined),
  };
}
