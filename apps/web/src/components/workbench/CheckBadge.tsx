import {
  CircleCheckIcon,
  CircleXIcon,
  HistoryIcon,
  type LucideIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Badge } from "../ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { CheckResult, CheckStatus } from "./checkResults";

/** How a check went, as its badge and the words around it say it. */
export const CHECK_STATUS: Record<
  CheckStatus,
  {
    readonly variant: "error" | "warning" | "success";
    /** How one check went: "Casting fails". */
    readonly word: string;
    /** How a part's checks went: "a check fails". */
    readonly caption: string;
    readonly Icon: LucideIcon;
  }
> = {
  fix: { variant: "error", word: "fails", caption: "a check fails", Icon: CircleXIcon },
  warnings: {
    variant: "warning",
    word: "passes with warnings",
    caption: "checks pass with warnings",
    Icon: TriangleAlertIcon,
  },
  ready: { variant: "success", word: "passes", caption: "checks pass", Icon: CircleCheckIcon },
};

/** How a check of a part since changed is marked, wherever it is said. */
export const OutOfDateIcon = HistoryIcon;

/** A check's line's icon, in its status color. */
const ROW_TONE = {
  error: "text-destructive",
  warning: "text-warning",
  success: "text-success",
} as const;

/** What a check of a part since changed says, in place of its verdict. */
export const OUT_OF_DATE = "Part changed since this check";

/**
 * One check of a part, cut to its width, with the full name and verdict on hover. An out-of-date
 * check (`checkOutOfDate`) is an outline with no status color, since it no longer passes or fails
 * anything. `markedOutOfDate` makes it plain quiet words under a line that already says why.
 */
export function CheckBadge(props: {
  readonly result: CheckResult;
  readonly outOfDate?: boolean;
  readonly markedOutOfDate?: boolean;
  /** As a line: its name, how it went and its numbers ("Strength under load · passes · safety factor 2.4"). */
  readonly row?: boolean;
  readonly onOpen: () => void;
}) {
  const { result, outOfDate = false, markedOutOfDate = false, row = false } = props;
  const { variant, word, Icon } = CHECK_STATUS[result.status];
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={props.onOpen}
            aria-label={
              outOfDate
                ? `${result.check}: ${OUT_OF_DATE}. Show the result`
                : `${result.check} ${word}: ${result.headline}. Show the result`
            }
            className="max-w-full rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          />
        }
      >
        {row && !outOfDate ? (
          <span className="flex min-w-0 items-center gap-1.5 text-xs">
            <Icon aria-hidden="true" className={`size-3.5 shrink-0 ${ROW_TONE[variant]}`} />
            {/* A long study's name gives way before its verdict does: "passes" always shows. */}
            <span className="min-w-0 truncate text-foreground">{result.check}</span>
            <span className="shrink-0 text-muted-foreground">· {word}</span>
            {result.headline === "" ? null : (
              <span className="min-w-0 truncate text-muted-foreground tabular-nums">
                · {result.headline}
              </span>
            )}
          </span>
        ) : markedOutOfDate ? (
          <span className="text-xs text-muted-foreground hover:text-foreground">
            {result.check}
          </span>
        ) : outOfDate ? (
          <Badge variant="outline" className="max-w-full min-w-0">
            <OutOfDateIcon aria-hidden="true" />
            <span className="min-w-0 truncate">{result.check}</span>
          </Badge>
        ) : (
          <Badge variant={variant} className="max-w-full min-w-0">
            <Icon aria-hidden="true" />
            <span className="min-w-0 truncate">{result.check}</span>
          </Badge>
        )}
      </TooltipTrigger>
      <TooltipPopup side="top" className="max-w-80">
        <div className="flex flex-col gap-0.5">
          <span className="text-foreground">{result.check}</span>
          <span className="text-muted-foreground">{outOfDate ? OUT_OF_DATE : result.headline}</span>
        </div>
      </TooltipPopup>
    </Tooltip>
  );
}
