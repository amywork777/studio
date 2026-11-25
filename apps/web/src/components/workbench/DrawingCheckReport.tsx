import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import {
  ChevronDownIcon,
  CircleCheckIcon,
  CircleXIcon,
  DownloadIcon,
  FileTextIcon,
  InfoIcon,
  type LucideIcon,
  MinusCircleIcon,
  ShapesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useState } from "react";

import { pluginEnvironment } from "~/state/plugins";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { toastManager } from "../ui/toast";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { OUT_OF_DATE, OutOfDateIcon } from "./CheckBadge";
import {
  type DimensionStatus,
  type GradedDimension,
  type GradedDrawingCheck,
  countWords,
  drawingCheckHtml,
  drawingCheckMarkdown,
  formatValue,
  modelWords,
  otherUnits,
  placeWords,
  reportOrder,
  STATUS_WORDS,
  statusWords,
} from "./drawingCheck";
import { DrawingSheetCrop } from "./DrawingSheetCrop";
import { partLabel } from "./partNames";
import { readStudioImport } from "./studioImportBridge";
import { openInPanel } from "./useOpenInWorkbench";

/** Each status's badge and mark: red, amber and green only for failed, to confirm and passed (law 7). */
const STATUS_LOOK: Readonly<
  Record<
    DimensionStatus,
    { readonly variant: "error" | "warning" | "success" | "outline"; readonly Icon: LucideIcon }
  >
> = {
  out: { variant: "error", Icon: CircleXIcon },
  flag: { variant: "warning", Icon: TriangleAlertIcon },
  ok: { variant: "success", Icon: CircleCheckIcon },
  "not-checked": { variant: "outline", Icon: MinusCircleIcon },
  reference: { variant: "outline", Icon: InfoIcon },
  note: { variant: "outline", Icon: InfoIcon },
};

/** The filters, in the order an engineer works through them. */
const FILTERS: ReadonlyArray<{ readonly id: "all" | DimensionStatus; readonly word: string }> = [
  { id: "all", word: "All" },
  { id: "out", word: STATUS_WORDS.out },
  { id: "flag", word: STATUS_WORDS.flag },
  { id: "not-checked", word: STATUS_WORDS["not-checked"] },
  { id: "ok", word: STATUS_WORDS.ok },
];

const CROP_ASPECT = 16 / 9;

/** The drawing's value and the band it is held to, as an engineer writes it. */
function DrawingValue(props: { readonly row: GradedDimension }) {
  const { row } = props;
  const band = row.band;
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-sm text-foreground tabular-nums">{row.text ?? "Not dimensioned"}</span>
      {band === null ? null : (
        <span className="text-xs text-muted-foreground">
          {band.from === "as-printed"
            ? "as printed"
            : `${formatValue(band.low, row)} to ${formatValue(band.high, row)}`}
          {band.from === "general" ? ", title block" : ""}
        </span>
      )}
    </span>
  );
}

function ModelValue(props: { readonly row: GradedDimension }) {
  const { row } = props;
  const other = row.measured === null ? null : otherUnits(row.measured, row.units);
  return (
    <span className="flex min-w-0 flex-col">
      <span
        className={
          row.measured === null
            ? "text-sm text-muted-foreground"
            : "text-sm text-foreground tabular-nums"
        }
      >
        {modelWords(row)}
      </span>
      {other === null ? null : <span className="text-xs text-muted-foreground">{other}</span>}
    </span>
  );
}

function CountBadge(props: { readonly status: DimensionStatus; readonly count: number }) {
  const { variant, Icon } = STATUS_LOOK[props.status];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      {countWords(props.status, props.count)}
    </Badge>
  );
}

function StatusBadge(props: { readonly row: GradedDimension }) {
  const { variant, Icon } = STATUS_LOOK[props.row.status];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      {statusWords(props.row)}
    </Badge>
  );
}

/**
 * A drawing check (`drawingCheck.ts`) as a report: how it went in a line, then every dimension,
 * what needs the engineer first, each with its place on the drawing, the drawing's value and band,
 * what the model measures and how it came out. A row opens to show its place larger, the agent's
 * note and how it was measured. It exports as Markdown or PDF beside the check.
 */
export function DrawingCheckReport(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  /** The project's folder, which the check's paths are relative to. */
  readonly root: string;
  readonly relativePath: string;
  readonly check: GradedDrawingCheck;
}) {
  const { environmentId, threadRef, root, check, relativePath } = props;
  const [filter, setFilter] = useState<"all" | DimensionStatus>("all");
  const [open, setOpen] = useState<string | null>(null);
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;
  const writeFile = useAtomCommand(projectEnvironment.writeFile, { reportFailure: false });
  const checkedAt = useEnvironmentQuery(
    projectEnvironment.readFile({ environmentId, input: { cwd: root, relativePath } }),
  ).data?.modifiedAt;
  const partAt = useEnvironmentQuery(
    check.part === null
      ? null
      : projectEnvironment.readFile({
          environmentId,
          input: { cwd: root, relativePath: check.part, allowMissing: true },
        }),
  ).data?.modifiedAt;
  // The code is the model (law 3): its script changed since it was measured says so. Not its STEP,
  // which an agent exports from the same build after measuring it.
  const changed =
    checkedAt !== undefined &&
    partAt !== undefined &&
    Date.parse(partAt) > Date.parse(checkedAt) + 1_000;

  const name = (check.model ?? check.part ?? relativePath).split("/").at(-1) ?? relativePath;
  const title = `Drawing check of ${partLabel(name)}`;
  const rows = reportOrder(check.dimensions);
  const shown = filter === "all" ? rows : rows.filter((row) => row.status === filter);
  const sourceOf = (row: GradedDimension) =>
    check.sources.find((source) => source.id === row.where?.source) ?? check.sources[0];
  const drawing = check.sources.find((source) => source.file !== null)?.file ?? null;
  const beside = relativePath.replace(/\.json$/i, "");

  const exportMarkdown = async () => {
    const file = `${beside}.md`;
    const written = await writeFile({
      environmentId,
      input: { cwd: root, relativePath: file, contents: drawingCheckMarkdown(check, title) },
    });
    if (written._tag === "Failure") {
      const failure = squashAtomCommandFailure(written);
      toastManager.add({
        type: "error",
        title: "Could not export the report",
        description: failure instanceof Error ? failure.message : undefined,
      });
      return;
    }
    toastManager.add({
      type: "success",
      title: "Exported the report as Markdown",
      description: file,
      actionProps: { children: "Open", onClick: () => openInPanel(plugins, threadRef, file) },
    });
  };
  const savePdf = readStudioImport()?.savePdf;
  const exportPdf =
    savePdf === undefined
      ? null
      : async () => {
          const file = `${beside}.pdf`;
          try {
            await savePdf(drawingCheckHtml(check, title), `${root.replace(/[\\/]+$/, "")}/${file}`);
            toastManager.add({
              type: "success",
              title: "Exported the report as PDF",
              description: file,
              actionProps: {
                children: "Open",
                onClick: () => openInPanel(plugins, threadRef, file),
              },
            });
          } catch (error) {
            toastManager.add({
              type: "error",
              title: "Could not export the report",
              description: error instanceof Error ? error.message : undefined,
            });
          }
        };

  return (
    <section aria-label="Drawing check" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["out", "flag", "ok", "not-checked", "reference", "note"] as const).map((status) =>
            check.counts[status] === 0 && status !== "ok" ? null : (
              <CountBadge key={status} status={status} count={check.counts[status]} />
            ),
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {check.measuredBy === null
            ? "Nothing on the model has been measured yet."
            : `Measured on the built model by ${check.measuredBy}.`}{" "}
          Drawing in{" "}
          {check.units === "in" ? "inches" : check.units === "mm" ? "millimetres" : "degrees"}.
        </p>
        {changed ? (
          <p className="flex items-center gap-1.5 text-sm text-foreground">
            <OutOfDateIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            {OUT_OF_DATE}: ask the agent to run its drawing check again.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          {check.model === null && check.part === null ? null : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => openInPanel(plugins, threadRef, check.model ?? check.part ?? "")}
            >
              <ShapesIcon />
              Show the part
            </Button>
          )}
          {drawing === null ? null : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => openInPanel(plugins, threadRef, drawing)}
            >
              <FileTextIcon />
              Open the drawing
            </Button>
          )}
          <Menu>
            <MenuTrigger render={<Button size="sm" variant="outline" />}>
              <DownloadIcon />
              Export
              <ChevronDownIcon />
            </MenuTrigger>
            <MenuPopup align="start" side="bottom" sideOffset={6}>
              <MenuItem onClick={() => void exportMarkdown()}>Markdown, beside the check</MenuItem>
              {exportPdf === null ? null : (
                <MenuItem onClick={() => void exportPdf()}>PDF, beside the check</MenuItem>
              )}
            </MenuPopup>
          </Menu>
        </div>
      </div>

      <ToggleGroup
        aria-label="Show"
        value={[filter]}
        onValueChange={(value) => {
          const next = FILTERS.find((entry) => entry.id === value[0]);
          if (next !== undefined) setFilter(next.id);
        }}
      >
        {FILTERS.filter((entry) => entry.id === "all" || check.counts[entry.id] > 0).map(
          (entry) => (
            <Toggle key={entry.id} value={entry.id}>
              {entry.word}
              {entry.id === "all" ? "" : ` ${check.counts[entry.id]}`}
            </Toggle>
          ),
        )}
      </ToggleGroup>

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {shown.map((row) => {
          const source = sourceOf(row);
          const expanded = open === row.id;
          const place = placeWords(check, row);
          return (
            <li key={row.id} className="flex flex-col">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : row.id)}
                className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3 p-2.5 text-left hover:bg-accent/40 sm:grid-cols-[8rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
              >
                {row.where !== null && source?.file != null ? (
                  <DrawingSheetCrop
                    environmentId={environmentId}
                    threadRef={threadRef}
                    root={root}
                    file={source.file}
                    place={row.where}
                    aspect={CROP_ASPECT}
                  />
                ) : (
                  <span
                    className="flex items-center justify-center rounded-md border border-dashed border-border p-1 text-center text-xs text-muted-foreground"
                    style={{ aspectRatio: String(CROP_ASPECT) }}
                  >
                    {row.where === null ? "Not on the drawing" : "No drawing file"}
                  </span>
                )}
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{row.feature}</span>
                  <span className="truncate text-xs text-muted-foreground">{place}</span>
                  <span className="flex flex-wrap gap-x-4 gap-y-1 pt-1 sm:hidden">
                    <DrawingValue row={row} />
                    <ModelValue row={row} />
                  </span>
                  <span className="pt-1 sm:hidden">
                    <StatusBadge row={row} />
                  </span>
                </span>
                <span className="hidden sm:flex">
                  <DrawingValue row={row} />
                </span>
                <span className="hidden sm:flex">
                  <ModelValue row={row} />
                </span>
                <span className="hidden justify-end sm:flex">
                  <StatusBadge row={row} />
                </span>
              </button>
              {expanded ? (
                <div className="flex flex-col gap-3 border-t border-border bg-muted/30 p-3">
                  {row.where !== null && source?.file != null ? (
                    <DrawingSheetCrop
                      environmentId={environmentId}
                      threadRef={threadRef}
                      root={root}
                      file={source.file}
                      place={row.where}
                      aspect={2.4}
                      className="w-full"
                    />
                  ) : null}
                  {row.note === null ? null : <p className="text-sm text-foreground">{row.note}</p>}
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                    {row.measuredHow === null ? null : (
                      <>
                        <dt className="text-muted-foreground">Measured</dt>
                        <dd className="text-foreground">{row.measuredHow}</dd>
                      </>
                    )}
                    {row.confidence === "high" ? null : (
                      <>
                        <dt className="text-muted-foreground">Read</dt>
                        <dd className="text-foreground">
                          {row.confidence === "low" ? "hard to read" : "fairly sure"}
                        </dd>
                      </>
                    )}
                    {row.related.length === 0 ? null : (
                      <>
                        <dt className="text-muted-foreground">Read against</dt>
                        <dd className="text-foreground">
                          {row.related
                            .map(
                              (id) =>
                                check.dimensions.find((other) => other.id === id)?.feature ?? id,
                            )
                            .join(", ")}
                        </dd>
                      </>
                    )}
                    {row.featureRef === null ? null : (
                      <>
                        <dt className="text-muted-foreground">On the model</dt>
                        <dd className="text-foreground">
                          <code className="text-xs">{row.featureRef}</code>
                        </dd>
                      </>
                    )}
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    {source?.file == null ? null : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openInPanel(plugins, threadRef, source.file ?? "")}
                      >
                        <FileTextIcon />
                        Open the drawing
                        {row.where === null ? "" : `, page ${row.where.page}`}
                      </Button>
                    )}
                    {check.model === null && check.part === null ? null : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          openInPanel(plugins, threadRef, check.model ?? check.part ?? "")
                        }
                      >
                        <ShapesIcon />
                        Show the part
                      </Button>
                    )}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
