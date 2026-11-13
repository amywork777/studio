import type { EnvironmentId } from "@t3tools/contracts";
import { BoxIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "~/lib/utils";
import { MODULE_HEADING, SECTION_STACK } from "./studioLayout";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { parseCheckResult, type CheckResult } from "./checkResults";
import { usePictures } from "./usePictures";
import { type CadPost, useComparison } from "./useVersions";
import {
  checkChanges,
  extentLine,
  scriptRows,
  sizeChanges,
  sizeLine,
  volumeLine,
  type Comparison,
} from "./versions";

export interface VersionChoice {
  readonly id: string;
  /** "Version 3", "Now". */
  readonly label: string;
  /** When, and from which chat: "5 min ago, Strength check". */
  readonly detail: string;
}

/** The checks at one version, read from the result files as that version had them. */
function checksAt(comparison: Comparison, side: "older" | "newer"): CheckResult[] {
  return Object.entries(comparison.texts ?? {}).flatMap(([path, text]) => {
    const contents = text[side];
    const result = contents === null ? null : parseCheckResult(path, contents);
    return result === null ? [] : [result];
  });
}

function Picture(props: {
  readonly src: string | undefined;
  readonly alt: string;
  readonly caption?: string;
}) {
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-border bg-(--model-ground)">
        {props.src ? (
          <img src={props.src} alt={props.alt} className="size-full object-contain" />
        ) : (
          <BoxIcon className="size-8 text-muted-foreground/50" aria-hidden="true" />
        )}
      </div>
      {props.caption === undefined ? null : (
        <figcaption className="text-center text-xs text-muted-foreground">
          {props.caption}
        </figcaption>
      )}
    </figure>
  );
}

function Facts(props: { readonly title: string; readonly lines: ReadonlyArray<string> }) {
  return (
    <section className={SECTION_STACK} aria-label={props.title}>
      <h4 className={MODULE_HEADING}>{props.title}</h4>
      <ul className="flex flex-col gap-1 text-xs text-foreground tabular-nums">
        {props.lines.map((line) => (
          <li key={line} className="break-words">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * What changed in a part between two of its versions, as Fixture's What changed shows it: the
 * part as one model (unchanged see-through grey, added material blue, removed magenta) or the two
 * side by side, the named sizes of its script that changed, its volume and size, how its checks
 * went at each, and the script's own lines on request. The solids are compared by the CAD service
 * (`cadgen/edit/solid_diff.py`), a model's as each version builds it; Open in 3D shows the
 * comparison, or the newer version, in the viewer.
 */
export function WhatChanged(props: {
  readonly environmentId: EnvironmentId;
  readonly post: CadPost | null;
  /** The part's folder, as the Overview names it, and the compared file in it. */
  readonly folder: string;
  readonly path: string;
  /** The model `path` builds, when it is a model's script. */
  readonly model: string | null;
  readonly older: VersionChoice | null;
  readonly newer: VersionChoice;
  /** The versions before the newer one, to compare it with another. */
  readonly olderChoices: ReadonlyArray<VersionChoice>;
  readonly onOlder: (id: string) => void;
  /** How the project's sizes are written: "mm" or "in". */
  readonly units: string;
  /** The part's check results, read at both versions. */
  readonly checkPaths: ReadonlyArray<string>;
  /** Opens a file of the part's folder in the viewer. */
  readonly onOpen: (path: string) => void;
}) {
  const [view, setView] = useState<"one" | "two">("one");
  const [script, setScript] = useState(false);
  const { state, retry } = useComparison({
    post: props.post,
    folder: props.folder,
    path: props.path,
    older: props.older?.id ?? null,
    newer: props.newer.id,
    model: props.model,
    texts: props.checkPaths,
  });
  const comparison = state?.comparison ?? null;
  const shape = comparison?.shape ?? null;
  const diff = comparison?.files.diff ?? null;
  const paths =
    comparison === null
      ? []
      : [comparison.files.older, comparison.files.newer, ...(diff ? [diff] : [])];
  // What Open in 3D shows: the comparison, else the newer version's solid. A script's own copy has
  // none, so a model's script offers it once both versions are built.
  const solid =
    diff ??
    (comparison === null || /\.py$/i.test(comparison.files.newer) ? null : comparison.files.newer);
  const pictures = usePictures({ environmentId: props.environmentId, cwd: props.folder, paths });
  const sizes = useMemo(() => {
    const changes = sizeChanges(
      comparison?.script?.olderSizes ?? null,
      comparison?.script?.newerSizes ?? null,
      comparison?.script,
    );
    return changes === null ? null : changes.map((change) => sizeLine(change, props.units));
  }, [comparison, props.units]);
  const checks = useMemo(
    () =>
      comparison === null
        ? []
        : checkChanges(checksAt(comparison, "older"), checksAt(comparison, "newer")).map(
            ({ check, line }) => `${check}: ${line}`,
          ),
    [comparison],
  );
  const shapeLines =
    shape === null ? [] : [volumeLine(shape), extentLine(shape)].filter((line) => line !== null);
  if (shape?.status === "done" && shape.older.bodies !== shape.newer.bodies) {
    shapeLines.push(`${shape.newer.bodies} bodies, was ${shape.older.bodies}`);
  }

  if (props.older === null) {
    return (
      <p className="text-xs text-muted-foreground">
        The first version: there is nothing before it to compare with.
      </p>
    );
  }
  const note =
    state?.error !== null && state?.error !== undefined
      ? state.error
      : shape === null || shape.status === "working"
        ? "Working out what changed."
        : shape.status === "failed"
          ? "The solids couldn't be compared, so here are the two side by side."
          : shape.status === "unsupported"
            ? "This kind of file has no solids to compare: here are the two side by side."
            : shape.same
              ? "The shape is the same."
              : shape.moved
                ? "The part only moved."
                : null;
  const sideBySide = view === "two" || diff === null;

  return (
    <div className="flex min-w-0 flex-col gap-3" aria-label="What changed">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">What changed</span>
        <Select
          value={props.older.id}
          onValueChange={(value) => value !== null && props.onOlder(value)}
        >
          <SelectTrigger size="sm" variant="ghost" aria-label="Version to compare with">
            <SelectValue>{props.older.label}</SelectValue>
          </SelectTrigger>
          <SelectPopup alignItemWithTrigger={false}>
            {props.olderChoices.map((choice) => (
              <SelectItem key={choice.id} hideIndicator value={choice.id}>
                {choice.label}, {choice.detail}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <span className="text-sm text-muted-foreground">to {props.newer.label}</span>
        <span className="flex-1" />
        {diff === null ? null : (
          <ToggleGroup
            aria-label="How to show the two versions"
            value={[view]}
            onValueChange={(next) => {
              const value = next[0];
              if (value === "one" || value === "two") setView(value);
            }}
          >
            <Toggle value="one">One model</Toggle>
            <Toggle value="two">Side by side</Toggle>
          </ToggleGroup>
        )}
        {comparison?.script ? (
          <Button
            variant={script ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={script}
            onClick={() => setScript((on) => !on)}
          >
            Script
          </Button>
        ) : null}
        {solid === null ? null : (
          <Button variant="outline" size="sm" onClick={() => props.onOpen(solid)}>
            Open in 3D
          </Button>
        )}
      </div>

      <div className="grid min-w-0 items-start gap-3 @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          {comparison === null ? (
            <Picture src={undefined} alt="" />
          ) : sideBySide ? (
            <div className="grid grid-cols-2 gap-2">
              <Picture
                src={pictures.get(comparison.files.older)}
                alt={props.older.label}
                caption={props.older.label}
              />
              <Picture
                src={pictures.get(comparison.files.newer)}
                alt={props.newer.label}
                caption={props.newer.label}
              />
            </div>
          ) : (
            <Picture
              src={pictures.get(diff)}
              alt={`${props.older.label} and ${props.newer.label} as one model`}
            />
          )}
          {diff !== null && !sideBySide ? (
            <p
              className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
              aria-hidden="true"
            >
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-sm bg-(--diff-added)" />
                Added
              </span>
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-sm bg-(--diff-removed)" />
                Removed
              </span>
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-sm bg-muted-foreground/40" />
                Unchanged
              </span>
            </p>
          ) : null}
          {note === null ? null : (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {note}
              {shape?.status === "failed" || (state?.error ?? null) !== null ? (
                <Button variant="ghost" size="sm" onClick={retry}>
                  Try again
                </Button>
              ) : null}
            </p>
          )}
        </div>
        <div className={SECTION_STACK}>
          {sizes === null ? null : (
            <Facts
              title="Dimensions that changed"
              lines={sizes.length === 0 ? ["No named size changed."] : sizes}
            />
          )}
          {shapeLines.length === 0 ? null : <Facts title="Volume and size" lines={shapeLines} />}
          {checks.length === 0 ? null : <Facts title="Checks" lines={checks} />}
        </div>
      </div>

      {script && comparison?.script ? (
        <pre
          aria-label="The part script's changed lines"
          className="max-h-72 overflow-auto rounded-lg border border-border bg-muted/30 py-2 font-mono text-xs leading-relaxed"
        >
          {scriptRows(comparison.script.older ?? "", comparison.script.newer ?? "").map((row) =>
            row.kind === "folded" ? (
              <div key={row.key} className="px-3 text-muted-foreground">
                {row.count} unchanged {row.count === 1 ? "line" : "lines"}
              </div>
            ) : (
              <div
                key={row.key}
                className={cn(
                  "px-3 whitespace-pre-wrap break-all",
                  row.kind === "added" && "bg-(--diff-added)/10 text-(--diff-added)",
                  row.kind === "removed" && "bg-(--diff-removed)/10 text-(--diff-removed)",
                )}
              >
                <span aria-hidden="true">
                  {row.kind === "added" ? "+ " : row.kind === "removed" ? "- " : "  "}
                </span>
                <span className="sr-only">
                  {row.kind === "added" ? "Added: " : row.kind === "removed" ? "Removed: " : ""}
                </span>
                {row.text}
              </div>
            ),
          )}
        </pre>
      ) : null}
    </div>
  );
}
