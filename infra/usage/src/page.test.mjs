import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";

import { EVENT_NAMES, LABELS, pageOf, sinceOf, spanOf, summaryOf, versionsOf } from "./page.mjs";

const NOW = Date.parse("2026-11-10T12:00:00Z");

NodeTest.test("names every event Studio can send in plain words, and no other", () => {
  NodeAssert.deepEqual(Object.keys(LABELS).sort(), [...EVENT_NAMES].sort());
});

NodeTest.test("offers its spans and falls back to thirty days", () => {
  NodeAssert.equal(spanOf("7"), 7);
  NodeAssert.equal(spanOf("8"), 30);
  NodeAssert.equal(spanOf(null), 30);
  NodeAssert.equal(sinceOf(7, NOW), "2026-11-04");
});

NodeTest.test(
  "keeps every day of the span, a quiet day as a zero, and adds up each feature",
  () => {
    const summary = summaryOf(
      [
        { day: "2026-11-10", installs: 2 },
        { day: "2026-11-08", installs: 1 },
      ],
      [
        { day: "2026-11-10", event: "provider.turn.completed", times: 4, installs: 2 },
        { day: "2026-11-10", event: "cad.hand_edit", times: 9, installs: 1 },
        { day: "2026-11-08", event: "cad.hand_edit", times: 3, installs: 1 },
      ],
      7,
      NOW,
    );
    NodeAssert.equal(summary.days.length, 7);
    NodeAssert.deepEqual(summary.days.map((day) => [day.day, day.installs]).slice(0, 3), [
      ["2026-11-10", 2],
      ["2026-11-09", 0],
      ["2026-11-08", 1],
    ]);
    NodeAssert.equal(summary.busiest, 2);
    NodeAssert.equal(summary.activeDays, 2);
    NodeAssert.equal(summary.turns, 4);
    NodeAssert.equal(summary.edits, 12);
    NodeAssert.deepEqual(summary.features[0], {
      event: "cad.hand_edit",
      times: 12,
      days: 2,
      most: 1,
    });
  },
);

NodeTest.test("draws the counts, and says so when there are none", () => {
  const html = pageOf({
    days: 14,
    installs: [{ day: "2026-11-10", installs: 1 }],
    events: [{ day: "2026-11-10", event: "cad.model.opened", times: 18, installs: 1 }],
    now: NOW,
  });
  NodeAssert.match(html, /<title>Studio usage<\/title>/);
  NodeAssert.match(html, /Model opened/);
  NodeAssert.match(html, /aria-current="page">14 days/);
  NodeAssert.match(pageOf({ days: 7, installs: [], events: [], now: NOW }), /Nothing was counted/);
});

NodeTest.test(
  "counts installs per version, newest first, an install that updated under both",
  () => {
    NodeAssert.deepEqual(
      versionsOf([
        { version: "0.1.9", install: "a" },
        { version: "0.1.9", install: "a" },
        { version: "0.1.10", install: "a" },
        { version: "0.1.9", install: "b" },
        { version: "0.1.8", install: "c" },
      ]),
      [
        { version: "0.1.10", installs: 1 },
        { version: "0.1.9", installs: 2 },
        { version: "0.1.8", installs: 1 },
      ],
    );
  },
);

NodeTest.test(
  "shows failed turns, failed CAD actions and versions, and says when launches ran out",
  () => {
    const html = pageOf({
      days: 7,
      installs: [{ day: "2026-11-10", installs: 1 }],
      events: [{ day: "2026-11-10", event: "cad.action.failed", times: 3, installs: 1 }],
      failedTurns: 2,
      launches: { rows: [{ version: "0.1.10", install: "a" }], complete: false },
      now: NOW,
    });
    NodeAssert.match(html, /<b>2<\/b><span>AI turns failed/);
    NodeAssert.match(html, /<b>3<\/b><span>CAD actions failed/);
    NodeAssert.match(html, /<td>0\.1\.10<\/td><td class="n">1<\/td>/);
    NodeAssert.match(html, /From the first 1 launches/);
    NodeAssert.doesNotMatch(html, /"a"|>a</);
  },
);

NodeTest.test("lists failed turns by AI and model, and by why, counting installs", () => {
  const html = pageOf({
    days: 7,
    installs: [{ day: "2026-11-10", installs: 2 }],
    events: [],
    failedTurns: 3,
    failures: {
      turns: [
        { install: "a", provider: "claudeAgent", model: "claude-opus-5-5" },
        { install: "b", provider: "claudeAgent", model: "claude-opus-5-5" },
        { install: "a", provider: "codex", model: "gpt-5.5" },
      ],
      reasons: [{ install: "a", provider: "claudeAgent", reason: "sign_in" }],
    },
    now: NOW,
  });
  NodeAssert.match(
    html,
    /<td>Claude<\/td><td>claude-opus-5-5<\/td><td class="n">2<\/td><td class="n">2<\/td>/,
  );
  NodeAssert.match(html, /<td>Codex<\/td><td>gpt-5\.5<\/td><td class="n">1<\/td>/);
  NodeAssert.match(html, /Not signed in, or the key was refused<\/td><td class="n">1<\/td>/);
  NodeAssert.doesNotMatch(html, />b</);
  const before = pageOf({
    days: 7,
    installs: [],
    events: [],
    failedTurns: 1,
    failures: { turns: [{ install: "a", provider: "claudeAgent", model: "x" }], reasons: [] },
    now: NOW,
  });
  NodeAssert.match(before, /sent from Studio 0\.1\.11 on/);
});

NodeTest.test("escapes what the database hands it", () => {
  const html = pageOf({
    days: 7,
    installs: [{ day: "2026-11-10", installs: 1 }],
    events: [{ day: "2026-11-10", event: "<script>", times: 1, installs: 1 }],
    now: NOW,
  });
  NodeAssert.doesNotMatch(html, /<script>/);
  NodeAssert.match(html, /&lt;script&gt;/);
});
