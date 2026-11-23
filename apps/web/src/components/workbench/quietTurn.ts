import * as DateTime from "effect/DateTime";

import type { TimelineEntry } from "../../session-logic";

/** How long a working turn may show nothing new before its header says so. */
export const QUIET_TURN_MS = 20 * 60_000;

// Anything still streaming (a reply, a thought, a plan) counts from when it began: its text
// changes skip the rows (replaceStreamingMessageRows), and a streaming turn is not quiet anyway.
function entryChangedAtMs(entry: TimelineEntry): number {
  const projected =
    entry.kind === "work"
      ? entry.entry.projectedItem
      : entry.kind === "event"
        ? entry.projectedItem
        : undefined;
  const item = projected?.item;
  const changedAt = item && !("streaming" in item && item.streaming) ? item.updatedAt : undefined;
  return changedAt ? DateTime.toEpochMillis(changedAt) : Date.parse(entry.createdAt);
}

/**
 * When the working turn last showed something new (an item started, changed or finished), and the
 * latest step it took, so a header can say "nothing new for 20m" instead of only counting up.
 */
export function latestTurnActivity(
  entries: ReadonlyArray<TimelineEntry>,
  fromIndex: number,
  turnStartedAt: string | null,
): { at: string; step: string | null } | null {
  let latestMs = turnStartedAt ? Date.parse(turnStartedAt) : Number.NaN;
  let step: string | null = null;
  for (let index = Math.max(0, fromIndex); index < entries.length; index += 1) {
    const entry = entries[index]!;
    const at = entryChangedAtMs(entry);
    if (Number.isFinite(at) && !(at < latestMs)) latestMs = at;
    if (entry.kind === "work") step = entry.entry.toolTitle ?? entry.entry.label;
  }
  return Number.isFinite(latestMs) ? { at: new Date(latestMs).toISOString(), step } : null;
}

/** The working row's quiet-turn fields: when the turn last showed something new, and its latest step. */
export interface QuietTurnRow {
  quietSince?: string;
  lastStep?: string;
  /** Studio: the turn's steps so far in an engineer's words, "Reading the script → Rebuilding head". */
  steps?: string;
}

/** The working row's `quietSince` and `lastStep` (latestTurnActivity), for T3's timeline rows. */
export function quietTurnRow(
  entries: ReadonlyArray<TimelineEntry>,
  fromIndex: number,
  turnStartedAt: string | null,
): QuietTurnRow {
  const activity = latestTurnActivity(entries, fromIndex, turnStartedAt);
  return {
    ...(activity ? { quietSince: activity.at } : {}),
    ...(activity?.step ? { lastStep: activity.step } : {}),
  };
}

export const quietTurnRowUnchanged = (a: QuietTurnRow, b: QuietTurnRow) =>
  a.quietSince === b.quietSince && a.lastStep === b.lastStep && a.steps === b.steps;

/** How many of a turn's latest steps its working row names. */
const TURN_STEPS_SHOWN = 3;

/**
 * A working turn's steps as one line, from `fromIndex` on: each step's name (`stepOf`, null for
 * one with no engineer's name), a step repeated straight after itself once, the latest
 * `TURN_STEPS_SHOWN` joined by arrows. Null before the turn has a named step.
 */
export function turnStepsLine<Entry>(
  entries: ReadonlyArray<Entry>,
  fromIndex: number,
  stepOf: (entry: Entry) => string | null,
): string | null {
  const steps: string[] = [];
  for (let index = Math.max(0, fromIndex); index < entries.length; index += 1) {
    const step = stepOf(entries[index]!);
    if (step !== null && steps.at(-1) !== step) steps.push(step);
  }
  return steps.length === 0 ? null : steps.slice(-TURN_STEPS_SHOWN).join(" → ");
}
