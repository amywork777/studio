import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";

import { EVENT_NAMES, LABELS, pageOf, sinceOf, spanOf, summaryOf } from "./page.mjs";

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
