import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";

import { databaseStore, missingSettings } from "./store.mjs";

// PostgREST as Supabase runs it: `return=minimal` writes answer with no body.
function postgrest() {
  const calls = [];
  const send = async (url, init) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    if (path.endsWith("/rpc/pro_month_spend")) return new Response("12.5", { status: 200 });
    if (init.method === "POST" && init.headers.prefer.includes("return=representation"))
      return Response.json([{ id: "a1", ...JSON.parse(init.body) }], { status: 201 });
    if (init.method === "POST") return new Response(null, { status: 201 });
    if (init.method === "PATCH") return new Response(null, { status: 204 });
    return Response.json([{ id: "a1" }]);
  };
  return {
    calls,
    store: databaseStore({ url: "https://db.example/", key: "service", fetch: send }),
  };
}

NodeTest.test("writes that answer no body succeed, and reads come back as rows", async () => {
  const { calls, store } = postgrest();
  await store.addUsage({ account_id: "a1", cost_usd: 1 });
  await store.addClaim({ claimHash: "h", sessionId: "cs_1", plan: "monthly" });
  await store.markClaimed("h", "a1");
  NodeAssert.equal((await store.saveAccount({ stripe_customer: "cus_1" })).id, "a1");
  NodeAssert.equal(await store.monthSpend("a1"), 12.5);
  NodeAssert.deepEqual(await store.account("a1"), { id: "a1" });
  NodeAssert.equal(calls[0].url, "https://db.example/rest/v1/pro_usage");
  NodeAssert.equal(calls[0].init.headers.authorization, "Bearer service");
  NodeAssert.equal(calls[2].url, "https://db.example/rest/v1/pro_claims?claim_hash=eq.h");
});

NodeTest.test("a database refusal throws its status, never its words", async () => {
  const store = databaseStore({
    url: "https://db.example",
    key: "k",
    fetch: async () => new Response("secret detail", { status: 500 }),
  });
  await NodeAssert.rejects(store.addUsage({}), { code: "database_500" });
});

NodeTest.test("health names each setting the host lacks", () => {
  NodeAssert.deepEqual(missingSettings({ SUPABASE_URL: "x", LICENSE_SECRET: " " }), [
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_PRICE_MONTHLY",
    "STRIPE_PRICE_FOUNDING",
    "LICENSE_SECRET",
    "OPENROUTER_API_KEY",
  ]);
});
