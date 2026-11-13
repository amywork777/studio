/**
 * The numbers page at `/`, behind a password: installs per day, event counts, failed AI turns by AI,
 * model and reason, and installs per version. It counts install ids but never shows one, nor any
 * other property or country. Plain HTML and CSS, no script, `no-store`.
 */
import { PROPERTIES } from "./events.mjs";

/** Each event in plain words, as a person reads it. A test holds this to `PROPERTIES`. */
export const LABELS = {
  "client.connected": "App opened",
  "client.thread.started": "Chat started",
  "client.turn.requested": "Message sent",
  "provider.turn.completed": "AI turn finished",
  "provider.turn.failed": "AI turn failed, with why",
  "chatgpt.auth.started": "ChatGPT sign-in started",
  "chatgpt.auth.completed": "ChatGPT sign-in finished",
  "chatgpt.transfer.started": "ChatGPT transfer started",
  "chatgpt.transfer.completed": "ChatGPT transfer finished",
  "claude.signed_in": "Signed in to Claude",
  "studio.updated": "Updated to another version",
  "studio.skill.used": "Skill or job asked for",
  "studio.project.created": "Project made",
  "studio.project.trashed": "Project moved to Trash",
  "studio.project.restored": "Project back from Trash",
  "studio.project.deleted": "Project deleted for good",
  "studio.sync.sent": "Sync",
  "studio.sync.restored": "Backup brought back",
  "studio.github.connected": "GitHub connected",
  "cad.model.opened": "Model opened",
  "cad.hand_edit": "Hand edit",
  "cad.size.changed": "Size changed",
  "cad.size.added": "Size added",
  "cad.versions.compared": "Versions compared",
  "cad.version.restored": "Version restored",
  "cad.action.failed": "CAD action failed",
};
export const EVENT_NAMES = Object.keys(PROPERTIES);

/** The spans the page offers, in days; anything else asked for is the default. */
export const SPANS = [7, 14, 30, 90];
export const DEFAULT_SPAN = 30;
const DAY_MS = 86_400_000;

export const spanOf = (value) => {
  const days = Number(value);
  return SPANS.includes(days) ? days : DEFAULT_SPAN;
};

/** The first day of a span ending today, as the views name days (UTC, `YYYY-MM-DD`). */
export const sinceOf = (days, now = Date.now()) =>
  new Date(now - (days - 1) * DAY_MS).toISOString().slice(0, 10);

// `0.1.10` after `0.1.9`: each dot-separated part compared as a number.
const versionParts = (version) =>
  String(version)
    .split(/[.-]/)
    .map((part) => Number(part) || 0);
const newerFirst = (a, b) => {
  const [pa, pb] = [versionParts(a), versionParts(b)];
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
};

/**
 * How many installs opened each version, newest version first. An install that updated counts under both.
 * @param {{ version: string, install: string }[]} launches rows of `client.connected`
 */
export function versionsOf(launches) {
  const byVersion = new Map();
  for (const { version, install } of launches) {
    const installs = byVersion.get(version) ?? new Set();
    installs.add(install);
    byVersion.set(version, installs);
  }
  return [...byVersion]
    .map(([version, installs]) => ({ version, installs: installs.size }))
    .sort((a, b) => newerFirst(a.version, b.version));
}

const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const count = (n) => Number(n).toLocaleString("en-US");

/** The AI by its kind, as the chat's picker names it. */
const AI_NAMES = {
  claudeAgent: "Claude",
  codex: "Codex",
  cursor: "Cursor",
  grok: "Grok",
  opencode: "OpenCode",
  antigravity: "Antigravity",
};

/** Why a turn failed (`apps/server/src/telemetry/TurnFailure.ts`), in plain words. */
export const FAILURE_REASONS = {
  usage_limit: "Hit a usage or rate limit",
  sign_in: "Not signed in, or the key was refused",
  permission: "Not allowed",
  service_down: "The AI's service was down or overloaded",
  connection: "Lost the connection, or the AI quit",
  context_full: "The chat outgrew the model's memory",
  could_not_start: "The turn could not start",
  gave_up: "The AI gave up after repeated errors",
  other: "Something else",
};

/**
 * Failed turns grouped by `keyOf`, most first: how many, and from how many installs.
 * @param {object[]} rows
 * @param {(row: object) => string[]} keyOf
 */
function failedBy(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    const id = key.join("\u0000");
    const kept = groups.get(id) ?? { key, times: 0, installs: new Set() };
    kept.times += 1;
    kept.installs.add(row.install);
    groups.set(id, kept);
  }
  return [...groups.values()]
    .map(({ key, times, installs }) => ({ key, times, installs: installs.size }))
    .sort((a, b) => b.times - a.times);
}
const dayName = (day) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });

/**
 * The span's numbers, every day in it present (a quiet day is a zero, not a gap), newest first.
 * @param {{ day: string, installs: number }[]} installs rows of `usage_daily_installs`
 * @param {{ day: string, event: string, times: number, installs: number }[]} events rows of `usage_daily_events`
 */
export function summaryOf(installs, events, days, now = Date.now()) {
  const byDay = new Map(installs.map((row) => [String(row.day), Number(row.installs)]));
  const list = Array.from({ length: days }, (_, i) =>
    new Date(now - i * DAY_MS).toISOString().slice(0, 10),
  ).map((day) => ({
    day,
    installs: byDay.get(day) ?? 0,
    events: events
      .filter((row) => String(row.day) === day)
      .map((row) => ({
        event: row.event,
        times: Number(row.times),
        installs: Number(row.installs),
      }))
      .sort((a, b) => b.times - a.times),
  }));
  const totals = new Map();
  for (const { events: dayEvents } of list) {
    for (const row of dayEvents) {
      const kept = totals.get(row.event) ?? { event: row.event, times: 0, days: 0, most: 0 };
      kept.times += row.times;
      kept.days += 1;
      kept.most = Math.max(kept.most, row.installs);
      totals.set(row.event, kept);
    }
  }
  const timesOf = (event) => totals.get(event)?.times ?? 0;
  return {
    days: list,
    busiest: Math.max(0, ...list.map((day) => day.installs)),
    activeDays: list.filter((day) => day.installs > 0).length,
    features: [...totals.values()].sort((a, b) => b.times - a.times),
    turns: timesOf("provider.turn.completed"),
    chats: timesOf("client.thread.started"),
    projects: timesOf("studio.project.created"),
    edits: timesOf("cad.hand_edit"),
    cadFailures: timesOf("cad.action.failed"),
  };
}

const STYLE = `
:root {
  --bg: #121214; --surface: #1b1b1e; --surface-2: #25252a; --ink: #ededee;
  --ink-soft: rgba(237,237,238,.72); --ink-muted: rgba(237,237,238,.46); --rule: rgba(255,255,255,.09);
  --blue: oklch(0.571 0.21 264); --blue-soft: oklch(0.571 0.21 264 / .22);
  --font: "Inter Tight", "Helvetica Neue", Arial, sans-serif;
  --body: 13px; --small: 11px; --display: 22px; --figure: 28px;
  --radius-control: 8px; --radius-surface: 12px;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: var(--body)/1.45 var(--font); }
main { max-width: 960px; margin: 0 auto; padding: 32px 16px 48px; }
header { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 16px; }
h1 { margin: 0; font-size: var(--display); font-weight: 600; letter-spacing: -.01em; }
.sub { margin: 4px 0 0; color: var(--ink-muted); font-size: var(--small); }
nav { display: flex; gap: 4px; background: var(--surface); padding: 4px; border-radius: var(--radius-control); }
nav a { color: var(--ink-soft); text-decoration: none; padding: 4px 10px; border-radius: 6px; font-size: var(--small); }
nav a:hover { color: var(--ink); background: var(--surface-2); }
nav a[aria-current] { color: var(--ink); background: var(--blue); }
h2 { margin: 32px 0 12px; font-size: var(--small); font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-muted); }
.figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1px; margin-top: 24px;
  background: var(--rule); border: 1px solid var(--rule); border-radius: var(--radius-surface); overflow: hidden; }
.figure { background: var(--surface); padding: 14px 16px; }
.figure b { display: block; font-size: var(--figure); font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
.figure span { color: var(--ink-muted); font-size: var(--small); }
.chart { background: var(--surface); border: 1px solid var(--rule); border-radius: var(--radius-surface); padding: 16px; }
.bars { display: flex; flex-direction: row-reverse; align-items: end; gap: 3px; height: 140px; }
.bar { flex: 1; min-width: 2px; display: flex; flex-direction: column; justify-content: end; height: 100%; }
.bar i { display: block; background: var(--blue); border-radius: 3px 3px 0 0; min-height: 0; }
.bar.zero i { background: var(--surface-2); height: 2px; border-radius: 1px; }
.axis { display: flex; justify-content: space-between; margin-top: 8px; color: var(--ink-muted); font-size: var(--small); }
table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--rule); border-radius: var(--radius-surface); overflow: hidden; }
th, td { padding: 8px 14px; text-align: left; border-top: 1px solid var(--rule); font-variant-numeric: tabular-nums; }
th { border-top: 0; color: var(--ink-muted); font-size: var(--small); font-weight: 500; }
td.n, th.n { text-align: right; }
td .id { color: var(--ink-muted); font-size: var(--small); margin-left: 6px; }
.share { position: relative; }
.share i { position: absolute; inset: 0 auto 0 0; background: var(--blue-soft); }
.share span { position: relative; }
details { background: var(--surface); border: 1px solid var(--rule); border-radius: var(--radius-control); margin-bottom: 4px; }
summary { cursor: pointer; padding: 8px 14px; display: flex; justify-content: space-between; gap: 12px; list-style: none; }
summary::-webkit-details-marker { display: none; }
summary span { color: var(--ink-muted); }
details ul { margin: 0; padding: 0 14px 10px; list-style: none; }
details li { display: flex; justify-content: space-between; padding: 3px 0; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.quiet { color: var(--ink-muted); padding: 24px; text-align: center; background: var(--surface); border-radius: var(--radius-surface); }
footer { margin-top: 32px; color: var(--ink-muted); font-size: var(--small); max-width: 620px; }
@media (max-width: 520px) { td .id { display: none; } th, td { padding: 8px 10px; } }
`;

/**
 * The page for one span.
 * @param {{ days: number, installs: object[], events: object[], failedTurns?: number,
 *   failures?: { turns: object[], reasons: object[] },
 *   launches?: { rows: object[], complete: boolean }, now?: number }} input
 */
export function pageOf({
  days,
  installs,
  events,
  failedTurns = 0,
  failures = { turns: [], reasons: [] },
  launches = { rows: [], complete: true },
  now = Date.now(),
}) {
  const summary = summaryOf(installs, events, days, now);
  const aiName = (provider) => AI_NAMES[provider] ?? provider ?? "Not sent";
  const failedTable = (heads, groups) =>
    `<table><thead><tr>${heads.map((head) => `<th>${head}</th>`).join("")}<th class="n">Failed turns</th><th class="n">Installs</th></tr></thead><tbody>${groups
      .map(
        (group) =>
          `<tr>${group.key.map((cell) => `<td>${escape(cell)}</td>`).join("")}<td class="n">${count(group.times)}</td><td class="n">${count(group.installs)}</td></tr>`,
      )
      .join("")}</tbody></table>`;
  const byModel = failedBy(failures.turns, (row) => [
    aiName(row.provider),
    row.model ?? "Not sent",
  ]);
  const byReason = failedBy(failures.reasons, (row) => [
    aiName(row.provider),
    FAILURE_REASONS[row.reason] ?? "Something else",
  ]);
  const failedSection = failedTurns
    ? `<h2>Failed AI turns</h2>${failedTable(["AI", "Model"], byModel)}${
        byReason.length
          ? `<h2>Why they failed</h2>${failedTable(["AI", "Why"], byReason)}`
          : `<p class="sub">Why a turn failed is sent from Studio 0.1.11 on.</p>`
      }`
    : "";
  const versions = versionsOf(launches.rows);
  const versionTable = versions.length
    ? `<table><thead><tr><th>Version</th><th class="n">Installs that opened it</th></tr></thead><tbody>${versions
        .map(
          (row) =>
            `<tr><td>${escape(row.version)}</td><td class="n">${count(row.installs)}</td></tr>`,
        )
        .join("")}</tbody></table>${
        launches.complete
          ? ""
          : `<p class="sub">From the first ${count(launches.rows.length)} launches of these days.</p>`
      }`
    : `<p class="quiet">No launches were counted in these ${days} days.</p>`;
  const label = (event) => LABELS[event] ?? event;
  const nav = SPANS.map(
    (span) =>
      `<a href="/?days=${span}"${span === days ? ' aria-current="page"' : ""}>${span} days</a>`,
  ).join("");
  const figure = (value, words) =>
    `<div class="figure"><b>${count(value)}</b><span>${words}</span></div>`;
  const top = Math.max(1, summary.busiest);
  const bars = summary.days
    .map(
      ({ day, installs: n }) =>
        `<div class="bar${n ? "" : " zero"}" title="${escape(`${dayName(day)}: ${n} install${n === 1 ? "" : "s"}`)}"><i style="height:${n ? Math.max(4, Math.round((n / top) * 100)) : 0}%"></i></div>`,
    )
    .join("");
  const most = Math.max(1, ...summary.features.map((row) => row.times));
  const features = summary.features.length
    ? `<table><thead><tr><th>Feature</th><th class="n">Times</th><th class="n">Days used</th><th class="n">Most installs in a day</th></tr></thead><tbody>${summary.features
        .map(
          (row) =>
            `<tr><td class="share"><i style="width:${Math.round((row.times / most) * 100)}%"></i><span>${escape(label(row.event))}<span class="id">${escape(row.event)}</span></span></td><td class="n">${count(row.times)}</td><td class="n">${count(row.days)}</td><td class="n">${count(row.most)}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="quiet">Nothing was counted in these ${days} days.</p>`;
  const daysList = summary.days
    .filter((day) => day.installs > 0)
    .map(
      (day) =>
        `<details><summary><b>${escape(dayName(day.day))}</b><span>${count(day.installs)} install${day.installs === 1 ? "" : "s"}</span></summary><ul>${day.events
          .map(
            (row) =>
              `<li><span>${escape(label(row.event))}</span><span>${count(row.times)}</span></li>`,
          )
          .join("")}</ul></details>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Studio usage</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&display=swap">
<style>${STYLE}</style>
</head>
<body>
<main>
<header>
<div><h1>Studio usage</h1><p class="sub">The last ${days} days, from Studio's own receiver. Days are UTC.</p></div>
<nav aria-label="Span">${nav}</nav>
</header>
<section class="figures" aria-label="This span">
${figure(summary.busiest, "most installs in a day")}
${figure(summary.activeDays, `days with use, of ${days}`)}
${figure(summary.chats, "chats started")}
${figure(summary.turns, "AI turns finished")}
${figure(failedTurns, "AI turns failed")}
${figure(summary.cadFailures, "CAD actions failed")}
${figure(summary.edits, "hand edits")}
${figure(summary.projects, "projects made")}
</section>
${failedSection}
<h2>Installs each day</h2>
<div class="chart"><div class="bars" role="img" aria-label="Installs each day, newest on the right">${bars}</div>
<div class="axis"><span>${escape(dayName(summary.days.at(-1).day))}</span><span>Busiest: ${count(summary.busiest)}</span><span>Today</span></div></div>
<h2>What got used</h2>
${features}
<h2>Versions in use</h2>
${versionTable}
${daysList ? `<h2>Day by day</h2>${daysList}` : ""}
<footer>Counts are on once the first-launch notice has told the person, unless they turn them off there or in Settings, About, which deletes what was sent. Before Studio 0.1.10 only installs whose person pressed Share were counted. Studio (Dev) and copies built without the receiver's address send nothing. An install is one copy of Studio on one computer, under a random id this page never shows.</footer>
</main>
</body>
</html>`;
}
