/**
 * Studio Pro's server, one fetch handler (Vercel, or a Worker, unchanged); README.md lists its
 * routes. No prompt, answer, file or picture is kept or logged: a usage row is the account, the
 * model, token counts and cost.
 */
import { accountIdOf, claimHashOf, keyMatches, keyOf, licenseKey } from "./license.mjs";
import { meteredBody } from "./meter.mjs";
import { costOf, modelOf } from "./prices.mjs";
import { cancelledPage, welcomePage } from "./pages.mjs";
import { sessionPaid, STATUS_RUNS } from "./stripe.mjs";

export const PLANS = ["monthly", "founding"];
// What Studio's AI may cost per account per month, in dollars, unless the host says otherwise
// (CAP_MONTHLY_USD, CAP_FOUNDING_USD) or the account carries its own. README.md says why these.
export const DEFAULT_CAPS = { monthly: 25, founding: 15 };
// Vercel's most for a request body, said here so the refusal is a sentence and not Vercel's page.
export const MAX_BODY = 4.5 * 1024 * 1024;
// How long an instance trusts what it read about an account, and Stripe about a subscription.
const ACCOUNT_TTL_MS = 30_000;
const SUBSCRIPTION_TTL_MS = 6 * 60 * 60_000;
// An Upgrade click's claim stays good for a day.
const CLAIM_TTL_MS = 24 * 60 * 60_000;
// OpenRouter's Anthropic Messages endpoint: one key for Claude, GPT and the rest.
const OPENROUTER = "https://openrouter.ai/api/";
const ANTHROPIC_PATHS = {
  "v1/messages": "POST",
  "v1/messages/count_tokens": "POST",
  "v1/models": "GET",
};
const PASSED_UP = ["content-type", "accept", "anthropic-version", "anthropic-beta"];
const PASSED_DOWN =
  /^(content-type|cache-control|request-id|x-request-id|retry-after|x-should-retry)$/i;
// How Studio Pro's calls show on OpenRouter's dashboard.
const ATTRIBUTION = { "http-referer": "https://texttocad.studio", "x-title": "Studio Pro" };
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

export const SAY = {
  noKey: "Studio Pro does not know this key. Sign in to Studio Pro again in Settings.",
  ended:
    "Your Studio Pro subscription has ended. Renew it in Settings, or sign in with your own Claude account.",
  capped:
    "You have used this month's Studio Pro AI. It starts again on the 1st, or sign in with your own Claude account until then.",
  model: "Studio Pro does not run that model. Choose another model in Studio.",
  fast: "Studio Pro runs at standard speed only. Turn fast mode off.",
  tooLarge: "This chat is too long for Studio Pro. Start a new chat and try again.",
  notSetUp: "Studio Pro's AI is not set up yet. Try again later.",
  upstream: "Studio Pro could not reach the AI. Try again in a minute.",
  only: "Studio Pro passes on Studio's AI requests only.",
  busy: "Too many requests. Wait a minute and try again.",
};

const json = (status, body, headers = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
// Anthropic's own error shape, so Claude Code shows the sentence as it is.
const anthropicError = (status, type, message) =>
  json(status, { type: "error", error: { type, message } });
const html = (status, body) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex",
    },
  });

/** The first instant of next month, UTC: when the cap starts again. */
export const monthEndOf = (now) => {
  const at = new Date(now);
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
};

/** A subscription's period end, wherever this Stripe API version keeps it. */
const periodEndOf = (subscription) => {
  const seconds =
    subscription?.current_period_end ?? subscription?.items?.data?.[0]?.current_period_end;
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
};

/**
 * @param {{ store: ReturnType<import("./store.mjs").databaseStore>, stripe: ReturnType<import("./stripe.mjs").stripeClient>,
 *   config: { licenseSecret: string, openrouterKey?: string, prices: { monthly?: string, founding?: string }, caps?: { monthly?: number, founding?: number }, portalLoginUrl?: string, missing?: string[] },
 *   fetch?: typeof fetch, now?: () => number, limiter?: { take(key: string): { ok: boolean } } }} deps `fetch`: OpenRouter's.
 */
export function proServer({ store, stripe, config, fetch: send = fetch, now = Date.now, limiter }) {
  const caps = { ...DEFAULT_CAPS, ...config.caps };
  const accounts = new Map(); // account id -> { account, spent, at }, for ACCOUNT_TTL_MS

  const capOf = (account) => Number(account.cap_usd ?? caps[account.plan] ?? caps.monthly);

  /** Makes or updates the account a paid Checkout bought, and answers it. */
  async function activate(session, plan) {
    const subscription = await stripe.subscription(session.subscription);
    return store.saveAccount({
      stripe_customer: session.customer,
      stripe_subscription: session.subscription,
      email: session.customer_details?.email ?? session.customer_email ?? null,
      plan: PLANS.includes(session.metadata?.plan) ? session.metadata.plan : plan,
      status: subscription.status,
      period_end: periodEndOf(subscription),
      checked_at: new Date(now()).toISOString(),
    });
  }

  const keyFor = (account) => licenseKey(config.licenseSecret, account.id, account.key_generation);

  /** The account a key belongs to, with this month's spend; or why it may not run. */
  async function authorize(headers) {
    const key = keyOf(headers);
    const id = accountIdOf(key);
    if (!id) return { refused: "noKey" };
    let known = accounts.get(id);
    if (!known || now() - known.at >= ACCOUNT_TTL_MS) {
      let account = await store.account(id);
      if (!account) return { refused: "noKey" };
      if (now() - Date.parse(account.checked_at) >= SUBSCRIPTION_TTL_MS) {
        try {
          const subscription = await stripe.subscription(account.stripe_subscription);
          const patch = {
            status: subscription.status,
            period_end: periodEndOf(subscription),
            checked_at: new Date(now()).toISOString(),
          };
          await store.updateAccount(id, patch);
          account = { ...account, ...patch };
        } catch {
          // Stripe unreachable: the status last read stands until the next try.
        }
      }
      known = { account, spent: await store.monthSpend(id), at: now() };
      accounts.set(id, known);
    }
    const { account, spent } = known;
    if (!(await keyMatches(config.licenseSecret, key, account.id, account.key_generation)))
      return { refused: "noKey" };
    if (!STATUS_RUNS.has(account.status)) return { refused: "ended", account };
    if (spent >= capOf(account)) return { refused: "capped", account };
    return { account, spent };
  }

  async function record(account, model, cost) {
    await store.addUsage({
      account_id: account.id,
      provider: "openrouter",
      model,
      cost_source: cost.source,
      input_tokens: cost.tokens.input,
      cache_write_tokens: cost.tokens.cacheWrite,
      cache_read_tokens: cost.tokens.cacheRead,
      output_tokens: cost.tokens.output,
      web_searches: cost.tokens.webSearches,
      cost_usd: Number(cost.usd.toFixed(6)),
    });
    const known = accounts.get(account.id);
    if (known) known.spent += cost.usd;
  }

  async function bodyOf(request) {
    if (Number(request.headers.get("content-length")) > MAX_BODY) return { refused: "tooLarge" };
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_BODY) return { refused: "tooLarge" };
    try {
      const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      return body !== null && typeof body === "object" && !Array.isArray(body)
        ? { body }
        : { refused: "only" };
    } catch {
      return { refused: "only" };
    }
  }

  const upHeaders = (request, auth) => {
    const headers = new Headers(auth);
    for (const name of PASSED_UP) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    return headers;
  };
  const downHeaders = (answer) => {
    const headers = new Headers();
    for (const [name, value] of answer.headers)
      if (PASSED_DOWN.test(name)) headers.set(name, value);
    return headers;
  };

  async function anthropic(request, path, search) {
    const say = (status, type, refused) => anthropicError(status, type, SAY[refused]);
    if (ANTHROPIC_PATHS[path] !== request.method) return say(404, "not_found_error", "only");
    if (!config.openrouterKey) return say(503, "api_error", "notSetUp");
    const allowed = await authorize(request.headers);
    if (allowed.refused === "noKey") return say(401, "authentication_error", "noKey");
    if (allowed.refused) return say(403, "permission_error", allowed.refused);

    let sent;
    let model;
    if (request.method === "POST") {
      const read = await bodyOf(request);
      if (read.refused === "tooLarge") return say(413, "request_too_large", "tooLarge");
      if (read.refused) return say(400, "invalid_request_error", "only");
      model = modelOf(read.body.model);
      if (!model) return say(400, "invalid_request_error", "model");
      if (read.body.speed === "fast") return say(400, "invalid_request_error", "fast");
      // The request as it was read here, under OpenRouter's name for the model it was priced as.
      sent = JSON.stringify({ ...read.body, model: model.slug });
    }
    let answer;
    try {
      answer = await send(`${OPENROUTER}${path}${search}`, {
        method: request.method,
        headers: upHeaders(request, {
          authorization: `Bearer ${config.openrouterKey}`,
          ...ATTRIBUTION,
        }),
        body: sent,
      });
    } catch {
      return say(502, "api_error", "upstream");
    }
    // A key OpenRouter turns down, or credits run out (402), is Studio's to fix, not the person's.
    if (answer.status === 401 || answer.status === 402 || answer.status === 403) {
      await answer.body?.cancel();
      console.error(`pro openrouter refused studio's key: ${answer.status}`);
      return say(503, "api_error", "notSetUp");
    }
    const metered = path === "v1/messages" && answer.ok && answer.body;
    const body = metered
      ? meteredBody(answer.body, {
          json: !(answer.headers.get("content-type") ?? "").includes("event-stream"),
          done: async (usage) => {
            if (!usage) return;
            try {
              await record(allowed.account, model.slug, costOf(model, usage));
            } catch (error) {
              console.error(`pro usage not kept: ${error?.code ?? "error"}`);
            }
          },
        })
      : answer.body;
    return new Response(body, { status: answer.status, headers: downHeaders(answer) });
  }

  async function upgrade(url) {
    const plan = url.searchParams.get("plan");
    const claimHash = url.searchParams.get("claim") ?? "";
    const price = config.prices[plan];
    if (!PLANS.includes(plan) || !/^[0-9a-f]{64}$/.test(claimHash))
      return html(
        400,
        cancelledPage({
          title: "That link is not complete",
          line: "Choose Upgrade in Studio again.",
        }),
      );
    if (!price)
      return html(
        503,
        cancelledPage({ title: "Studio Pro is not open yet", line: "Try again later." }),
      );
    const session = await stripe.checkout({
      price,
      claimHash,
      plan,
      successUrl: `${url.origin}/v1/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${url.origin}/v1/cancelled`,
    });
    await store.addClaim({ claimHash, sessionId: session.id, plan });
    return new Response(null, {
      status: 303,
      headers: { location: session.url, "cache-control": "no-store" },
    });
  }

  async function claim(request) {
    let secret;
    try {
      secret = (await request.json())?.claim;
    } catch {
      secret = undefined;
    }
    if (typeof secret !== "string" || secret.length < 32 || secret.length > 128)
      return json(400, { error: "That is not a claim." }, CORS);
    const row = await store.claimByHash(await claimHashOf(secret));
    if (!row) return json(404, { error: "Studio has not opened a checkout for this yet." }, CORS);
    if (!row.claimed_at && now() - Date.parse(row.created_at) > CLAIM_TTL_MS)
      return json(410, { error: "This checkout has expired. Choose Upgrade again." }, CORS);
    const session = await stripe.session(row.session_id);
    if (!sessionPaid(session)) return json(202, { pending: true }, CORS);
    const account = await activate(session, row.plan);
    if (!row.claimed_at) await store.markClaimed(row.claim_hash, account.id);
    return json(
      200,
      { key: await keyFor(account), email: account.email, plan: account.plan },
      CORS,
    );
  }

  async function welcome(url) {
    const id = url.searchParams.get("session_id") ?? "";
    if (!/^cs_[A-Za-z0-9_]+$/.test(id))
      return html(
        400,
        cancelledPage({ title: "That link is not complete", line: "Go back to Studio." }),
      );
    const session = await stripe.session(id);
    if (!sessionPaid(session))
      return html(
        200,
        cancelledPage({
          title: "Your payment is still going through",
          line: "Studio signs in as soon as it is done. You can close this page.",
        }),
      );
    const account = await activate(session, session.metadata?.plan ?? "monthly");
    return html(
      200,
      welcomePage({ email: account.email, plan: account.plan, key: await keyFor(account) }),
    );
  }

  /**
   * What the app shows on its Pro row: the plan, whether the AI runs, and how much of the month is
   * used. By account id, which the app keeps beside the key (the key itself it cannot read back);
   * no email or amount, since an id is no proof of who asks.
   */
  async function usage(url) {
    const id = url.searchParams.get("account") ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))
      return json(404, { error: SAY.noKey }, CORS);
    const account = await store.account(id);
    if (!account) return json(404, { error: SAY.noKey }, CORS);
    const spent = await store.monthSpend(id);
    const refused = !STATUS_RUNS.has(account.status)
      ? "ended"
      : spent >= capOf(account)
        ? "capped"
        : null;
    return json(
      200,
      {
        plan: account.plan,
        runs: refused === null,
        refused: refused === null ? null : SAY[refused],
        usedPercent: Math.min(100, Math.floor((spent / capOf(account)) * 100)),
        resetsAt: monthEndOf(now()).toISOString(),
      },
      CORS,
    );
  }

  async function health() {
    if (config.missing?.length) return json(503, { ok: false, missing: config.missing });
    try {
      await store.ready();
      return json(200, { ok: true });
    } catch (error) {
      return json(503, { ok: false, database: error?.code ?? "error" });
    }
  }

  return async function handle(request, { client = "" } = {}) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, "");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    try {
      // Claude Code's check that the endpoint answers, as Anthropic's own does.
      if (path === "anthropic/api/hello") return new Response("hello", { status: 200 });
      if (path.startsWith("anthropic/"))
        return await anthropic(request, path.slice("anthropic/".length), url.search);
      if (path === "v1/health") return await health();
      if (limiter && ["v1/upgrade", "v1/claim", "v1/welcome", "v1/usage"].includes(path)) {
        if (!limiter.take(`${path}:${client}`).ok)
          return json(429, { error: SAY.busy }, { ...CORS, "retry-after": "60" });
      }
      if (path === "v1/upgrade" && request.method === "GET") return await upgrade(url);
      if (path === "v1/claim" && request.method === "POST") return await claim(request);
      if (path === "v1/welcome" && request.method === "GET") return await welcome(url);
      if (path === "v1/cancelled" && request.method === "GET")
        return html(
          200,
          cancelledPage({
            title: "No charge was made",
            line: "Go back to Studio whenever you are ready.",
          }),
        );
      if (path === "v1/usage" && request.method === "GET") return await usage(url);
      // Stripe's own billing page, which signs the person in by email: change card, plan or cancel.
      if (path === "v1/manage" && request.method === "GET")
        return config.portalLoginUrl
          ? new Response(null, { status: 302, headers: { location: config.portalLoginUrl } })
          : html(
              503,
              cancelledPage({ title: "Billing is not open yet", line: "Try again later." }),
            );
      return json(404, { error: SAY.only });
    } catch (error) {
      // By code alone: a service's message can quote what it was sent.
      console.error(
        `pro ${path.split("/").slice(0, 3).join("/")} failed: ${error?.code ?? error?.name ?? "error"}`,
      );
      return path.startsWith("anthropic/")
        ? anthropicError(502, "api_error", SAY.upstream)
        : json(502, { error: "Studio Pro had a problem. Try again in a minute." }, CORS);
    }
  };
}
