import { useAtomValue } from "@effect/atom-react";
import { SearchIcon } from "lucide-react";

import { openCommandPalette } from "~/commandPaletteBus";
import { cn } from "~/lib/utils";
import { shortcutLabelForCommand } from "~/keybindings";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { Kbd } from "../ui/kbd";

/** Opens the quick find (⌘K, `StudioQuickFind`), which finds parts, files and jobs. */
export const openFind = () => openCommandPalette();

/**
 * The search, one button for Home's top bar and a workspace's tab row. On the tab row (`compact`)
 * it is narrower, and in a narrow toolbar container it keeps its icon alone.
 */
export function FindButton(props: { readonly compact?: boolean }) {
  const shortcut = shortcutLabelForCommand(
    useAtomValue(primaryServerKeybindingsAtom),
    "commandPalette.toggle",
  );
  const compact = props.compact === true;
  return (
    <button
      type="button"
      onClick={openFind}
      aria-label="Find anything"
      className={cn(
        "flex h-7 items-center gap-2 rounded-lg border border-input bg-background px-2.5 text-sm text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset dark:bg-input/32",
        compact ? "w-44 @max-[64rem]/toolbar:w-auto" : "w-full max-w-72",
      )}
    >
      <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-left",
          compact && "@max-[64rem]/toolbar:hidden",
        )}
      >
        Find anything
      </span>
      {shortcut ? (
        <Kbd className={compact ? "@max-[64rem]/toolbar:hidden" : undefined}>{shortcut}</Kbd>
      ) : null}
    </button>
  );
}
