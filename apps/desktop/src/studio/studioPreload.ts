// Studio's preload bridges, exposed by `preload.ts` with one call.
import { contextBridge, ipcRenderer } from "electron";

import {
  PLUGIN_VIEW_RELEASE_CHANNEL,
  PLUGIN_VIEW_STAGE_CHANNEL,
} from "../plugins/pluginViewChannels.ts";
import { studioImportBridge } from "./studioImportPreload.ts";

export function exposeStudioBridges(): void {
  // Plugin views stage their HTML on `mcp-app://` (apps/desktop/src/plugins/PluginViews.ts).
  contextBridge.exposeInMainWorld("pluginViewsBridge", {
    stage: (html: string, csp: unknown): Promise<string> =>
      ipcRenderer.invoke(PLUGIN_VIEW_STAGE_CHANNEL, { html, csp }),
    release: (url: string): Promise<void> => ipcRenderer.invoke(PLUGIN_VIEW_RELEASE_CHANNEL, url),
  });

  // Studio's Import: scanning folders for engineering files, and copying them into projects.
  contextBridge.exposeInMainWorld("studioImport", studioImportBridge);
}
