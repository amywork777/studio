import type { StudioProjectBrief } from "@t3tools/contracts";
import {
  CircleCheckIcon,
  CircleXIcon,
  CloudUploadIcon,
  EllipsisIcon,
  FolderOpenIcon,
  MessageCircleIcon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuItemDetail, MenuPopup, MenuTrigger } from "../ui/menu";
import { propertiesLine } from "./briefFolder";
import { ProjectBackup, type ProjectBackupTarget } from "./ProjectBackupButton";
import { type ProjectStatus, statusWords } from "./projectStatus";

const TONE_BADGE = {
  failed: { variant: "error", Icon: CircleXIcon },
  warning: { variant: "warning", Icon: TriangleAlertIcon },
  passed: { variant: "success", Icon: CircleCheckIcon },
} as const;

/**
 * The top of a project's Overview, one row: the project's own name, never a part's, and how its
 * checks went beside it (`projectStatus`, from the runs alone); its actions at the row's end, Open
 * part first among them. The drafting setup and Back up are in its ··· menu.
 */
export function ProjectHeading(props: {
  readonly name: string;
  readonly brief: StudioProjectBrief | null;
  readonly status: ProjectStatus;
  /** Opens the lead part; null with none. */
  readonly onOpenPart: (() => void) | null;
  /** The properties' editor (`ProjectSetup`); null where they cannot be changed here. */
  readonly setup: ReactNode | null;
  readonly onShowFolder: (() => void) | null;
  /** The project's Export (`ProjectExportMenu`); null with no part yet. */
  readonly exportMenu: ReactNode | null;
  /** What Back up sends (`ProjectBackup`); null where it can't. */
  readonly backup: ProjectBackupTarget | null;
}) {
  const [editing, setEditing] = useState(false);
  const properties = props.brief === null ? "" : propertiesLine({ ...props.brief, material: "" });
  const words = statusWords(props.status);
  const more = (backUp: (() => void) | null) => (
    <Menu>
      <MenuTrigger
        render={<Button variant="ghost-muted" size="icon-xs" aria-label="More for the project" />}
      >
        <EllipsisIcon />
      </MenuTrigger>
      <MenuPopup align="end" side="bottom" sideOffset={6}>
        {/* The drafting setup lives here, a press from being changed, off the page. */}
        {properties === "" && props.setup === null ? null : (
          <MenuItem disabled={props.setup === null} onClick={() => setEditing(true)}>
            <SlidersHorizontalIcon />
            {props.setup === null ? "Properties" : "Edit properties"}
            {properties === "" ? null : <MenuItemDetail>{properties}</MenuItemDetail>}
          </MenuItem>
        )}
        {backUp === null ? null : (
          <MenuItem onClick={backUp}>
            <CloudUploadIcon />
            Back up…
          </MenuItem>
        )}
        {props.onShowFolder === null ? null : (
          <MenuItem onClick={props.onShowFolder}>
            <FolderOpenIcon />
            Show in Finder
          </MenuItem>
        )}
      </MenuPopup>
    </Menu>
  );
  return (
    <header aria-label="Project" className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="text-lg leading-6 font-semibold text-foreground">{props.name}</h1>
          {words.map((word) => {
            const { variant, Icon } = TONE_BADGE[word.tone];
            return (
              <Badge key={word.text} variant={variant}>
                <Icon aria-hidden="true" />
                {word.text}
              </Badge>
            );
          })}
        </div>
        <div role="toolbar" aria-label="Project actions" className="flex items-center gap-1.5">
          {props.exportMenu}
          {props.onOpenPart === null ? null : (
            <Button size="xs" onClick={props.onOpenPart}>
              Open part
            </Button>
          )}
          {props.backup === null ? (
            more(null)
          ) : (
            <ProjectBackup target={props.backup}>{(open) => more(open)}</ProjectBackup>
          )}
        </div>
      </div>
      {editing ? props.setup : null}
    </header>
  );
}

/**
 * Under the lead part, said quietly: what the project is, then when its part was last built and
 * exported, and the chats waiting on the person.
 */
export function ProjectAbout(props: {
  readonly purpose: string;
  /** The lead part's last build in words ("Built 3m ago"); null with none. */
  readonly built: { readonly text: string; readonly failed: boolean } | null;
  /** When it was last exported ("2026-11-25"); null with none. */
  readonly exported: string | null;
  readonly waiting: number;
  /** Brings the chats waiting on the person into view. */
  readonly onShowChats: (() => void) | null;
}) {
  const meta = props.built !== null || props.exported !== null || props.waiting > 0;
  if (props.purpose === "" && !meta) return null;
  return (
    <section aria-label="About the project" className="flex min-w-0 flex-col gap-1">
      {props.purpose === "" ? null : (
        <p className="text-sm text-muted-foreground">{props.purpose}</p>
      )}
      {!meta ? null : (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {props.built === null ? null : (
            <span className={props.built.failed ? "text-destructive" : undefined}>
              {props.built.text}
            </span>
          )}
          {props.exported === null ? null : <span>Exported {props.exported}</span>}
          {props.waiting === 0 ? null : (
            <Button
              size="xs"
              variant="ghost-muted"
              onClick={props.onShowChats ?? undefined}
              disabled={props.onShowChats === null}
            >
              <MessageCircleIcon />
              Needs you: {props.waiting}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
