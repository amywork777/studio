import type { EnvironmentId, StudioProject } from "@t3tools/contracts";
import type { RefObject } from "react";

import { cn } from "~/lib/utils";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { Input } from "../ui/input";
import { fileTint, KIND_ICONS } from "./kinds";
import { type ListedProject, lastTouched } from "./projectList";
import { waitingChat } from "./recentActivity";
import { findProjects } from "./recentProjects";
import { StarButton } from "./StarButton";
import { splitStarred, useStarredStore } from "./starredProjects";
import { useProjectCover } from "./useProjectCover";

/**
 * Choosing a project, the one way Studio does it: the project switcher (`ProjectSwitcher`) and
 * the project Home's box sends a chat to (`ProjectPicker`) share its control, its pictures and
 * its list, so a project looks and is found the same everywhere.
 */

/** The control a project is chosen with: a bordered button, its picture and its name on one line. */
export const PROJECT_CONTROL_CLASS =
  "flex min-w-0 max-w-full items-center gap-2 rounded-lg py-1 ps-1 pe-2 text-left outline-none transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-[popup-open]:bg-accent";

/** A row of the list, or an action under it: the row is the one hover. */
export const PROJECT_ROW_CLASS =
  "flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-foreground outline-none transition-colors duration-150 hover:bg-accent focus-visible:bg-accent";
/** A project row: the row is the one hover, its star a quiet part of it. */
const projectRowClass =
  "group/row flex min-w-0 items-center rounded-md pe-1 transition-colors duration-150 hover:bg-accent has-[button:focus-visible]:bg-accent";
/** Starred and Recent, as Home and the menus label a group. */
const groupClass = "px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground";

/** When a project was last opened on this device, or worked on if that came later. */
export function whenTouched(card: ListedProject): string {
  const opened = card.opened !== null && card.opened >= card.latest;
  return `${opened ? "Opened" : "Worked on"} ${formatRelativeTimeLabel(lastTouched(card))}`;
}

/**
 * How a project stands under its name in a list: "Needs you" while one of its chats waits on the
 * person (a question, an approval), as Home's tiles and the sidebar's chats say it; else when.
 */
export function projectStanding(card: ListedProject): {
  readonly text: string;
  readonly waiting: boolean;
} {
  return waitingChat(card.threads) !== null
    ? { text: "Needs you", waiting: true }
    : { text: whenTouched(card), waiting: false };
}

/** Projects with a chat waiting on the person first, each list otherwise in its own order. */
export function waitingFirst(cards: ReadonlyArray<ListedProject>): ListedProject[] {
  return cards.toSorted(
    (a, b) => Number(waitingChat(b.threads) !== null) - Number(waitingChat(a.threads) !== null),
  );
}

/**
 * A project's picture, small, beside its name: its main part, as on its tile (`useProjectCover`),
 * or its kind's icon until it has one.
 */
export function ProjectThumb(props: {
  readonly environmentId: EnvironmentId;
  readonly project: StudioProject | null;
  readonly size?: "xs" | "sm" | "md";
}) {
  const picture = useProjectCover(props.environmentId, props.project);
  const kind = props.project?.template === "board" ? "Electronics" : "CAD";
  const KindIcon = KIND_ICONS[kind];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-(--model-ground)",
        props.size === "xs" ? "size-4 rounded-sm" : props.size === "sm" ? "size-6" : "size-8",
      )}
    >
      {picture ? (
        <img src={picture} alt="" className="size-full object-cover" />
      ) : (
        <KindIcon className={cn("size-3.5", fileTint(kind))} aria-hidden="true" />
      )}
    </span>
  );
}

/**
 * The projects to choose from: a box to find one by name, then the starred ones and the rest, the
 * one opened last first, each with its picture, when, and its star on hover.
 */
export function ProjectChoices(props: {
  readonly environmentId: EnvironmentId;
  readonly cards: ReadonlyArray<ListedProject>;
  /** Left out of the list: the switcher's open project, which heads it instead. */
  readonly leaveOut?: (card: ListedProject) => boolean;
  readonly onChoose: (card: ListedProject) => void;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly inputRef?: RefObject<HTMLInputElement | null>;
  /** What an empty list says with nothing typed. */
  readonly none: string;
}) {
  const { environmentId, leaveOut, onChoose, query, onQueryChange, inputRef, none } = props;
  const starredIds = useStarredStore((store) => store.starred);
  const shown = findProjects(props.cards, query).filter(
    (card) => leaveOut === undefined || !leaveOut(card),
  );
  const split = splitStarred(shown, starredIds);
  const starred = waitingFirst(split.starred);
  const rest = waitingFirst(split.rest);

  const row = (card: ListedProject) => {
    const standing = projectStanding(card);
    return (
      <div key={card.id} className={projectRowClass}>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-left text-sm text-foreground outline-none"
          onClick={() => onChoose(card)}
        >
          <ProjectThumb environmentId={environmentId} project={card.project} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">{card.project.name}</span>
            <span
              className={cn(
                "truncate text-xs",
                standing.waiting ? "text-info-foreground" : "text-muted-foreground",
              )}
            >
              {standing.text}
            </span>
          </span>
        </button>
        <StarButton
          id={card.id}
          name={card.project.name}
          quiet
          className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[starred]:opacity-100"
        />
      </div>
    );
  };

  return (
    <>
      <Input
        ref={inputRef}
        size="sm"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          const first = starred[0] ?? rest[0];
          if (event.key !== "Enter" || first === undefined) return;
          event.preventDefault();
          onChoose(first);
        }}
        placeholder="Find a project"
        aria-label="Find a project"
      />
      <div className="mt-1 flex max-h-80 flex-col overflow-y-auto">
        {shown.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            {query.trim() === "" ? none : "No project matches that."}
          </p>
        ) : (
          <>
            {starred.length === 0 ? null : (
              <>
                <p className={groupClass}>Starred</p>
                {starred.map(row)}
              </>
            )}
            {rest.length === 0 ? null : (
              <>
                {starred.length === 0 ? null : <p className={groupClass}>Recent</p>}
                {rest.map(row)}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
