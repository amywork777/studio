import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { type ReactNode, useMemo } from "react";

import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { CheckBadge } from "./CheckBadge";
import { checkOutOfDate } from "./checkResults";
import { shownChecks } from "./partChecks";
import { buildLabel, materialLabel } from "./partLabels";
import { partLabel } from "./partNames";
import { useEngineeringInterface, useEngineeringSurfaces } from "./studioInterface";
import { useOpenInWorkbench } from "./useOpenInWorkbench";
import { usePartContext } from "./usePartContext";
import { useProjectChecks } from "./useProjectChecks";
import { useStudioProjectAt } from "./useStudioProjects";

/** A title block value's tone: a fact, one missing, or a failure. */
export const TITLE_TONE = {
  default: "text-foreground",
  faint: "text-muted-foreground/70",
  error: "text-destructive",
} as const;

/** A label over its value, as a title block reads. */
export function TitleCell(props: {
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly tone?: "default" | "faint" | "error";
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col justify-center gap-0.5 border-r border-border px-3",
        props.className,
      )}
    >
      <dt className="text-xs leading-none text-muted-foreground">{props.label}</dt>
      <dd
        className={cn(
          "truncate text-xs leading-tight tabular-nums",
          TITLE_TONE[props.tone ?? "default"],
        )}
      >
        {props.children}
      </dd>
    </div>
  );
}

interface TitleBlockProps {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly pluginId: string;
  /** The thread's folder: the checks of the part on screen are read from its project's folders. */
  readonly cwd?: string | undefined;
  /** The thread's latest file changes: a check its agent just ran shows. */
  readonly mutationId?: string | null | undefined;
}

/**
 * The drawing's title block, over the viewer: the part on screen, its type,
 * units, material, last build and checks (each opening its result; a result
 * on screen leads back to its part), read the way a shop drawing reads. In the
 * engineering surfaces only (`useEngineeringSurfaces`), and only while the viewer shows a part of this plugin.
 */
export function TitleBlock(props: TitleBlockProps) {
  const surfaces = useEngineeringSurfaces();
  // The engineering interface keeps the view clear: the part's jobs are in the Toolbox
  // (`StudioToolbox`), and its facts are not repeated over the model.
  const engineering = useEngineeringInterface();
  if (!surfaces || engineering) return null;
  return <ThreadTitleBlock {...props} />;
}

function ThreadTitleBlock(props: TitleBlockProps) {
  const shown = usePartContext(
    { environmentId: props.environmentId, threadId: props.threadId },
    props.cwd ?? null,
  );
  useNowMinute();
  const studio = useStudioProjectAt(props.environmentId, props.cwd ?? null);
  const folders = useMemo(
    () => studio?.project.folders ?? (props.cwd === undefined ? [] : [props.cwd]),
    [studio, props.cwd],
  );
  const checks = useProjectChecks({
    environmentId: props.environmentId,
    folders,
    mutationId: props.mutationId ?? null,
  });
  const threadRef = useMemo(
    () => scopeThreadRef(props.environmentId, props.threadId),
    [props.environmentId, props.threadId],
  );
  const open = useOpenInWorkbench(threadRef);
  if (shown === null || shown.pluginId !== props.pluginId) return null;
  const { part } = shown;
  const material = materialLabel(part.materials);
  const build = buildLabel(part.build);
  // Its checks, a click from their results; a result on screen leads back to the part it checked.
  const about = shownChecks(checks, part.path);
  const model = part.kind === "Part" || part.kind === "Assembly";

  return (
    <div
      data-title-block=""
      className="@container/title-block flex h-11 shrink-0 items-stretch border-b border-border bg-background"
    >
      <dl className="flex min-w-0 flex-1 items-stretch">
        <TitleCell label="Part" className="max-w-2/5 shrink">
          <span className="font-medium">{part.name}</span>
        </TitleCell>
        <TitleCell label="Type" className="hidden shrink-0 @md/title-block:flex">
          {part.kind}
        </TitleCell>
        {part.units === null ? null : (
          <TitleCell label="Units" className="hidden shrink-0 @md/title-block:flex">
            {part.units}
          </TitleCell>
        )}
        {material === null ? null : (
          <TitleCell
            label="Material"
            className="hidden min-w-0 shrink @lg/title-block:flex"
            tone={material.missing ? "faint" : "default"}
          >
            {material.text}
          </TitleCell>
        )}
        {build === null ? null : (
          <TitleCell label="Build" className="shrink-0" tone={build.failed ? "error" : "default"}>
            {build.text}
          </TitleCell>
        )}
        {about.results.length > 0 ? (
          <TitleCell label="Checks" className="min-w-0 shrink">
            <span className="flex min-w-0 gap-1 overflow-hidden">
              {about.results.map(({ root, result }) => (
                <CheckBadge
                  key={`${root}/${result.path}`}
                  result={result}
                  outOfDate={
                    part.build?.state === "built" &&
                    checkOutOfDate(result, { version: String(part.build.at / 1000) })
                  }
                  onOpen={() => open(`${root.replace(/[\\/]+$/, "")}/${result.model}`)}
                />
              ))}
            </span>
          </TitleCell>
        ) : model ? (
          <TitleCell label="Checks" className="hidden shrink-0 @md/title-block:flex" tone="faint">
            Not checked yet
          </TitleCell>
        ) : null}
        {about.of === null ? null : (
          <TitleCell label="Checked part" className="min-w-0 shrink">
            <button
              type="button"
              onClick={() => open(about.of!)}
              className="truncate rounded-sm font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              {partLabel(about.of)}
            </button>
          </TitleCell>
        )}
      </dl>
    </div>
  );
}
