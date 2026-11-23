import type { ScopedThreadRef } from "@t3tools/contracts";
import { PlusIcon } from "lucide-react";

import { Button } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuItemDetail,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { importIntoProject } from "./importIntoProject";
import { DISCIPLINE_ICONS } from "./kinds";
import { STARTS } from "./NewDialog";
import { useNewDialogStore } from "./newDialogStore";
import { DISCIPLINES } from "./newTemplates";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { useImportActions } from "./useImportActions";
import { useOpenFromOverview } from "./useOpenInWorkbench";
import { useStudioProjectAt } from "./useStudioProjects";

/**
 * The +, as a browser's new-tab button, right after the last tab: everything that adds to the
 * project. New opens the toolbar's New (`StudioNew`) on the kind picked, so New stays one dialog;
 * Import is the same two ways in as Import's menu (`ImportMenu`).
 */
export function NewTabButton() {
  const workspace = useOpenWorkspaceStore((store) => store.workspace);
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="ghost-muted"
            size="icon-sm"
            aria-label="New or import"
            title="New or import"
            className="shrink-0"
            data-studio-new-tab=""
          />
        }
      >
        <PlusIcon aria-hidden="true" />
      </MenuTrigger>
      <MenuPopup align="start" side="bottom" sideOffset={6} className="min-w-56">
        <MenuGroup>
          <MenuGroupLabel>New</MenuGroupLabel>
          {DISCIPLINES.map((discipline) => {
            const Icon = DISCIPLINE_ICONS[discipline];
            return (
              <MenuItem
                key={discipline}
                onClick={() => useNewDialogStore.getState().ask(discipline)}
              >
                <Icon aria-hidden="true" />
                {discipline}
                <MenuItemDetail>{STARTS[discipline]}</MenuItemDetail>
              </MenuItem>
            );
          })}
        </MenuGroup>
        {workspace === null ? null : (
          <ImportItems threadRef={workspace.threadRef} folder={workspace.folder} />
        )}
      </MenuPopup>
    </Menu>
  );
}

/** Import's two ways in, for the open project: its files copied in, or a scan for new projects. */
function ImportItems(props: { readonly threadRef: ScopedThreadRef; readonly folder: string }) {
  const studio = useStudioProjectAt(props.threadRef.environmentId, props.folder);
  const open = useOpenFromOverview(props.threadRef);
  const importer = importIntoProject(props.folder, studio?.project.name ?? "the project", open);
  const scanner = useImportActions();
  if (importer === null || scanner === null) return null;
  return (
    <>
      <MenuSeparator />
      <MenuGroup>
        <MenuGroupLabel>Import</MenuGroupLabel>
        <MenuItem onClick={() => void importer.pick()}>
          Files or a folder
          <MenuItemDetail>Copied into {studio?.project.name ?? "the project"}</MenuItemDetail>
        </MenuItem>
        <MenuItem onClick={scanner.scan}>
          Scan this computer
          <MenuItemDetail>Makes new projects</MenuItemDetail>
        </MenuItem>
      </MenuGroup>
    </>
  );
}
