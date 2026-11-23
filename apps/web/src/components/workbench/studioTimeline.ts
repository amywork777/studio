import { msg } from "gt-react";

import type { MessageResolver } from "../../i18n/messages";
import type { TimelineEntry, WorkLogEntry } from "../../session-logic";
import type { ChatMessage } from "../../types";
import {
  engineeringChatWords,
  engineeringFilesLabel,
  engineeringGroupLabel,
  engineeringStepLabel,
  engineeringToolLabel,
} from "./engineeringLabels";
import { isEngineeringInterface } from "./studioInterface";
import { turnReferences, type AnswerReference } from "./references/turnReferences";

// The work log's labels in an engineer's words, in the engineering interface: T3's timeline logic
// (`chat/MessagesTimeline.logic.ts`) calls these where it names a step, and keeps its own words
// everywhere else. Copy that is only a different sentence is in `i18n/engineeringWords.ts`.

import { quietTurnRow as quietRow, turnStepsLine, type QuietTurnRow } from "./quietTurn";

export { quietTurnRowUnchanged, type QuietTurnRow } from "./quietTurn";

/** A work entry's step in an engineer's words while it runs ("Rebuilding the head"), else null. */
function runningStep(entry: TimelineEntry): string | null {
  if (entry.kind !== "work") return null;
  const work = entry.entry;
  if (work.itemType === "reasoning") return null;
  const command = work.command?.trim();
  const step = command ? engineeringStepLabel(command) : toolStep(work);
  return step?.doing ?? null;
}

/**
 * The working row's quiet-turn fields (`quietTurn.ts`), and in the engineering interface its steps
 * so far, "Reading the script → Rebuilding the head", so a running turn says what it is doing.
 */
export function quietTurnRow(
  entries: ReadonlyArray<TimelineEntry>,
  fromIndex: number,
  turnStartedAt: string | null,
): QuietTurnRow {
  const row = quietRow(entries, fromIndex, turnStartedAt);
  if (!isEngineeringInterface()) return row;
  const steps = turnStepsLine(entries, fromIndex, runningStep);
  return steps === null ? row : { ...row, steps };
}
export type { AnswerReference } from "./references/turnReferences";

/** A step on T3's own tools, its threads read as chats in the engineering interface. */
export const toolName = (name: string) =>
  isEngineeringInterface() ? engineeringChatWords(name) : name;

/** A plugin tool's step in an engineer's words ("Showed the model"), in the engineering interface. */
export function toolStep(entry: WorkLogEntry) {
  if (!isEngineeringInterface()) return null;
  const item = entry.structuredPayload;
  return engineeringToolLabel(
    (item?.type === "dynamic_tool" ? item.toolName : null) ?? entry.toolTitle ?? entry.label,
  );
}

/** What a command did to the design, not the command line, in the engineering interface. */
export const commandLabel = (command: string) =>
  isEngineeringInterface() ? engineeringStepLabel(command).done : null;

/** A search step, in the engineering interface. */
export const searchLabel = (resolve: MessageResolver) =>
  isEngineeringInterface() ? resolve(msg("Searched the project")) : null;

/** A step that read or changed files, by the parts they are, in the engineering interface. */
export const filesLabel = (verb: string, paths: ReadonlyArray<string>) =>
  isEngineeringInterface() ? engineeringFilesLabel(verb, paths) : null;

/** A live step (a command, or a plugin tool) in an engineer's words, by its status. */
export function liveStepLabel(
  entry: WorkLogEntry,
  command: string | undefined,
  status: string | null | undefined,
): string | null {
  const step =
    command && isEngineeringInterface() ? engineeringStepLabel(command) : toolStep(entry);
  if (!step) return null;
  return status === "inProgress"
    ? step.doing
    : status === "completed" || status === null || status === undefined
      ? step.done
      : `${step.done} (${status})`;
}

/** A group's summary, in an engineer's words in the engineering interface, naming the parts it changed. */
export const groupSummary = (summary: string, entries: ReadonlyArray<WorkLogEntry>) =>
  isEngineeringInterface()
    ? engineeringGroupLabel(
        summary,
        entries.flatMap((entry) => entry.changedFiles ?? []),
      )
    : summary;

/**
 * What the run's settled final answer cites, in the engineering interface, as the message row's
 * `references`. The list reads every entry of the chat, not the rows: a collapsed turn hides rows,
 * not what the agent opened.
 */
export function answerReferences(
  message: ChatMessage,
  showAssistantMeta: boolean,
  input: {
    readonly timelineEntries: ReadonlyArray<TimelineEntry>;
    readonly workspaceRoot?: string | undefined;
  },
): { references?: ReadonlyArray<AnswerReference> } {
  const references =
    isEngineeringInterface() && showAssistantMeta && !message.streaming
      ? turnReferences({
          id: message.id,
          answer: message.text,
          runId: message.runId,
          entries: input.timelineEntries,
          root: input.workspaceRoot ?? null,
        })
      : [];
  return references.length === 0 ? {} : { references };
}
