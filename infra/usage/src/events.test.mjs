import * as NodeAssert from "node:assert/strict";
import * as NodeFS from "node:fs";
import * as NodeTest from "node:test";

import { EVENTS, Invalid, PROPERTIES, rowsOf } from "./events.mjs";
import { batchOf } from "./fixtures.mjs";

const INSTALL = "0b7e4c5a-3c2d-4f6e-9a1b-2c3d4e5f6a7b";
const ID = "01970000-0000-7000-8000-000000000001";
const eventOf = (extra = {}) => ({
  id: ID,
  event: "provider.turn.completed",
  at: "2026-11-04T16:00:00.000Z",
  properties: { provider: "codex", model: "gpt-5.5", inputTokens: 1200, hasSubagents: false },
  ...extra,
});

NodeTest.test("a batch becomes one row per event, with the batch's context", () => {
  NodeAssert.deepEqual(rowsOf(batchOf([eventOf()])), [
    {
      id: ID,
      event: "provider.turn.completed",
      at: "2026-11-04T16:00:00.000Z",
      install: INSTALL,
      version: "0.1.5",
      platform: "darwin",
      arch: "arm64",
      mode: "desktop",
      properties: { provider: "codex", model: "gpt-5.5", inputTokens: 1200, hasSubagents: false },
    },
  ]);
});

NodeTest.test("refuses what is outside the contract", () => {
  const refused = [
    batchOf([eventOf({ event: "chat.prompt" })]),
    batchOf([eventOf({ properties: { file: "/Users/amy/bracket.py" } })]),
    batchOf([eventOf({ properties: { file: "C:\\parts\\bracket.py" } })]),
    batchOf([eventOf({ properties: { prompt: "make a bracket\nwith holes" } })]),
    batchOf([eventOf({ properties: { nested: { a: 1 } } })]),
    batchOf([eventOf({ properties: { "bad key": 1 } })]),
    batchOf([eventOf(), eventOf()]),
    batchOf([eventOf({ extra: 1 })]),
    batchOf([eventOf()], { install: "not-an-id" }),
    batchOf([eventOf()], { schema: 2 }),
    batchOf([eventOf()], { name: "amy" }),
    batchOf([]),
  ];
  for (const batch of refused) NodeAssert.throws(() => rowsOf(batch), Invalid);
});

NodeTest.test("knows exactly the events README.md lists", () => {
  const readme = NodeFS.readFileSync(new URL("../../../README.md", import.meta.url), "utf8");
  const section = readme.split("## Usage data")[1]?.split(/\n---\n|\n## /u)[0] ?? "";
  const listed = [...section.matchAll(/`([a-z]+(?:\.[a-z_]+)+)`/gu)].map((found) => found[1]);
  NodeAssert.deepEqual([...EVENTS].toSorted(), listed.toSorted());
});

NodeTest.test("refuses a short word under a name the event does not carry", () => {
  const refused = [
    { prompt: "make a bracket with four holes" },
    { file_name: "acme-gearbox-housing-v2.step" },
    { path: "parts/acme/bracket.step" },
    { template: "part" }, // real, but another event's
  ];
  for (const properties of refused) {
    NodeAssert.throws(() => rowsOf(batchOf([eventOf({ properties })])), Invalid);
  }
  NodeAssert.throws(
    () => rowsOf(batchOf([eventOf({ event: "cad.hand_edit", properties: { size: 12 } })])),
    Invalid,
  );
});

// The property names inside an object the server builds, shorthand or not.
const namesIn = (code) =>
  [...code.matchAll(/[{,]\s*([a-z][A-Za-z]*)\s*(?=[,:}])/g)].map((found) => found[1]);
const serverCode = (file, from) => {
  const url = new URL(`../../../apps/server/src/${file}`, import.meta.url);
  const code = NodeFS.readFileSync(url, "utf8");
  const start = code.indexOf("return {", code.indexOf(from));
  return code.slice(start, code.indexOf("\n}\n", start));
};

NodeTest.test("takes every property the server builds, and no other", () => {
  const client = namesIn(serverCode("ws.ts", "function readClientAnalyticsProps"));
  const turn = namesIn(
    serverCode("telemetry/ProviderUsageAnalytics.ts", "function providerTurnProperties"),
  );
  NodeAssert.deepEqual(client.toSorted(), PROPERTIES["client.connected"].toSorted());
  NodeAssert.deepEqual(turn.toSorted(), PROPERTIES["provider.turn.completed"].toSorted());
});

NodeTest.test("keeps a model id with its context size", () => {
  const [row] = rowsOf(batchOf([eventOf({ properties: { model: "claude-opus-5-5[1m]" } })]));
  NodeAssert.equal(row.properties.model, "claude-opus-5-5[1m]");
});
