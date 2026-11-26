import type { StudioProjectBrief } from "@t3tools/contracts";
import {
  CircleCheckIcon,
  CircleXIcon,
  EllipsisIcon,
  FolderOpenIcon,
  MessageCircleIcon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { propertiesLine } from "./briefFolder";
import { PageTitle } from "./PageTitle";
import { type ProjectStatus, statusWords } from "./projectStatus";

const TONE_BADGE = {
  failed: { variant: "error", Icon: CircleXIcon },
  warning: { variant: "warning", Icon: TriangleAlertIcon },
  passed: { variant: "success", Icon: CircleCheckIcon },
} as const;

/**
 * The top of a project's Overview: the project's own name, never a part's, with its actions in one
 * group at the end (Back up, Export, Open part, more); what it is in a line; then one line of its
 * properties, a press away from being changed (`setup`), how its checks went, from the runs alone
 * (`projectStatus`), its last build and the chats waiting on the person.
 */
export function ProjectHeading(props: {
  readonly name: string;
  readonly purpose: string;
  readonly brief: StudioProjectBrief | null;
  readonly status: ProjectStatus;
  /** The lead part's last build in words ("Built 3m ago"); null with none. */
  readonly built: { readonly text: string; readonly failed: boolean } | null;
  /** Opens the lead part; null with none. */
  readonly onOpenPart: (() => void) | null;
  /** The properties' editor (`ProjectSetup`); null where they cannot be changed here. */
  readonly setup: ReactNode | null;
  readonly onShowFolder: (() => void) | null;
  /** The project's Export (`ProjectExportMenu`); null with no part yet. */
  readonly exportMenu: ReactNode | null;
  /** Back up, as a project tile's menu offers it (`ProjectBackupButton`); null where it can't. */
  readonly backup: ReactNode | null;
  /** Brings the chats waiting on the person into view. */
  readonly onShowChats: (() => void) | null;
  /** The project at a glance (`ProjectStats`), under its name; null for none. */
  readonly stats: ReactNode | null;
}) {
  const [editing, setEditing] = useState(false);
  // With the facts as chips, the material is one of them: the line keeps the drafting setup.
  const properties =
    props.brief === null
      ? ""
      : propertiesLine(props.stats === null ? props.brief : { ...props.brief, material: "" });
  const words = statusWords(props.status);
  return (
    <header aria-label="Project" className="flex min-w-0 flex-col gap-2">
      <PageTitle
        title={props.name}
        // How its checks went, beside its name: the first thing to know of a project.
        label={
          words.length === 0 ? undefined : (
            <span className="ms-1 inline-flex flex-wrap gap-1 align-middle">
              {words.map((word) => {
                const { variant, Icon } = TONE_BADGE[word.tone];
                return (
                  <Badge key={word.text} variant={variant}>
                    <Icon aria-hidden="true" />
                    {word.text}
                  </Badge>
                );
              })}
            </span>
          )
        }
        lede={props.purpose === "" ? undefined : props.purpose}
        action={
          <div role="toolbar" aria-label="Project actions" className="flex items-center gap-1.5">
            {props.backup}
            {props.exportMenu}
            {props.onOpenPart === null ? null : (
              <Button size="xs" onClick={props.onOpenPart}>
                Open part
              </Button>
            )}
            <Menu>
              <MenuTrigger
                render={
                  <Button variant="ghost-muted" size="icon-xs" aria-label="More for the project" />
                }
              >
                <EllipsisIcon />
              </MenuTrigger>
              <MenuPopup align="end" side="bottom" sideOffset={6}>
                {props.setup === null ? null : (
                  <MenuItem onClick={() => setEditing(true)}>
                    <SlidersHorizontalIcon />
                    Edit properties
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
          </div>
        }
      />
      {props.stats}
      <div
        role="group"
        aria-label="How the project stands"
        className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"
      >
        {properties === "" ? null : props.setup === null ? (
          <p className="text-xs text-muted-foreground">{properties}</p>
        ) : (
          <button
            type="button"
            aria-expanded={editing}
            aria-label={`Properties: ${properties}. Change them`}
            onClick={() => setEditing((open) => !open)}
            className="-mx-1 min-h-5 rounded-sm px-1 text-left text-xs text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            {properties}
          </button>
        )}
        {props.built === null ? null : (
          <span
            className={
              props.built.failed ? "text-xs text-destructive" : "text-xs text-muted-foreground"
            }
          >
            {props.built.text}
          </span>
        )}
        {props.status.waiting === 0 ? null : (
          <Button
            size="xs"
            variant="ghost-muted"
            onClick={props.onShowChats ?? undefined}
            disabled={props.onShowChats === null}
          >
            <MessageCircleIcon />
            Needs you: {props.status.waiting}
          </Button>
        )}
      </div>
      {editing ? props.setup : null}
    </header>
  );
}
