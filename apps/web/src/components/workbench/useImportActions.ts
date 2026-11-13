import { useImportDialogStore, useRestoreDialogStore } from "./importDialogStore";
import { readStudioImport } from "./studioImportBridge";

/**
 * Import's ways in from Studio's pages: Files or a folder (the desktop app's picker), Scan this
 * computer, and Restore a backup. Null where there is no desktop app to read this computer's files.
 */
export function useImportActions(): {
  readonly scan: () => void;
  readonly pick: () => Promise<void>;
  readonly restore: () => void;
} | null {
  const show = useImportDialogStore((store) => store.show);
  const showRestore = useRestoreDialogStore((store) => store.show);
  const bridge = readStudioImport();
  return bridge === null
    ? null
    : {
        scan: () => show({ kind: "scan" }),
        pick: async () => {
          const paths = await bridge.pick();
          if (paths.length > 0) show({ kind: "paths", paths });
        },
        restore: showRestore,
      };
}
