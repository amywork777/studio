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
 * Copies picked or dropped files into the project's folder, like an upload into a Drive folder. The
 * originals stay put and nothing is overwritten: a taken name becomes "name (2)". One part imported
 * opens at once (`importedToOpen`). Null outside the desktop app, which does the copying.
 */
export function importIntoProject(
  folder: string | null,
  projectName: string,
  open?: (path: string) => void,
): {
  readonly pick: () => Promise<void>;
  readonly copy: (paths: ReadonlyArray<string>) => Promise<void>;
} | null {
  const bridge = readStudioImport();
  const copy = async (paths: ReadonlyArray<string>) => {
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
  };
  const pick = async () => {
    if (bridge === null) return;
    await copy(await bridge.pick());
  };
  return bridge === null || folder === null ? null : { pick, copy };
}
