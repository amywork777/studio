import { ipcRenderer } from "electron";

import {
  STUDIO_BACKUP_CHANNEL,
  STUDIO_IMPORT_COPY_CHANNEL,
  STUDIO_IMPORT_PICK_CHANNEL,
  STUDIO_IMPORT_ROOTS_CHANNEL,
  STUDIO_IMPORT_SCAN_CHANNEL,
  STUDIO_OPEN_FILE_CHANNEL,
  STUDIO_PICK_FOLDER_CHANNEL,
} from "./studioImportChannels.ts";

/** `window.studioImport`: Studio's files on this computer, Import, Back up and Open (`studioImport.ts`). */
export const studioImportBridge = {
  roots: () => ipcRenderer.invoke(STUDIO_IMPORT_ROOTS_CHANNEL),
  scan: (root: string) => ipcRenderer.invoke(STUDIO_IMPORT_SCAN_CHANNEL, root),
  pick: () => ipcRenderer.invoke(STUDIO_IMPORT_PICK_CHANNEL),
  copy: (sources: ReadonlyArray<string>, folder: string) =>
    ipcRenderer.invoke(STUDIO_IMPORT_COPY_CHANNEL, sources, folder),
  pickFolder: (title: string, buttonLabel: string) =>
    ipcRenderer.invoke(STUDIO_PICK_FOLDER_CHANNEL, title, buttonLabel),
  backUp: (sources: ReadonlyArray<string>, folder: string) =>
    ipcRenderer.invoke(STUDIO_BACKUP_CHANNEL, sources, folder),
  openFile: (path: string) => ipcRenderer.invoke(STUDIO_OPEN_FILE_CHANNEL, path),
};
