import { CheckBadge, OutOfDateIcon } from "../CheckBadge";
import type { CheckResult } from "../checkResults";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../ui/dialog";
import type { Figure } from "./studyFigures";

/** One part as compared: its picture, how it differs, and each check's last run, by check name. */
export interface CompareColumn {
  readonly id: string;
  readonly name: string;
  /** What a variant changes, from its script's first line; null for the part it copies. */
  readonly change: string | null;
  readonly picture: string | undefined;
  readonly checks: ReadonlyMap<
    string,
    {
      readonly result: CheckResult;
      readonly figures: ReadonlyArray<Figure>;
      readonly outOfDate: boolean;
    }
  >;
}

/**
 * A part and its variants side by side: each check they have been through in a row, so the one to
 * make can be picked by its results. A check one of them has not been through says "Not checked".
 */
export function CompareDialog(props: {
  readonly open: boolean;
  readonly columns: ReadonlyArray<CompareColumn>;
  readonly onOpenChange: (open: boolean) => void;
  readonly onOpenResult: (path: string) => void;
}) {
  const names = [...new Set(props.columns.flatMap((column) => [...column.checks.keys()]))];
  const first = props.columns[0];
  const grid = { gridTemplateColumns: `8rem repeat(${props.columns.length}, minmax(0, 1fr))` };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Compare {first?.name ?? ""} and its variants</DialogTitle>
          <DialogDescription>
            Each check as it last ran on each. Run a check on a variant from its block to fill a
            gap.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="grid gap-x-3 gap-y-2 text-xs" style={grid}>
            <span />
            {props.columns.map((column) => (
              <div key={column.id} className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-medium text-foreground">{column.name}</span>
                <span className="text-2xs text-muted-foreground">
                  {column.change === null ? "The part the variants copy" : column.change}
                </span>
                <div className="flex h-24 items-center justify-center overflow-hidden rounded-md bg-(--model-ground)">
                  {column.picture === undefined ? (
                    <span className="text-2xs text-muted-foreground">No picture yet</span>
                  ) : (
                    <img
                      src={column.picture}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                      draggable={false}
                    />
                  )}
                </div>
              </div>
            ))}
            {names.length === 0 ? (
              <p className="col-span-full text-muted-foreground">
                No checks yet. Add one after a part on the canvas to compare its results here.
              </p>
            ) : null}
            {names.map((name) => (
              <div key={name} className="contents">
                <span className="border-t border-border pt-2 text-muted-foreground">{name}</span>
                {props.columns.map((column) => {
                  const held = column.checks.get(name);
                  return (
                    <div
                      key={column.id}
                      className="flex min-w-0 flex-col gap-1 border-t border-border pt-2"
                    >
                      {held === undefined ? (
                        <span className="text-muted-foreground">Not checked</span>
                      ) : (
                        <>
                          <div className="min-w-0">
                            <CheckBadge
                              result={held.result}
                              outOfDate={held.outOfDate}
                              onOpen={() => props.onOpenResult(held.result.model)}
                            />
                          </div>
                          {held.outOfDate ? (
                            <span className="flex items-start gap-1 text-2xs text-muted-foreground">
                              <OutOfDateIcon aria-hidden className="mt-px size-3 shrink-0" />
                              Changed since this check.
                            </span>
                          ) : null}
                          <span className="text-foreground">{held.result.headline}</span>
                          {held.figures.length === 0 ? null : (
                            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-2xs">
                              {held.figures.map((item) => (
                                <div key={item.label} className="contents">
                                  <dt className="text-muted-foreground">{item.label}</dt>
                                  <dd className="min-w-0 text-foreground tabular-nums">
                                    {item.value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
