import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";

import { databaseStore, missingSettings, READY_TTL_MS, recordOf, settingsOf } from "./store.mjs";

const SETTINGS = settingsOf({
  SUPABASE_URL: "https://abc.supabase.co/",
  SUPABASE_SERVICE_ROLE_KEY: "service",
});
const ROW = {
  id: "01970000-0000-7000-8000-000000000001",
  event: "cad.hand_edit",
  at: "2026-11-04T16:00:00.000Z",
  install: "0b7e4c5a-3c2d-4f6e-9a1b-2c3d4e5f6a7b",
  version: "0.1.5",
  platform: "darwin",
  arch: "arm64",
  mode: "desktop",
  properties: { kind: "size" },
};

function recorder(answer = () => new Response(null, { status: 201 })) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : undefined });
    return answer(url);
  };
  return { calls, fetch };
}

NodeTest.test("a row keeps its id, its context, its properties and the country", () => {
  NodeAssert.deepEqual(recordOf(ROW, "DE"), {
    id: ROW.id,
    install: ROW.install,
    event: "cad.hand_edit",
    at: ROW.at,
    version: "0.1.5",
    platform: "darwin",
    arch: "arm64",
    mode: "desktop",
    country: "DE",
    properties: { kind: "size" },
  });
});

NodeTest.test("inserts once per event id, and deletes every row of an install", async () => {
  const { calls, fetch } = recorder();
  const store = databaseStore(SETTINGS, { fetch });
  await store.insert([ROW], { country: "US" });
  await store.forget(ROW.install);
  NodeAssert.equal(calls[0].url, "https://abc.supabase.co/rest/v1/usage_events?on_conflict=id");
  NodeAssert.equal(calls[0].init.method, "POST");
  NodeAssert.match(calls[0].init.headers.prefer, /resolution=ignore-duplicates/);
  NodeAssert.equal(calls[0].init.headers.authorization, "Bearer service");
  NodeAssert.equal(calls[0].body[0].country, "US");
  NodeAssert.equal(
    calls[1].url,
    `https://abc.supabase.co/rest/v1/usage_events?install=eq.${ROW.install}`,
  );
  NodeAssert.equal(calls[1].init.method, "DELETE");
});

NodeTest.test("a database that refuses is a failure named by its status", async () => {
  const { fetch } = recorder(() => new Response(null, { status: 401 }));
  await NodeAssert.rejects(databaseStore(SETTINGS, { fetch }).insert([ROW]), {
    code: "database_401",
  });
});

NodeTest.test("health asks the table at most once a minute", async () => {
  let at = 0;
  const { calls, fetch } = recorder(() => new Response(null, { status: 404 }));
  const store = databaseStore(SETTINGS, { fetch, now: () => at });
  await NodeAssert.rejects(store.ready(), { code: "database_404" });
  await NodeAssert.rejects(store.ready());
  NodeAssert.equal(calls.length, 1);
  at += READY_TTL_MS;
  await NodeAssert.rejects(store.ready());
  NodeAssert.equal(calls.length, 2);
});

NodeTest.test("names the settings a host lacks", () => {
  NodeAssert.deepEqual(missingSettings({ SUPABASE_URL: "http://plain.example" }), [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);
});

NodeTest.test(
  "reads the numbers page's two daily views from a day on, and nothing else",
  async () => {
    const { calls, fetch } = recorder((url) =>
      Response.json(url.includes("installs") ? [{ day: "2026-11-10", installs: 1 }] : []),
    );
    const { installs, events } = await databaseStore(SETTINGS, { fetch }).numbers("2026-11-04");
    NodeAssert.deepEqual(
      calls.map((call) => call.url),
      [
        "https://abc.supabase.co/rest/v1/usage_daily_installs?day=gte.2026-11-04&order=day.desc",
        "https://abc.supabase.co/rest/v1/usage_daily_events?day=gte.2026-11-04&order=day.desc,times.desc",
      ],
    );
    NodeAssert.deepEqual(installs, [{ day: "2026-11-10", installs: 1 }]);
    NodeAssert.deepEqual(events, []);
  },
);
