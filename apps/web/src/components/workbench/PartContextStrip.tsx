import type { ScopedThreadRef } from "@t3tools/contracts";

import { BoxIcon } from "lucide-react";

import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { PartContext } from "./partContext";
import { buildLabel, materialLabel } from "./partLabels";
import { useEngineeringInterface, useEngineeringSurfaces } from "./studioInterface";
import { usePartContext } from "./usePartContext";
import { WORKBENCH_LAYOUT } from "./workbenchLayout";

/** The facts after the name: kind, units, material, last build. */
export function partFacts(part: PartContext) {
  const facts: Array<{
    readonly id: "kind" | "units" | "material" | "build";
    readonly text: string;
    readonly tone: "muted" | "faint" | "error";
  }> = [{ id: "kind", text: part.kind, tone: "muted" }];
  if (part.units !== null) facts.push({ id: "units", text: part.units, tone: "muted" });
  // Unread yet: said nothing about, rather than "No material".
  const material = materialLabel(part.materials);
  if (material !== null) {
    facts.push({ id: "material", text: material.text, tone: material.missing ? "faint" : "muted" });
  }
  const build = buildLabel(part.build);
  if (build !== null) {
    facts.push({ id: "build", text: build.text, tone: build.failed ? "error" : "muted" });
  }
  return facts;
}

/**
 * The part the viewer shows, kept above the composer so "this bracket" always names something. It
 * stays while the viewer is out of sight behind another tab or a hidden panel, and goes when the
 * viewer's tab closes. Workbench layout only; `threadRef` is null for a draft.
 */
export function PartContextStrip(props: { readonly threadRef: ScopedThreadRef | null }) {
  // The engineering interface names the part in its top bar; its jobs are in the Toolbox.
  const engineering = useEngineeringInterface();
  if (!WORKBENCH_LAYOUT || props.threadRef === null || engineering) return null;
  return <ThreadPartContext threadRef={props.threadRef} />;
}

function ThreadPartContext(props: { readonly threadRef: ScopedThreadRef }) {
  const { threadRef } = props;
  const shown = usePartContext(threadRef);
  const panel = useRightPanelStore((state) =>
    selectThreadRightPanelState(state.byThreadKey, threadRef),
  );
  // The viewer's tab, open or hidden: the active one when it is the viewer's plugin.
  const views =
    shown === null
      ? []
      : panel.surfaces.filter(
          (surface) => surface.kind === "plugin-app" && surface.pluginId === shown.pluginId,
        );
  const view = views.find((surface) => surface.id === panel.activeSurfaceId) ?? views[0] ?? null;
  const engineering = useEngineeringSurfaces();
  const plainWords = useEngineeringInterface();
  // Re-reads "Built 3m ago" each minute.
  useNowMinute();
  // A viewer the user closed takes its context with it. With the engineering surfaces on, the title block
  // over the viewer says all of this while the viewer is on screen.
  if (shown === null || view === null) return null;
  if (engineering && panel.isOpen && panel.activeSurfaceId === view.id) return null;
  const { part } = shown;
  const facts = partFacts(part);
  const failure = part.build?.state === "failed" ? part.build.error : null;

  return (
    <div className="mb-1 flex min-w-0 items-center gap-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              data-part-context=""
              aria-label={`Show ${part.name} in the viewer`}
              onClick={() => useRightPanelStore.getState().activateSurface(threadRef, view.id)}
              className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-xs text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <BoxIcon className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 shrink truncate font-medium text-foreground">
                {part.name}
              </span>
              <span className="flex min-w-0 shrink-[2] items-center gap-1.5 truncate">
                {facts.map((fact, index) => (
                  <span key={fact.id} className="flex min-w-0 items-center gap-1.5">
                    {index > 0 ? (
                      <span aria-hidden="true" className="text-muted-foreground/50">
                        ·
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "truncate",
                        fact.tone === "faint" && "text-muted-foreground/60",
                        fact.tone === "error" && "text-destructive",
                      )}
                    >
                      {fact.text}
                    </span>
                  </span>
                ))}
              </span>
            </button>
          }
        />
        <TooltipPopup side="top" className="max-w-96">
          <span className="block break-all">
            {plainWords ? `Show ${part.name} in the viewer` : part.path}
          </span>
          {failure === null ? null : <span className="mt-1 block text-destructive">{failure}</span>}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}
