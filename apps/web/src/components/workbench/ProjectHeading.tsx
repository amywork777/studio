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
 * The top of a project's Overview: the project's own name, never a part's; what it is in a line;
 * its properties, a press away from being changed (`setup`); then how its checks went, from the
 * runs alone (`projectStatus`), its last build and the chats waiting on the person.
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
  /** Brings the chats waiting on the person into view. */
  readonly onShowChats: (() => void) | null;
}) {
  const [editing, setEditing] = useState(false);
  const properties = props.brief === null ? "" : propertiesLine(props.brief);
  const words = statusWords(props.status);
  return (
    <header aria-label="Project" className="flex min-w-0 flex-col gap-2">
      <PageTitle
        title={props.name}
        lede={props.purpose === "" ? undefined : props.purpose}
        action={
          <>
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
          </>
        }
      />
      {properties === "" ? null : props.setup === null ? (
        <p className="text-xs text-muted-foreground">{properties}</p>
      ) : (
        <button
          type="button"
          aria-expanded={editing}
          aria-label={`Properties: ${properties}. Change them`}
          onClick={() => setEditing((open) => !open)}
          className="-mx-1 h-5 self-start rounded-sm px-1 text-xs text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {properties}
        </button>
      )}
      {editing ? props.setup : null}
      <div
        role="group"
        aria-label="How the project stands"
        className="flex min-w-0 flex-wrap items-center gap-2"
      >
        {words.map((word) => {
          const { variant, Icon } = TONE_BADGE[word.tone];
          return (
            <Badge key={word.text} variant={variant}>
              <Icon aria-hidden="true" />
              {word.text}
            </Badge>
          );
        })}
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
    </header>
  );
}
