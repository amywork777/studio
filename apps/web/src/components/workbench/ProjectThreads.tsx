import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ScopedProjectRef, ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleIcon,
  CircleSlashIcon,
  CircleXIcon,
  GaugeIcon,
  type LucideIcon,
  MessageSquareIcon,
} from "lucide-react";

import { usePrimarySettings } from "~/hooks/useSettings";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { useThreadShellsForProjectRefs } from "~/state/entities";
import { buildThreadRouteParams } from "~/threadRoutes";
import { formatRelativeTimeLabel, formatShortTimestamp } from "~/timestampFormat";
import { type HistoryOutcome, historyByDay, historyOutcome } from "./projectHistory";
import { useEngineeringInterface } from "./studioInterface";
import { GROUP_LABEL, SECTION_STACK } from "./studioLayout";

/** How a piece of work came out, as its mark and, where it is the news, in words. */
const OUTCOMES: Record<
  HistoryOutcome,
  { readonly Icon: LucideIcon; readonly word: string | null; readonly tone: string }
> = {
  "needs-you": { Icon: CircleAlertIcon, word: "Needs you", tone: "text-info-foreground" },
  working: { Icon: CircleDashedIcon, word: "Working", tone: "text-foreground" },
  failed: { Icon: CircleXIcon, word: "Failed", tone: "text-destructive" },
  limited: { Icon: GaugeIcon, word: "Usage limit", tone: "text-warning-foreground" },
  stopped: { Icon: CircleSlashIcon, word: "Stopped", tone: "text-muted-foreground" },
  done: { Icon: CircleCheckIcon, word: null, tone: "text-muted-foreground" },
  "not-started": { Icon: CircleIcon, word: "Not started", tone: "text-muted-foreground" },
};

/**
 * Every thread in the project's folders, newest first under the day last worked on, archived ones
 * left out. With code tools on, the same list reads in T3 Code's words.
 */
export function ProjectThreads(props: {
  /** The project's folders' records (stable between renders). */
  readonly projectRefs: ReadonlyArray<ScopedProjectRef>;
  /** Folder names by folder record id; null when the project has one folder. */
  readonly folderNames: ReadonlyMap<string, string> | null;
  readonly currentThreadId: ThreadId | null;
  readonly query: string;
  /** The newest this many, for the overview; all when absent. */
  readonly limit?: number;
}) {
  const navigate = useNavigate();
  useNowMinute();
  const plainWords = useEngineeringInterface();
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const shells = useThreadShellsForProjectRefs(props.projectRefs);
  const needle = props.query.trim().toLowerCase();
  const days = historyByDay(
    shells
      .filter((thread) => thread.archivedAt === null)
      .filter((thread) => needle === "" || thread.title.toLowerCase().includes(needle))
      .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, props.limit),
  );

  if (days.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        {needle !== ""
          ? "Nothing matches that."
          : plainWords
            ? "No history yet. The work you start in this project shows up here."
            : "No threads in this project yet."}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3" aria-label={plainWords ? "History" : "Threads"}>
      {days.map(({ day, threads }) => (
        <section key={day} aria-label={day} className={SECTION_STACK}>
          <h3 className={GROUP_LABEL}>{day}</h3>
          <ul className="flex flex-col border-t border-border">
            {threads.map((thread) => {
              const current = thread.id === props.currentThreadId;
              const outcome = OUTCOMES[historyOutcome(thread)];
              const Icon = plainWords ? outcome.Icon : MessageSquareIcon;
              return (
                <li key={thread.id} className="border-b border-border">
                  <button
                    type="button"
                    aria-current={current ? "page" : undefined}
                    onClick={() =>
                      void navigate({
                        to: "/$environmentId/$threadId",
                        params: buildThreadRouteParams(
                          scopeThreadRef(thread.environmentId, thread.id),
                        ),
                      })
                    }
                    className={cn(
                      "flex w-full min-w-0 items-center gap-3 p-3 text-left outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      current && "bg-accent/60",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        plainWords ? outcome.tone : "text-muted-foreground",
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {thread.title || (plainWords ? "New work" : "New thread")}
                    </span>
                    {props.folderNames === null ? null : (
                      <span className="max-w-32 shrink-0 truncate text-xs text-muted-foreground">
                        {props.folderNames.get(thread.projectId) ?? ""}
                      </span>
                    )}
                    <span
                      className={cn(
                        "shrink-0 text-xs tabular-nums",
                        outcome.word !== null && !current ? outcome.tone : "text-muted-foreground",
                      )}
                    >
                      {current
                        ? "Open now"
                        : (outcome.word ??
                          (plainWords
                            ? formatShortTimestamp(thread.updatedAt, timestampFormat)
                            : formatRelativeTimeLabel(thread.updatedAt)))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
