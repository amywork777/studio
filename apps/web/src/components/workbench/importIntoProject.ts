import { useCallback } from "react";

import { toastManager } from "../ui/toast";
import { classifyProjectFile, DESIGN_GROUPS } from "./projectFiles";
import { readStudioImport } from "./studioImportBridge";

/** An error from the desktop app in its own words, without Electron's wrapping. */
export const plainError = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']*': (?:Error: )?/,
    "",
  );

/**
 * The one design file (a part, an assembly or a board) an import brought in, to open at once, as
 * a CAD tool opens the STEP it imports, whatever else came with it; null when it brought none or
 * several, which the Overview lists for the person to pick (a folder copied in is listed there too).
 */
export function importedToOpen(copied: ReadonlyArray<string>): string | null {
  const designs = copied.filter((path) => {
    // By its name alone: the folder it was copied to is the project's, whatever that is called.
    const group = classifyProjectFile(path.split(/[\\/]/).pop() ?? path)?.group;
    return group !== undefined && DESIGN_GROUPS.has(group);
  });
  return designs.length === 1 ? designs[0]! : null;
}

/**
 * Import inside a project, as a file uploaded into a Drive folder: the files or folders picked
 * (Import in the panel's toolbar) or dropped on the Overview are copied into the project's folder,
 * where the Overview lists them. The originals stay where they are, and nothing there is written
 * over: a name already taken becomes "name (2)". One part imported opens straight away
 * (`importedToOpen`, by `open`). Null outside the desktop app, which copies them.
 */
export function useImportIntoProject(
  folder: string | null,
  projectName: string,
  open?: (path: string) => void,
): {
  readonly pick: () => Promise<void>;
  readonly copy: (paths: ReadonlyArray<string>) => Promise<void>;
} | null {
  const bridge = readStudioImport();
  const copy = useCallback(
    async (paths: ReadonlyArray<string>) => {
      if (bridge === null || folder === null || paths.length === 0) return;
      try {
        const copied = await bridge.copy(paths, folder);
        toastManager.add({
          type: "success",
          title: `Imported ${copied.length === 1 ? "1 item" : `${copied.length} items`} into ${projectName}`,
        });
        const part = importedToOpen(copied);
        if (part !== null) open?.(part);
      } catch (error) {
        toastManager.add({
          type: "error",
          title: `Could not import into ${projectName}`,
          description: plainError(error),
        });
      }
    },
    [bridge, folder, open, projectName],
  );
  const pick = useCallback(async () => {
    if (bridge === null) return;
    await copy(await bridge.pick());
  }, [bridge, copy]);
  return bridge === null || folder === null ? null : { pick, copy };
}
