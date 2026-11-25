// @effect-diagnostics nodeBuiltinImport:off - the IPC handlers check paths and write a PDF with Node.
import * as NodeFSP from "node:fs/promises";
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
  STUDIO_SAVE_PDF_CHANNEL,
  STUDIO_WRITE_DRAWING_PAGES_CHANNEL,
} from "./studioImportChannels.ts";
import { writeDrawingPages } from "./studioDrawingPages.ts";
import { backUp, copyInto, defaultRoots, isOpenable, scanFolder } from "./studioImportFiles.ts";

export type { StudioImportFile, StudioImportScan } from "./studioImportFiles.ts";

/**
 * Studio's files on this computer, reached by the page as `window.studioImport`: import scans and
 * copies, project backups, and opening a document in its own app (`isOpenable`; never a script or
 * an app). It only reads, except where it copies into a folder the person chose, writes a PDF
 * drawing's pages beside it, and saves a report as PDF where Studio puts it.
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
    ipcMain.handle(
      STUDIO_WRITE_DRAWING_PAGES_CHANNEL,
      (_event, folder: unknown, files: unknown) => {
        if (!isAbsolutePath(folder) || !Array.isArray(files)) {
          throw new Error("A drawing's pages need their folder's full path.");
        }
        return writeDrawingPages(folder, files);
      },
    );
    ipcMain.handle(STUDIO_SAVE_PDF_CHANNEL, async (_event, html: unknown, path: unknown) => {
      if (typeof html !== "string" || !isAbsolutePath(path) || !/\.pdf$/i.test(path)) {
        throw new Error("Saving a PDF needs its page and a full path ending in .pdf.");
      }
      // A page of Studio's own making, drawn off screen with no script and printed as the
      // system's print to PDF would, the same on a Mac and on Windows.
      const page = new BrowserWindow({
        show: false,
        webPreferences: { javascript: false, sandbox: true },
      });
      try {
        await page.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        const pdf = await page.webContents.printToPDF({
          landscape: true,
          printBackground: true,
          pageSize: "Letter",
        });
        await NodeFSP.mkdir(NodePath.dirname(path), { recursive: true });
        await NodeFSP.writeFile(path, pdf);
      } finally {
        page.destroy();
      }
    });
  });
});
