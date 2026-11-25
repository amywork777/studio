// @effect-diagnostics nodeBuiltinImport:off - the IPC handlers check paths with node:path.
import * as NodePath from "node:path";

import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import * as Effect from "effect/Effect";

import {
  STUDIO_BACKUP_CHANNEL,
  STUDIO_IMPORT_COPY_CHANNEL,
  STUDIO_IMPORT_PICK_CHANNEL,
  STUDIO_IMPORT_ROOTS_CHANNEL,
  STUDIO_IMPORT_SCAN_CHANNEL,
  STUDIO_OPEN_FILE_CHANNEL,
  STUDIO_PICK_FOLDER_CHANNEL,
} from "./studioImportChannels.ts";
import { backUp, copyInto, defaultRoots, isOpenable, scanFolder } from "./studioImportFiles.ts";

export type { StudioImportFile, StudioImportScan } from "./studioImportFiles.ts";

/**
 * Studio's files on this computer, reached by the page as `window.studioImport`: import scans and
 * copies, project backups, and opening a document in its own app (`isOpenable`; never a script or
 * an app). It only reads, except where it copies into a folder the person chose.
 */

const isAbsolutePath = (value: unknown): value is string =>
  typeof value === "string" && value !== "" && NodePath.isAbsolute(value);

export const installStudioImport = Effect.fn("desktop.studioImport.install")(function* () {
  yield* Effect.sync(() => {
    // Where the system says they are, not the home folder: OneDrive's backup moves them on Windows.
    ipcMain.handle(STUDIO_IMPORT_ROOTS_CHANNEL, () => defaultRoots((name) => app.getPath(name)));
    ipcMain.handle(STUDIO_IMPORT_SCAN_CHANNEL, (_event, root: unknown) => {
      if (!isAbsolutePath(root)) throw new Error("A scan needs a folder's full path.");
      return scanFolder(root);
    });
    ipcMain.handle(STUDIO_IMPORT_PICK_CHANNEL, async (event) => {
      const options: Electron.OpenDialogOptions = {
        title: "Import",
        buttonLabel: "Import",
        properties: ["openFile", "openDirectory", "multiSelections"],
      };
      const window = BrowserWindow.fromWebContents(event.sender);
      const result =
        window === null
          ? await dialog.showOpenDialog(options)
          : await dialog.showOpenDialog(window, options);
      return result.canceled ? [] : result.filePaths;
    });
    ipcMain.handle(STUDIO_IMPORT_COPY_CHANNEL, (_event, sources: unknown, folder: unknown) => {
      if (!Array.isArray(sources) || !sources.every(isAbsolutePath) || !isAbsolutePath(folder)) {
        throw new Error("Copying needs full paths.");
      }
      return copyInto(sources, folder);
    });
    ipcMain.handle(
      STUDIO_PICK_FOLDER_CHANNEL,
      async (event, title: unknown, buttonLabel: unknown) => {
        const options: Electron.OpenDialogOptions = {
          title: typeof title === "string" ? title : "Choose a folder",
          buttonLabel: typeof buttonLabel === "string" ? buttonLabel : "Choose",
          properties: ["openDirectory", "createDirectory"],
        };
        const window = BrowserWindow.fromWebContents(event.sender);
        const result =
          window === null
            ? await dialog.showOpenDialog(options)
            : await dialog.showOpenDialog(window, options);
        return result.canceled ? null : (result.filePaths[0] ?? null);
      },
    );
    ipcMain.handle(STUDIO_BACKUP_CHANNEL, (_event, sources: unknown, folder: unknown) => {
      if (!Array.isArray(sources) || !sources.every(isAbsolutePath) || !isAbsolutePath(folder)) {
        throw new Error("A backup needs full paths.");
      }
      return backUp(sources, folder);
    });
    ipcMain.handle(STUDIO_OPEN_FILE_CHANNEL, async (_event, path: unknown) => {
      if (!isAbsolutePath(path) || !isOpenable(path)) {
        throw new Error("Studio opens documents, sheets, drawings and models only.");
      }
      const failure = await shell.openPath(path);
      if (failure !== "") throw new Error(failure);
    });
  });
});
