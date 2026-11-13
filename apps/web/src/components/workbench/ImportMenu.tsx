import { FileInputIcon } from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";

/**
 * Studio's one Import menu, with the same items and names everywhere. The workspace toolbar leaves
 * out Restore a backup, since it makes a project of its own, and passes `hints` because its two
 * items land differently. In a narrow toolbar container the trigger shows its icon alone.
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
