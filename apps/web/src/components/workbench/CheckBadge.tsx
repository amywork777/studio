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

/** What a check of a part since changed says, in place of its verdict. */
export const OUT_OF_DATE = "Part changed since this check";

/**
 * One check of a part: its name and how it went, cut to the width it sits in, its whole name and
 * verdict on hover, and its result on a click. A check of a part since changed (`checkOutOfDate`)
 * is an outline, no status color: it no longer passes or fails anything, and its result is still a
 * click away. Under a line that already shows `OutOfDateIcon` and says why, `markedOutOfDate` makes
 * it plain quiet words.
 */
export function CheckBadge(props: {
  readonly result: CheckResult;
  readonly outOfDate?: boolean;
  readonly markedOutOfDate?: boolean;
  readonly onOpen: () => void;
}) {
  const { result, outOfDate = false, markedOutOfDate = false } = props;
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
        {markedOutOfDate ? (
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
