import { useEffect } from "react";

import { formatShortcutLabel } from "~/keybindings";
import { isMacPlatform } from "~/lib/utils";

/**
 * Cmd+O (Ctrl+O off a Mac), a desktop CAD tool's Open, in the engineering interface: in a
 * project's workspace it opens the project switcher (`ProjectSwitcher`), on Home the quick find.
 * It takes the chord before T3 Code's own binding for it (open the folder in an editor), which is
 * a coding tool's.
 */
/** The chord as this keyboard names it: \u2318O on a Mac, Ctrl+O on Windows. */
export const openShortcutLabel = (platform: string = navigator.platform): string =>
  formatShortcutLabel(
    { key: "o", modKey: true, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false },
    platform,
  );

export function useOpenShortcut(onOpen: () => void): void {
  useEffect(() => {
    const mac = isMacPlatform(navigator.platform);
    const handle = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.shiftKey || event.key.toLowerCase() !== "o") return;
      if (mac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      onOpen();
    };
    // Taken as it comes down, before anything listening on the way back up sees it.
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, [onOpen]);
}
