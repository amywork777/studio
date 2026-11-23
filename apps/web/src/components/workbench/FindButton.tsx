import { useAtomValue } from "@effect/atom-react";
import { SearchIcon } from "lucide-react";

import { openCommandPalette } from "~/commandPaletteBus";
import { shortcutLabelForCommand } from "~/keybindings";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** Opens the quick find (⌘K, `StudioQuickFind`), which finds parts, files and jobs. */
export const openFind = () => openCommandPalette();

/**
 * The search: one icon at the top strip's end on every screen, Home's and a project's alike, its
 * shortcut in its tooltip. Studio has one search, so no page carries a field of its own.
 */
export function FindButton() {
  const shortcut = shortcutLabelForCommand(
    useAtomValue(primaryServerKeybindingsAtom),
    "commandPalette.toggle",
  );
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={openFind}
            aria-label="Find anything"
            aria-keyshortcuts={shortcut ?? undefined}
          />
        }
      >
        <SearchIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipPopup side="bottom">
        {shortcut ? `Find anything (${shortcut})` : "Find anything"}
      </TooltipPopup>
    </Tooltip>
  );
}
