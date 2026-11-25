import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";

import { proServer } from "./handler.mjs";
import { claimHashOf, licenseKey } from "./license.mjs";

const SECRET = "license-secret";
const ID = "0b7e4c5a-3c2d-4f6e-9a1b-2c3d4e5f6a7b";
const NOW = Date.parse("2026-11-25T12:00:00Z");
const CLAIM = "c".repeat(43);

function fakes({ account = {}, spent = 0, paid = true, upstream } = {}) {
  const state = {
    accounts: new Map([
      [
        ID,
        {
          id: ID,
          email: "dave@example.com",
          stripe_customer: "cus_1",
          stripe_subscription: "sub_1",
          plan: "monthly",
          status: "active",
          checked_at: new Date(NOW).toISOString(),
          key_generation: 1,
          cap_usd: null,
          ...account,
        },
      ],
    ]),
    claims: new Map(),
    usage: [],
    upstream: [],
    checkouts: [],
  };
  const store = {
    async addClaim({ claimHash, sessionId, plan }) {
      state.claims.set(claimHash, {
        claim_hash: claimHash,
        session_id: sessionId,
        plan,
        created_at: new Date(NOW).toISOString(),
        claimed_at: null,
      });
    },
    claimByHash: async (hash) => state.claims.get(hash) ?? null,
    async markClaimed(hash, accountId) {
      Object.assign(state.claims.get(hash), {
        account_id: accountId,
        claimed_at: new Date(NOW).toISOString(),
      });
    },
    async saveAccount(row) {
      const existing = [...state.accounts.values()].find(
        (a) => a.stripe_customer === row.stripe_customer,
      );
      const saved = { ...(existing ?? { id: ID, key_generation: 1, cap_usd: null }), ...row };
      state.accounts.set(saved.id, saved);
      return saved;
    },
    account: async (id) => state.accounts.get(id) ?? null,
    async updateAccount(id, patch) {
      Object.assign(state.accounts.get(id), patch);
    },
    async addUsage(row) {
      state.usage.push(row);
    },
    monthSpend: async () => spent + state.usage.reduce((sum, row) => sum + row.cost_usd, 0),
    ready: async () => undefined,
  };
  const session = {
    id: "cs_test_1",
    status: paid ? "complete" : "open",
    payment_status: paid ? "paid" : "unpaid",
    customer: "cus_1",
    subscription: "sub_1",
    customer_details: { email: "dave@example.com" },
    metadata: { plan: "founding" },
  };
  const stripe = {
    async checkout(input) {
      state.checkouts.push(input);
      return { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" };
    },
    session: async () => session,
    subscription: async () => ({
      status: "active",
      items: { data: [{ current_period_end: NOW / 1000 + 86400 * 30 }] },
    }),
  };
  const send = async (url, init) => {
    state.upstream.push({ url, init });
    return upstream ? upstream(url, init) : sse();
  };
  const handle = proServer({
    store,
    stripe,
    config: {
      licenseSecret: SECRET,
      openrouterKey: "sk-or-v1-studio",
      prices: { monthly: "price_m", founding: "price_f" },
    },
    fetch: send,
    now: () => NOW,
  });
  return { state, handle };
}

// OpenRouter's stream, with the cost it reports in the final usage (`cost: null` leaves it out).
const sse = (cost = 0.4123) =>
  new Response(
    `event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":10,"cache_read_input_tokens":1000000,"output_tokens":1}}}\n\nevent: message_delta\ndata: {"type":"message_delta","delta":{},"usage":{"output_tokens":10000${cost === null ? "" : `,"cost":${cost}`}}}\n\n`,
    {
      status: 200,
      headers: { "content-type": "text/event-stream", "request-id": "req_1", "set-cookie": "x" },
    },
  );

const key = () => licenseKey(SECRET, ID, 1);
const messages = async (
  headers = {},
  body = { model: "claude-opus-5-5", max_tokens: 10, stream: true, messages: [] },
) =>
  new Request("https://pro.example/anthropic/v1/messages?beta=true", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "x",
      authorization: `Bearer ${await key()}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });

NodeTest.test(
  "passes a Pro turn to OpenRouter on Studio's key and keeps only what OpenRouter says it cost",
  async () => {
    const { state, handle } = fakes();
    const answer = await handle(await messages());
    NodeAssert.equal(answer.status, 200);
    NodeAssert.equal(answer.headers.get("request-id"), "req_1");
    NodeAssert.equal(answer.headers.get("set-cookie"), null);
    await answer.text();
    const [{ url, init }] = state.upstream;
    NodeAssert.equal(url, "https://openrouter.ai/api/v1/messages?beta=true");
    NodeAssert.equal(init.headers.get("authorization"), "Bearer sk-or-v1-studio");
    NodeAssert.equal(init.headers.get("x-api-key"), null);
    NodeAssert.equal(init.headers.get("x-title"), "Studio Pro");
    NodeAssert.equal(init.headers.get("anthropic-beta"), "x");
    NodeAssert.equal(JSON.parse(init.body).model, "anthropic/claude-opus-5.5");
    NodeAssert.deepEqual(state.usage, [
      {
        account_id: ID,
        provider: "openrouter",
        model: "anthropic/claude-opus-5.5",
        cost_source: "openrouter",
        input_tokens: 10,
        cache_write_tokens: 0,
        cache_read_tokens: 1_000_000,
        output_tokens: 10_000,
        web_searches: 0,
        cost_usd: 0.4123,
      },
    ]);
  },
);

NodeTest.test(
  "runs GPT as its OpenRouter slug, and prices a stream that reports no cost",
  async () => {
    const { state, handle } = fakes({ upstream: () => sse(null) });
    const answer = await handle(
      await messages(
        {},
        { model: "openai/gpt-6.2-astra", max_tokens: 10, stream: true, messages: [] },
      ),
    );
    await answer.text();
    NodeAssert.equal(JSON.parse(state.upstream[0].init.body).model, "openai/gpt-6.2-astra");
    NodeAssert.equal(state.usage[0].cost_source, "tokens");
    // 10*8 + 1e6*0.4 + 10000*40, per million.
    NodeAssert.equal(state.usage[0].cost_usd, 0.80008);
  },
);

NodeTest.test(
  "refuses a key it did not sign, an ended subscription and a month past its cap",
  async () => {
    const forged = await fakes().handle(
      await messages({ authorization: `Bearer ${(await key()).slice(0, -2)}AA` }),
    );
    NodeAssert.equal(forged.status, 401);
    NodeAssert.equal((await forged.json()).error.type, "authentication_error");

    const revoked = await fakes({ account: { key_generation: 2 } }).handle(await messages());
    NodeAssert.equal(revoked.status, 401);

    const ended = await fakes({ account: { status: "canceled" } }).handle(await messages());
    NodeAssert.equal(ended.status, 403);
    NodeAssert.match((await ended.json()).error.message, /has ended/);

    const capped = fakes({ spent: 25 });
    const refused = await capped.handle(await messages());
    NodeAssert.equal(refused.status, 403);
    NodeAssert.match((await refused.json()).error.message, /this month's Studio Pro AI/);
    NodeAssert.equal(capped.state.upstream.length, 0);

    const ownCap = await fakes({ spent: 25, account: { cap_usd: 40 } }).handle(await messages());
    NodeAssert.equal(ownCap.status, 200);
  },
);

NodeTest.test(
  "refuses a model it has no price for, fast mode, and a body over Vercel's limit",
  async () => {
    const { state, handle } = fakes();
    const unknown = await handle(await messages({}, { model: "claude-opus-5-6", messages: [] }));
    NodeAssert.equal(unknown.status, 400);
    NodeAssert.match((await unknown.json()).error.message, /does not run that model/);
    const fast = await handle(
      await messages({}, { model: "claude-opus-5-5", speed: "fast", messages: [] }),
    );
    NodeAssert.match((await fast.json()).error.message, /standard speed/);
    const large = await handle(
      await messages(
        {},
        {
          model: "claude-opus-5-5",
          messages: [{ role: "user", content: "x".repeat(5 * 1024 * 1024) }],
        },
      ),
    );
    NodeAssert.equal(large.status, 413);
    NodeAssert.equal(state.upstream.length, 0);
  },
);

NodeTest.test(
  "OpenRouter turning down Studio's key or out of credits reads as not set up, not as the person's",
  async () => {
    for (const status of [401, 402]) {
      const { handle } = fakes({
        upstream: () =>
          new Response('{"error":{"message":"key sk-or-v1-stu... has no credits"}}', { status }),
      });
      const answer = await handle(await messages());
      NodeAssert.equal(answer.status, 503);
      NodeAssert.doesNotMatch(await answer.text(), /sk-or/);
    }
  },
);

NodeTest.test("answers Claude Code's endpoint check without a key", async () => {
  const answer = await fakes().handle(
    new Request("https://pro.example/anthropic/api/hello", { method: "HEAD" }),
  );
  NodeAssert.equal(answer.status, 200);
});

NodeTest.test("checks a stale subscription with Stripe before running", async () => {
  const { state, handle } = fakes({
    account: { checked_at: "2026-11-01T00:00:00Z", status: "past_due" },
  });
  NodeAssert.equal((await handle(await messages())).status, 200);
  NodeAssert.equal(state.accounts.get(ID).status, "active");
  NodeAssert.equal(
    state.accounts.get(ID).period_end,
    new Date(NOW + 86400 * 30 * 1000).toISOString(),
  );
});

NodeTest.test(
  "Upgrade opens Checkout tied to the app's claim, and the claim answers the key once paid",
  async () => {
    const hash = await claimHashOf(CLAIM);
    const unpaid = fakes({ paid: false });
    const opened = await unpaid.handle(
      new Request(`https://pro.example/v1/upgrade?plan=founding&claim=${hash}`),
    );
    NodeAssert.equal(opened.status, 303);
    NodeAssert.equal(opened.headers.get("location"), "https://checkout.stripe.com/c/pay/cs_test_1");
    NodeAssert.deepEqual(
      { ...unpaid.state.checkouts[0] },
      {
        price: "price_f",
        claimHash: hash,
        plan: "founding",
        successUrl: "https://pro.example/v1/welcome?session_id={CHECKOUT_SESSION_ID}",
        cancelUrl: "https://pro.example/v1/cancelled",
      },
    );
    const claim = () =>
      new Request("https://pro.example/v1/claim", {
        method: "POST",
        body: JSON.stringify({ claim: CLAIM }),
      });
    const waiting = await unpaid.handle(claim());
    NodeAssert.equal(waiting.status, 202);

    const paid = fakes();
    await paid.handle(new Request(`https://pro.example/v1/upgrade?plan=founding&claim=${hash}`));
    const answer = await paid.handle(claim());
    NodeAssert.equal(answer.status, 200);
    NodeAssert.deepEqual(await answer.json(), {
      key: await key(),
      email: "dave@example.com",
      plan: "founding",
    });
    NodeAssert.ok(paid.state.claims.get(hash).claimed_at);

    const stranger = await paid.handle(
      new Request("https://pro.example/v1/claim", {
        method: "POST",
        body: JSON.stringify({ claim: "d".repeat(43) }),
      }),
    );
    NodeAssert.equal(stranger.status, 404);
  },
);

NodeTest.test("Upgrade refuses a plan or claim it does not know", async () => {
  const { handle, state } = fakes();
  const answer = await handle(
    new Request("https://pro.example/v1/upgrade?plan=lifetime&claim=abc"),
  );
  NodeAssert.equal(answer.status, 400);
  NodeAssert.equal(state.checkouts.length, 0);
});

NodeTest.test("the page Checkout returns to shows the key for another computer", async () => {
  const page = await fakes().handle(
    new Request("https://pro.example/v1/welcome?session_id=cs_test_1"),
  );
  const text = await page.text();
  NodeAssert.match(text, /You're on Studio Pro/);
  NodeAssert.ok(text.includes(await key()));
});

NodeTest.test(
  "the app's Pro row reads the plan and the share of the month used, by account id",
  async () => {
    const usage = (handle, id = ID) =>
      handle(new Request(`https://pro.example/v1/usage?account=${id}`)).then((answer) =>
        answer.json(),
      );
    NodeAssert.deepEqual(await usage(fakes({ spent: 5 }).handle), {
      plan: "monthly",
      runs: true,
      refused: null,
      usedPercent: 20,
      resetsAt: "2026-12-01T00:00:00.000Z",
    });
    const capped = await usage(fakes({ spent: 30 }).handle);
    NodeAssert.equal(capped.runs, false);
    NodeAssert.equal(capped.usedPercent, 100);
    NodeAssert.match(capped.refused, /It starts again on the 1st/);
    const unknown = await fakes().handle(
      new Request("https://pro.example/v1/usage?account=0b7e4c5a-0000-4000-8000-000000000000"),
    );
    NodeAssert.equal(unknown.status, 404);
  },
);
