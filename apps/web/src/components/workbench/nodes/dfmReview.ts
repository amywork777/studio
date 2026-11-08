/**
 * A part's manufacturing review, as the text-to-cad `dfm` and `sendcutsend` skills write it: a
 * Markdown report whose findings table gives each feature's result (pass, fail, review or
 * unverified, or SendCutSend's ✅ and ❌) and the suggested change. Read as a check result, so it
 * shows as every other check does (`CheckBadge`, "Propose a fix"). Plain functions, no React.
 */

import type { CheckIssue, CheckResult, CheckStatus } from "../checkResults";
import { reviewSuffix } from "../hardwareActions";

/** A review's file: `docs/motor_plate_dfm.md`, `docs/bracket_sendcutsend.md`. */
const REVIEW_FILE = /(?:dfm|sendcutsend)[^/]*\.md$/i;

export const isReviewPath = (path: string) => REVIEW_FILE.test(path);

type Result = "pass" | "fail" | "review" | "unverified";

/** A finding's result, from its cell: the skill's word first, else SendCutSend's mark. */
function resultOf(cell: string): Result | null {
  const word = /\b(pass|fail|review|unverified)\b/i.exec(cell)?.[1]?.toLowerCase();
  if (word !== undefined) return word as Result;
  if (cell.includes("✅")) return "pass";
  if (cell.includes("❌")) return "fail";
  if (cell.includes("⚠")) return "review";
  if (cell.includes("❓") || /need more info/i.test(cell)) return "unverified";
  return null;
}

const cellsOf = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replaceAll("\\|", "|"));

const isRule = (line: string) => /^\|?\s*:?-{3,}/.test(line.trim());

/** Markdown kept out of a card's words: links to their text, emphasis and code marks dropped. */
const plain = (text: string) =>
  text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();

const NO_ACTION = /^(none|n\/a|-|—|)$/i;

const baseName = (path: string) => path.replaceAll("\\", "/").split("/").at(-1) ?? path;

/** The review's file name without `.md`, lowercase: what names the part it is of. */
export const reviewStem = (path: string) => baseName(path).replace(/\.md$/i, "").toLowerCase();

/** What was checked, from the title ("Motor plate: CNC machining review"), else the file's name. */
function checkName(title: string | null, path: string): string {
  const after = title?.includes(":") ? title.slice(title.indexOf(":") + 1) : null;
  const named = after
    ?.replace(/\b(review|preflight|dfm)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (named !== undefined && named !== "") return named[0]!.toUpperCase() + named.slice(1);
  return /sendcutsend/i.test(path) ? "SendCutSend" : "Manufacturing";
}

/**
 * The review at `path` as a check result, or null when it holds no findings table with a result
 * column (a measurement's notes, say, or a review still being written). A failed finding is an
 * error, one to review or not measured a warning; a review whose every finding passes passes.
 */
export function parseReview(
  path: string,
  contents: string,
  modifiedAt?: string,
): CheckResult | null {
  const lines = contents.split(/\r?\n/);
  const title = lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, "") ?? null;

  const issues: CheckIssue[] = [];
  let rows = 0;
  for (let at = 0; at < lines.length; at += 1) {
    const header = lines[at] ?? "";
    if (!header.trim().startsWith("|") || !isRule(lines[at + 1] ?? "")) continue;
    const names = cellsOf(header).map((name) => plain(name).toLowerCase());
    const result = names.findIndex((name) => name === "result" || name === "status");
    if (result < 0) continue;
    const action = names.findIndex((name) => /action|fix|next/.test(name));
    for (at += 2; at < lines.length && (lines[at] ?? "").trim().startsWith("|"); at += 1) {
      const cells = cellsOf(lines[at] ?? "");
      const found = resultOf(cells[result] ?? "");
      if (found === null) continue;
      rows += 1;
      if (found === "pass") continue;
      const feature = plain(cells[0] ?? "") || "A finding";
      const fix = action < 0 ? "" : plain(cells[action] ?? "");
      issues.push({
        severity: found === "fail" ? "error" : "warning",
        summary: `${feature}: ${found === "unverified" ? "not checked" : found === "fail" ? "fails" : "to review"}`,
        fix: NO_ACTION.test(fix) ? null : fix,
      });
    }
  }
  if (rows === 0) return null;

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const status: CheckStatus =
    errors.length > 0 ? "fix" : warnings.length > 0 ? "warnings" : "ready";
  const passed = rows - errors.length - warnings.length;
  return {
    path,
    model: path,
    part: reviewStem(path),
    check: checkName(title, path),
    status,
    headline: [
      errors.length > 0 ? `${errors.length} to fix` : null,
      warnings.length > 0 ? `${warnings.length} to look at` : null,
      passed > 0 ? `${passed} pass` : null,
    ]
      .filter((part) => part !== null)
      .join(", "),
    issues: [...errors, ...warnings],
    ...(modifiedAt === undefined ? {} : { written: Date.parse(modifiedAt) / 1000 }),
  };
}

/**
 * Which part each review is of: the part whose script's name starts the review's file name
 * (`motor_plate.py` for `motor_plate_dfm.md`), the longest such name when two do.
 */
export function reviewOwner(
  review: string,
  parts: ReadonlyArray<{ readonly id: string; readonly script: string }>,
): string | null {
  const stem = reviewStem(review);
  let best: { id: string; length: number } | null = null;
  for (const part of parts) {
    const name = baseName(part.script)
      .replace(/\.[^.]+$/, "")
      .toLowerCase();
    if (name === "" || !(stem === name || stem.startsWith(`${name}_`))) continue;
    if (best === null || name.length > best.length) best = { id: part.id, length: name.length };
  }
  return best?.id ?? null;
}

/** Where a check run from a node saves its review, so the node finds it: `docs/<part>_<check>.md`. */
export function reviewPathFor(script: string, actionId: string): string {
  const name = baseName(script)
    .replace(/\.[^.]+$/, "")
    .toLowerCase();
  return `docs/${name}${reviewSuffix(actionId)}`;
}
