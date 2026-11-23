import type { EnvironmentId } from "@t3tools/contracts";
import { ChevronDown } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useState } from "react";

import { observeResize } from "~/lib/observeResize";
import type { RightPanelSurface } from "~/rightPanelStore";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { surfaceFile } from "./sameFile";
import { isEngineeringInterface } from "./studioInterface";
import { hiddenTabs, PREVIEWABLE } from "./tabOverflow";
import { usePictures } from "./usePictures";

/** A tab's file as a picture, inside its hover card: drawn only while the card is open. */
function TabPicture(props: { readonly environmentId: EnvironmentId; readonly file: string }) {
  const folder = useOpenWorkspaceStore((state) => state.workspace?.folder ?? "");
  const pictures = usePictures({
    environmentId: props.environmentId,
    cwd: folder,
    paths: folder === "" ? [] : [props.file],
  });
  const url = pictures.get(props.file);
  return url === undefined ? null : (
    <img
      src={url}
      alt=""
      className="mb-1.5 aspect-[4/3] w-40 rounded-sm bg-background object-contain"
    />
  );
}

/**
 * Studio: a tab's hover card, its whole name and, for a model, a picture of it, where T3's tab
 * shows its title alone.
 */
export function TabHoverCard(props: {
  readonly surface: RightPanelSurface;
  readonly environmentId: EnvironmentId | null;
  readonly children: ReactNode;
}) {
  const file = isEngineeringInterface() ? surfaceFile(props.surface) : null;
  return (
    <span className="flex flex-col">
      {file !== null && props.environmentId !== null && PREVIEWABLE.test(file) ? (
        <TabPicture environmentId={props.environmentId} file={file} />
      ) : null}
      <span>{props.children}</span>
    </span>
  );
}

/**
 * Studio: "N more", at the tab strip's end while it scrolls, listing the tabs out of sight (cut
 * by an edge too) to bring one to the front. Counted again as the strip scrolls or resizes.
 */
export function TabOverflowMenu(props: {
  readonly list: RefObject<HTMLElement | null>;
  readonly surfaces: ReadonlyArray<RightPanelSurface>;
  readonly titleOf: (surface: RightPanelSurface) => string;
  readonly onActivate: (surface: RightPanelSurface) => void;
}) {
  const { list, surfaces } = props;
  const [hidden, setHidden] = useState<ReadonlyArray<string>>([]);
  const ids = surfaces.map((surface) => surface.id).join("\n");
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- measures which tabs the scrolled strip hides, on scroll and resize
  useEffect(() => {
    const root = list.current;
    const viewport = root?.querySelector<HTMLElement>("[data-slot='scroll-area-viewport']") ?? root;
    // Measured again whenever the tabs change.
    if (!root || !viewport || ids === "") return;
    const measure = () => {
      const view = viewport.getBoundingClientRect();
      const tabs = [...root.querySelectorAll<HTMLElement>("[data-tab-surface]")].map((tab) => {
        const box = tab.getBoundingClientRect();
        return { id: tab.dataset.tabSurface ?? "", left: box.left, right: box.right };
      });
      const next = hiddenTabs(tabs, view);
      setHidden((current) => (current.join("\n") === next.join("\n") ? current : next));
    };
    measure();
    viewport.addEventListener("scroll", measure, { passive: true });
    const stopResize = observeResize(viewport, measure);
    return () => {
      viewport.removeEventListener("scroll", measure);
      stopResize();
    };
  }, [list, ids]);
  const out = surfaces.filter((surface) => hidden.includes(surface.id));
  if (out.length === 0) return null;
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="xs"
            variant="ghost-muted"
            className="shrink-0"
            aria-label={`${out.length} more tabs`}
            data-tab-overflow=""
          />
        }
      >
        {out.length} more
        <ChevronDown className="size-3" aria-hidden="true" />
      </MenuTrigger>
      <MenuPopup align="end" side="bottom" sideOffset={6}>
        {out.map((surface) => (
          <MenuItem key={surface.id} onClick={() => props.onActivate(surface)}>
            {props.titleOf(surface)}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}
