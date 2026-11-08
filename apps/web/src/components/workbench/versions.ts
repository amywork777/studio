import type { CheckResult } from "./checkResults";
import { inSentence } from "./partNames";
import type { ProjectFile } from "./projectFiles";

/**
 * A part's versions and what changed between two of them, as the Overview's Versions shows them
 * (`PartVersions.tsx`, `WhatChanged.tsx`). The versions are the project's checkpoints: every chat
 * turn ends with one, a commit kept under `refs/t3/orchestration-v2/checkpoints/<scope>/ordinal/<n>`,
 * read through the CAD service (`text-to-cad/.../cadgen/edit/versions.py`). The lines follow
 * Fixture's What changed (`apps/web/src/compare/`), in Studio's words.
 */

/** One version of a file: the checkpoint where its contents changed, or `now`, the file on disk. */
export interface PartVersion {
  /** The checkpoint's commit, or "now" for a hand edit since the last turn. */
  readonly id: string;
  readonly ref: string | null;
  /** Seconds since 1970. */
  readonly time: number;
  readonly blob: string;
}

export const NOW = "now";

/** Where the CAD service keeps what was on disk when a version was restored (`versions.py`). */
const KEPT_REF = "refs/studio/kept/";

/** A version kept on restoring another: what the person had then, so it can be gone back to. */
export function isKeptVersion(version: Pick<PartVersion, "ref">): boolean {
  return version.ref?.startsWith(KEPT_REF) === true;
}

/** The earliest version before this one with the same contents, as a restore leaves it; -1 if none. */
export function sameAsEarlier(versions: ReadonlyArray<Pick<PartVersion, "blob">>, index: number) {
  const blob = versions[index]?.blob;
  return blob === undefined
    ? -1
    : versions.findIndex((version, at) => at < index && version.blob === blob);
}

/**
 * The versions as Versions lists them, oldest first: "Version 3" (or "Now", the file on disk), and
 * when, with the chat that made it; a kept one says it is what the person had before restoring,
 * and Now says which version it was restored from, else that it was changed by hand.
 */
export function versionChoices(
  versions: ReadonlyArray<PartVersion>,
  chatOf: (version: PartVersion) => string | null,
  whenOf: (version: PartVersion) => string,
): Array<{ readonly id: string; readonly label: string; readonly detail: string }> {
  const labelAt = (index: number) => (versions[index]?.id === NOW ? "Now" : `Version ${index + 1}`);
  return versions.map((version, index) => {
    const when = whenOf(version);
    const label = labelAt(index);
    if (version.id === NOW) {
      const same = sameAsEarlier(versions, index);
      return {
        id: version.id,
        label,
        detail: same === -1 ? `changed by hand ${when}` : `restored from ${labelAt(same)}, ${when}`,
      };
    }
    if (isKeptVersion(version)) {
      return { id: version.id, label, detail: `${when}, what you had before restoring` };
    }
    const chat = chatOf(version);
    return { id: version.id, label, detail: chat === null ? when : `${when}, ${chat}` };
  });
}

/** What restoring tells the agent with the person's next message, as a hand edit's note does. */
export function restoreNote(input: {
  readonly part: string;
  readonly version: string;
  readonly when: string;
  readonly files: ReadonlyArray<string>;
}): string {
  const files = input.files.length === 0 ? "" : ` (${input.files.join(", ")})`;
  return `In Version history I restored ${inSentence(input.part)} to ${input.version}, from ${input.when}${files}.`;
}

/** Why a restore did not happen, in plain words: the CAD service's own when it says one. */
export function plainRestoreError(error: string): string {
  // A CAD service started before Restore came in has no such route.
  if (/not found/i.test(error)) return "Studio needs a restart before it can restore a version.";
  if (/^(?:That is|There is no)\b/.test(error)) return error;
  return "Studio couldn't restore that version.";
}

/** A size in a part's script, as the CAD service reads it: `HOOK_DEPTH = 40`. */
export interface NamedSize {
  readonly name: string;
  readonly value: number;
  readonly line: number;
}

/** A version's size and solids, as the CAD service measures them. */
export interface ShapeFacts {
  readonly bbox: { readonly min: ReadonlyArray<number>; readonly max: ReadonlyArray<number> };
  readonly volume_mm3: number;
  readonly bodies: number;
}

/** The solids of two versions compared: when done, the material added, removed and kept. */
export type ShapeComparison =
  | { readonly status: "working"; readonly retryMs: number }
  | { readonly status: "unsupported" }
  | { readonly status: "failed"; readonly error: string; readonly environment?: boolean }
  | {
      readonly status: "done";
      readonly same: boolean;
      readonly moved: boolean;
      readonly added_mm3: number;
      readonly removed_mm3: number;
      readonly kept_mm3: number;
      readonly older: ShapeFacts;
      readonly newer: ShapeFacts;
    };

export interface Comparison {
  readonly key: string;
  /** The two versions' files and, once compared, the difference: paths in the project's folder. */
  readonly files: { readonly older: string; readonly newer: string; readonly diff: string | null };
  readonly shape: ShapeComparison;
  readonly script?: {
    readonly path: string;
    readonly older: string | null;
    readonly newer: string | null;
    readonly olderSizes: ReadonlyArray<NamedSize> | null;
    readonly newerSizes: ReadonlyArray<NamedSize> | null;
  };
  readonly texts?: Readonly<
    Record<string, { readonly older: string | null; readonly newer: string | null }>
  >;
}

const CHECKPOINT_REF = /^refs\/t3\/orchestration-v2\/checkpoints\/([^/]+)\/ordinal\/(\d+)$/;

/** The thread scope a checkpoint ref belongs to, and its turn. */
export function readCheckpointRef(
  ref: string | null,
): { readonly scope: string; readonly turn: number } | null {
  const match = ref === null ? null : CHECKPOINT_REF.exec(ref);
  return match === null ? null : { scope: match[1]!, turn: Number(match[2]) };
}

/** The checkpoint a turn started from: the one before it in the same thread. */
export function checkpointBefore(ref: string): string | null {
  const read = readCheckpointRef(ref);
  return read === null || read.turn === 0
    ? null
    : ref.replace(/\/ordinal\/\d+$/, `/ordinal/${read.turn - 1}`);
}

const base64Url = (text: string) =>
  btoa(text).replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");

/**
 * The scope part of a thread's checkpoint refs, as Studio's server writes it (`CheckpointService`):
 * Base64Url of the first 32 hex digits of SHA-256 of the thread's root scope id.
 */
export async function checkpointScopeOf(threadId: string): Promise<string> {
  const scopeId = `checkpoint-scope:thread:${encodeURIComponent(threadId)}:name:root`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(scopeId));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
  return base64Url(hex);
}

/** A size's name as an engineer reads it: `HOOK_DEPTH` is "Hook depth", `M3_HOLE` "M3 hole". */
export function sizeName(name: string): string {
  const words = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => (/\d/.test(word) ? word.toUpperCase() : word.toLowerCase()));
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What a size's own comment says it is: `STAGE = 20  # the lift of the tray` is "Lift of the tray". */
function commentWords(script: string | null | undefined, line: number): string | null {
  const comment = script?.split("\n")[line - 1]?.split("#")[1]?.trim() ?? "";
  // Its first clause: the rest is reasoning, and a number there goes out of date.
  const words = comment
    .split(/[:;,(]/)[0]!
    .trim()
    .replace(/^the\s+/i, "");
  if (!/^[a-z]/i.test(words) || !/[a-z]{3}/i.test(words) || words.length > 40) return null;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A size as a line says it: its name in words where it has several (`HOOK_DEPTH` is "Hook depth").
 * One word alone ("Stage") says too little: its comment says what it is, else its name stands as
 * the script writes it, as Sizes shows it.
 */
function sizeLabel(size: NamedSize, script: string | null | undefined): string {
  const name = sizeName(size.name);
  if (name.includes(" ")) return name;
  return commentWords(script, size.line) ?? size.name;
}

export interface SizeChange {
  readonly kind: "changed" | "added" | "removed";
  readonly name: string;
  readonly from?: number;
  readonly to?: number;
}

const rounded = (value: number) => Math.round(value * 1000) / 1000;

/**
 * The named sizes that changed between two versions of a script, in the newer one's order, then
 * those it no longer has, each as `sizeLabel` says it from that version's text (`scripts`). A name
 * written twice is told apart by its order ("Width (2)").
 */
export function sizeChanges(
  older: ReadonlyArray<NamedSize> | null,
  newer: ReadonlyArray<NamedSize> | null,
  scripts?: { readonly older: string | null; readonly newer: string | null },
): SizeChange[] | null {
  if (older === null || newer === null) return null;
  const keyed = (sizes: ReadonlyArray<NamedSize>, script: string | null | undefined) => {
    const seen = new Map<string, number>();
    return sizes.map((size) => {
      const count = seen.get(size.name) ?? 0;
      seen.set(size.name, count + 1);
      return {
        key: `${size.name}#${count}`,
        name: count === 0 ? sizeLabel(size, script) : `${sizeLabel(size, script)} (${count + 1})`,
        size,
      };
    });
  };
  const was = keyed(older, scripts?.older);
  const before = new Map(was.map((entry) => [entry.key, entry.size]));
  const now = keyed(newer, scripts?.newer);
  const after = new Set(now.map((entry) => entry.key));
  const changes: SizeChange[] = [];
  for (const { key, name, size } of now) {
    const held = before.get(key);
    if (held === undefined) changes.push({ kind: "added", name, to: size.value });
    else if (rounded(held.value) !== rounded(size.value))
      changes.push({ kind: "changed", name, from: held.value, to: size.value });
  }
  for (const { key, name, size } of was) {
    if (!after.has(key)) changes.push({ kind: "removed", name, from: size.value });
  }
  return changes;
}

const number = (value: number) => String(rounded(value));

/** "Hook depth 40 to 48 mm", "Rib added: 3 mm", "Old tab removed". */
export function sizeLine(change: SizeChange, unit: string): string {
  const of = (value: number | undefined) => `${number(value ?? 0)}${unit === "" ? "" : ` ${unit}`}`;
  if (change.kind === "added") return `${change.name} added: ${of(change.to)}`;
  if (change.kind === "removed") return `${change.name} removed`;
  return `${change.name} ${number(change.from ?? 0)} to ${of(change.to)}`;
}

const tenth = (value: number) => Math.round(value * 10) / 10;
const extentOf = (facts: ShapeFacts) =>
  facts.bbox.max.map((max, axis) => tenth(max - (facts.bbox.min[axis] ?? 0)));
const signOf = (value: number) => (value > 0 ? "+" : "−");

/** "Volume +6,400 mm³ (+12%)", or "Volume unchanged". */
export function volumeLine(shape: ShapeComparison): string | null {
  if (shape.status !== "done") return null;
  const delta = shape.added_mm3 - shape.removed_mm3;
  const before = shape.kept_mm3 + shape.removed_mm3;
  const amount = Math.round(Math.abs(delta));
  if (amount === 0) return "Volume unchanged";
  const percent = before > 0 ? Math.round(Math.abs(delta / before) * 100) : null;
  const share = percent === null ? "" : percent === 0 ? " (<1%)" : ` (${signOf(delta)}${percent}%)`;
  return `Volume ${signOf(delta)}${amount.toLocaleString("en-US")} mm³${share}`;
}

/** "48 × 30 × 70 mm, was 40 × 30 × 70", or "40 × 30 × 70 mm, the same size". */
export function extentLine(shape: ShapeComparison): string | null {
  if (shape.status !== "done") return null;
  const now = extentOf(shape.newer).join(" × ");
  const was = extentOf(shape.older).join(" × ");
  return was === now ? `${now} mm, the same size` : `${now} mm, was ${was}`;
}

export interface CheckChange {
  readonly check: string;
  readonly line: string;
}

/** The checks run on the part at either version, each with how it went then and now. */
export function checkChanges(
  older: ReadonlyArray<CheckResult>,
  newer: ReadonlyArray<CheckResult>,
): CheckChange[] {
  const before = new Map(older.map((result) => [result.check, result]));
  const lines: CheckChange[] = newer.map((result) => {
    const was = before.get(result.check);
    before.delete(result.check);
    if (was === undefined) return { check: result.check, line: `${result.headline}, new` };
    return {
      check: result.check,
      line:
        was.headline === result.headline
          ? `${result.headline}, as before`
          : `${result.headline}, was ${was.headline.charAt(0).toLowerCase()}${was.headline.slice(1)}`,
    };
  });
  for (const was of before.values()) lines.push({ check: was.check, line: "No longer run" });
  return lines;
}

/** A line of the script's comparison, or a run of unchanged lines folded; `key` names it there. */
export type ScriptRow =
  | { readonly kind: "same" | "added" | "removed"; readonly text: string; readonly key: string }
  | { readonly kind: "folded"; readonly count: number; readonly key: string };

/**
 * Two versions of a script line by line: removed and added lines, and the unchanged runs folded
 * to a count beyond three lines of context. Scripts are short, so the longest common run of lines
 * is worked out whole.
 */
export function scriptRows(older: string, newer: string, context = 3): ScriptRow[] {
  const a = older.split("\n");
  const b = newer.split("\n");
  const lengths = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i]![j] =
        a[i] === b[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  const rows: Array<{ kind: "same" | "added" | "removed"; text: string; key: string }> = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      rows.push({ kind: "same", text: a[i]!, key: `s${i}:${j}` });
      i++;
      j++;
    } else if (i < a.length && (j === b.length || lengths[i + 1]![j]! >= lengths[i]![j + 1]!)) {
      // What went comes before what replaced it, as a diff reads.
      rows.push({ kind: "removed", text: a[i]!, key: `r${i}` });
      i++;
    } else {
      rows.push({ kind: "added", text: b[j]!, key: `a${j}` });
      j++;
    }
  }
  const changed = rows
    .map((row, index) => (row.kind === "same" ? -1 : index))
    .filter((index) => index >= 0);
  const near = (index: number) => changed.some((at) => Math.abs(at - index) <= context);
  const shown: ScriptRow[] = [];
  let folded = 0;
  const fold = (at: number) => {
    if (folded > 0) shown.push({ kind: "folded", count: folded, key: `f${at - folded}` });
    folded = 0;
  };
  rows.forEach((row, index) => {
    if (row.kind !== "same" || near(index)) {
      fold(index);
      shown.push(row);
    } else folded++;
  });
  fold(rows.length);
  return shown;
}

/**
 * The file a part's versions are read from: a design's STEP, a model's script (its path is its
 * document id, which no checkpoint holds), else the part's own file.
 */
export const versionedPath = (file: ProjectFile) => file.picture ?? file.script ?? file.path;

/** Whether `path` is `file`: by its versioned file, its own path, or a model's STEP exported beside its script. */
export const isPartPath = (file: ProjectFile, path: string) =>
  versionedPath(file) === path ||
  file.path === path ||
  (file.script !== undefined &&
    /\.(?:step|stp)$/i.test(path) &&
    file.script.replace(/\.py$/i, "") === path.replace(/\.(?:step|stp)$/i, ""));
