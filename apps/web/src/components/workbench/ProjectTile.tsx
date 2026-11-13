import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, StudioProject } from "@t3tools/contracts";
import { EllipsisIcon } from "lucide-react";

import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { Badge } from "../ui/badge";
import { fileTint, KIND_ICONS } from "./kinds";
import { projectActivity } from "./recentProjects";
import { StarButton } from "./StarButton";
import { Page } from "./OverviewModules";
import { useProjectCover, useProjectPage } from "./useProjectCover";
import { chatLabel, workspaceTitle } from "./workspaceTitle";

/**
 * A project tile: a picture of its main part (first assembly, else first part or board) or its
 * kind's icon, its name as the sidebar says it, and its latest or waiting chat. Needs you on the
 * picture's corner is the only place the tile says a chat waits. With `onMenu`, it opens its menu.
 */
export function ProjectTile(props: {
  readonly environmentId: EnvironmentId;
  /** The Studio project's id, which its star is kept by. */
  readonly id: string;
  readonly project: StudioProject;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  /** Its chats waiting on the person (a question, an approval), newest first; Home passes them. */
  readonly waiting?: ReadonlyArray<EnvironmentThreadShell>;
  /** When it was opened or worked on, as the project switcher says it (`whenTouched`). */
  readonly when?: string;
  readonly onOpen: () => void;
  /** Opens the project's menu at a place on screen (`useProjectMenu`). */
  readonly onMenu?: (position: { readonly x: number; readonly y: number }) => void;
}) {
  const { environmentId, project } = props;
  const waiting = props.waiting ?? [];
  const picture = useProjectCover(environmentId, project);
  // A project of documents is pictured by its first one, as a page of words.
  const page = useProjectPage(environmentId, project);
  // The minute as the page knows it (UTC), so the tile re-reads as time passes.
  const now = Date.parse(`${useNowMinute()}:00Z`);
  const activity = projectActivity({
    createdAt: project.createdAt,
    threads: props.threads,
    now,
    relative: formatRelativeTimeLabel,
  });
  const first = waiting[0];
  const line =
    first === undefined
      ? (props.when ?? activity.line)
      : waiting.length === 1
        ? chatLabel(first.title)
        : `${waiting.length} chats are waiting on you`;
  const kind = project.template === "board" ? "Electronics" : "CAD";
  const KindIcon = KIND_ICONS[kind];
  const name = workspaceTitle(project.name, null);

  return (
    <div className="group/tile relative flex min-w-0 flex-col">
      <button
        type="button"
        onClick={props.onOpen}
        onContextMenu={
          props.onMenu === undefined
            ? undefined
            : (event) => {
                event.preventDefault();
                props.onMenu?.({ x: event.clientX, y: event.clientY });
              }
        }
        className={cn(
          "group flex min-w-0 flex-col overflow-hidden rounded-lg border bg-background text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          first === undefined ? "border-border hover:border-foreground/25" : "border-primary",
        )}
      >
        <span className="relative flex aspect-[4/3] items-center justify-center overflow-hidden border-b border-border bg-(--model-ground)">
          {picture ? (
            <img src={picture} alt="" className="size-full object-cover" />
          ) : page !== null ? (
            <Page environmentId={environmentId} root={page.root} path={page.path} />
          ) : (
            <KindIcon className={cn("size-8", fileTint(kind))} aria-hidden="true" />
          )}
          {first !== undefined ? (
            <span className="absolute top-2 left-2">
              <Badge>Needs you</Badge>
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "flex min-w-0 flex-col gap-1.5 p-3",
            // Room for the "…" at its end, so a long name stops short of it.
            props.onMenu !== undefined && "pe-9",
          )}
        >
          <span className="truncate text-sm font-medium text-foreground">{name}</span>
          <span className="truncate text-xs text-muted-foreground tabular-nums">{line}</span>
        </span>
      </button>
      <StarButton
        id={props.id}
        name={name}
        className="absolute top-2 right-2 bg-background/85 opacity-0 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 data-[starred]:opacity-100"
      />
      {props.onMenu === undefined ? null : (
        <button
          type="button"
          aria-label={`More for ${name}`}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            props.onMenu?.({ x: box.left, y: box.bottom });
          }}
          className="absolute right-2 bottom-2 flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity duration-150 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset group-hover/tile:opacity-100"
        >
          <EllipsisIcon className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
