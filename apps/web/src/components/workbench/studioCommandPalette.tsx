import type { useNavigate } from "@tanstack/react-router";
import type { useGT } from "gt-react";
import { LayoutGridIcon, PuzzleIcon } from "lucide-react";
import type { ComponentType } from "react";

import { hasCloudPublicConfig } from "../../cloud/publicConfig";
import { t3FeatureHidden } from "./hiddenT3Features";
import {
  ITEM_ICON_CLASS,
  type CommandPaletteActionItem,
  type CommandPaletteSubmenuItem,
} from "../CommandPalette.logic";
import { StudioQuickFind } from "./StudioQuickFind";
import { hasEngineeringSurfaces, isEngineeringInterface } from "./studioInterface";
import { withoutTrashedFolders } from "./trash/trash";
import { useTrashHiddenFolderKeys } from "./trash/useTrash";

// Studio's side of T3's command palette (`CommandPalette.tsx`), which calls these in one line where
// it opens its dialog, lists projects and threads, and gathers its actions.

/** T3's palette, or in Studio's engineering interface the quick find for projects, parts and jobs. */
export function StudioPaletteDialog<
  Props extends {
    readonly openIntent: { readonly kind: string; readonly query?: string } | null;
    readonly setOpen: (open: boolean) => void;
  },
>({ dialog: Dialog, ...props }: Props & { readonly dialog: ComponentType<Props> }) {
  if (isEngineeringInterface()) {
    const intent = props.openIntent;
    return (
      <StudioQuickFind
        query={intent?.kind === "search" ? (intent.query ?? "") : ""}
        setOpen={props.setOpen}
      />
    );
  }
  // `props` is everything but `dialog`, which Props never has.
  return <Dialog {...(props as unknown as Props)} />;
}

/** Folders only projects in Trash hold, with their threads, stay out of the palette. */
export function usePaletteScope<
  P extends { readonly id: string; readonly environmentId: string; readonly workspaceRoot: string },
  T extends { readonly environmentId: string; readonly projectId: string },
>(projects: ReadonlyArray<P>, threads: ReadonlyArray<T>, environmentId: string | null) {
  const trashHiddenFolders = useTrashHiddenFolderKeys();
  return withoutTrashedFolders(projects, threads, trashHiddenFolders, environmentId);
}

type PaletteItem = CommandPaletteActionItem | CommandPaletteSubmenuItem;

/**
 * Studio's actions among T3's: Open plugins, and Open projects on the engineering surfaces. T3's
 * Issues and Triage are T3's own products, which Studio hides (`hiddenT3Features.ts`), and Use in
 * another app needs the cloud's public config.
 */
export function addPaletteActions(
  actionItems: Array<PaletteItem>,
  gt: ReturnType<typeof useGT>,
  navigate: ReturnType<typeof useNavigate>,
) {
  const leftOut = (item: PaletteItem) =>
    (item.value === "action:issues" && t3FeatureHidden("issues")) ||
    (item.value === "action:triage" && t3FeatureHidden("triage")) ||
    (item.value === "action:use-in-another-app" && !hasCloudPublicConfig());
  for (let index = actionItems.length - 1; index >= 0; index -= 1) {
    if (leftOut(actionItems[index]!)) actionItems.splice(index, 1);
  }
  actionItems.push({
    kind: "action",
    value: "action:plugins",
    searchTerms: ["plugins", "extensions", "marketplace", "install", "mcp", "apps", "skills"],
    title: gt("Open plugins"),
    icon: <PuzzleIcon className={ITEM_ICON_CLASS} />,
    run: async () => {
      await navigate({ to: "/settings/plugins" });
    },
  });
  if (hasEngineeringSurfaces()) {
    actionItems.push({
      kind: "action",
      value: "action:studio-projects",
      searchTerms: ["projects", "project", "home", "new project", "open project"],
      title: gt("Open projects"),
      icon: <LayoutGridIcon className={ITEM_ICON_CLASS} />,
      run: async () => {
        await navigate({ to: "/projects" });
      },
    });
  }
}
