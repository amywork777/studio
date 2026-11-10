import { FileInputIcon } from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";

/**
 * Studio's one Import menu: Files or a folder, Scan this computer, and Restore a backup, with the
 * same items and names on Home's start page, Home's projects, the Projects page and the workspace
 * toolbar, where Restore a backup is left out, as it makes a project of its own. The
 * button is the outline Import by default; the start page passes its big card as `trigger`.
 * Inside a toolbar container a narrow row shows the icon alone. Where the two items land
 * differently (the workspace toolbar: one copies into the open project, one makes projects),
 * `hints` gives each a muted second line, and the trigger says it imports into this project.
 */
export function ImportMenu(props: {
  readonly actions: {
    readonly scan: () => void;
    readonly pick: () => Promise<void>;
    readonly restore?: () => void;
  };
  readonly trigger?: ReactElement;
  readonly hints?: { readonly pick: string; readonly scan: string };
}) {
  const hints = props.hints;
  const label = hints ? "Import into this project" : "Import";
  const items = (
    <MenuPopup align={props.trigger === undefined ? "end" : "start"} side="bottom" sideOffset={6}>
      <MenuItem onClick={() => void props.actions.pick()}>
        {hints ? (
          <span className="flex flex-col items-start">
            Files or a folder
            <span className="text-xs text-muted-foreground">{hints.pick}</span>
          </span>
        ) : (
          "Files or a folder"
        )}
      </MenuItem>
      <MenuItem onClick={props.actions.scan}>
        {hints ? (
          <span className="flex flex-col items-start">
            Scan this computer
            <span className="text-xs text-muted-foreground">{hints.scan}</span>
          </span>
        ) : (
          "Scan this computer"
        )}
      </MenuItem>
      {hints === undefined && props.actions.restore !== undefined ? (
        <MenuItem onClick={props.actions.restore}>Restore a backup</MenuItem>
      ) : null}
    </MenuPopup>
  );
  return props.trigger === undefined ? (
    <Menu>
      <MenuTrigger render={<Button variant="outline" size="sm" aria-label={label} title={label} />}>
        <FileInputIcon aria-hidden="true" />
        <span className="@max-[40rem]/toolbar:hidden">Import</span>
      </MenuTrigger>
      {items}
    </Menu>
  ) : (
    <Menu>
      <MenuTrigger render={props.trigger} />
      {items}
    </Menu>
  );
}
