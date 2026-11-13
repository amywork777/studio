import { isDocumentId } from "@t3tools/client-runtime/state/pluginFollow";
import { pluginFileHandlers } from "@t3tools/client-runtime/state/plugins";
import type { ScopedThreadRef } from "@t3tools/contracts";

import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { agentViewSurface, pluginAppSurface } from "../plugins/pluginSurfaces";
import { keepOverviewSpread } from "./overviewPanel";
import { rememberRecentFile } from "./recentFiles";
import { setSimpleView } from "./simpleView";
import { foldSidebarForPart } from "./sidebarFold";
import { knownModelTitle } from "./useFolderModels";
import { sameFile, surfaceFile } from "./sameFile";

/**
 * A file goes to the plugin view that claims it (a STEP in the CAD view, never as text), anything
 * else to a document at its line. Takes a path in the thread's folder, a full path, or a cadgen 0.8
 * document id. Says whether a plugin view shows it.
 */
export function openInPanel(
  plugins: Parameters<typeof pluginFileHandlers>[0] | undefined,
  threadRef: ScopedThreadRef,
  path: string,
  line?: number,
): boolean {
  if (isDocumentId(path)) return openDocumentInPanel(plugins, threadRef, path);
  const panels = useRightPanelStore.getState();
  rememberRecentFile(threadRef, path);
  // A file already open, however its path was written (in the folder, in full, by the agent),
  // comes to the front in its own tab rather than in a second one.
  const open = selectThreadRightPanelState(panels.byThreadKey, threadRef).surfaces.find(
    (surface) => {
      const file = surfaceFile(surface);
      return file !== null && sameFile(file, path);
    },
  );
  if (open !== undefined && (open.kind !== "file" || line === undefined)) {
    panels.activateSurface(threadRef, open.id);
    return open.kind === "plugin-app";
  }
  // Every PDF and picture opens in the CAD view, to read as a page and mark up.
  const viewer = plugins === undefined ? undefined : pluginFileHandlers(plugins, path)[0];
  if (viewer !== undefined) panels.openPluginApp(threadRef, pluginAppSurface(viewer, path));
  else panels.openFile(threadRef, path, line);
  return viewer !== undefined;
}

/** A viewer took the part the person picked: CAD mode, with the sidebar folded for the model. */
function startInCad() {
  setSimpleView(false);
  foldSidebarForPart();
}

/**
 * Opens a part the person picked (a project's tile, the switcher, Cmd+K, the Overview, a sample's
 * copy, New part) beside its chat, in CAD mode, the full workspace, with the sidebar folded: the
 * one way a person gets to a part. Anything no viewer shows opens as a document, with the layout
 * left as it was. Says whether a viewer took it (`openInPanel`).
 */
export function openPartInCad(
  plugins: Parameters<typeof pluginFileHandlers>[0] | undefined,
  threadRef: ScopedThreadRef,
  part: string,
): boolean {
  useRightPanelStore.getState().setMaximized(threadRef, false);
  const shown = openInPanel(plugins, threadRef, part);
  if (shown) startInCad();
  return shown;
}

/**
 * Opens a file picked on the Overview as `openPartInCad` does, at the width the panel has: one
 * spread across the window stays so, as the person left it.
 */
export function openFromOverview(
  plugins: Parameters<typeof pluginFileHandlers>[0] | undefined,
  threadRef: ScopedThreadRef,
  path: string,
): boolean {
  keepOverviewSpread(threadRef);
  const shown = openInPanel(plugins, threadRef, path);
  if (shown) startInCad();
  return shown;
}

/** The view tool that shows a cadgen model by its document id: text-to-cad's `cad_open`. */
const DOCUMENT_VIEW_TOOL = "cad_open";

/**
 * Opens a cadgen model beside a thread by its document id (a 0.8 model has no file to open): in
 * the CAD view that shows one, as the agent's `cad_open` opens it, one tab per document; one open
 * already comes to the front. Says whether a view took it.
 */
export function openDocumentInPanel(
  plugins: Parameters<typeof pluginFileHandlers>[0] | undefined,
  threadRef: ScopedThreadRef,
  id: string,
  title?: string,
): boolean {
  const panels = useRightPanelStore.getState();
  // Home's Recent lists it by its name: an id says nothing of what it is.
  rememberRecentFile(threadRef, id, title ?? knownModelTitle(id));
  for (const plugin of plugins ?? []) {
    if (!plugin.enabled) continue;
    const view = plugin.views.find((candidate) => candidate.tool === DOCUMENT_VIEW_TOOL);
    if (view === undefined) continue;
    const surface = agentViewSurface(
      { pluginId: plugin.id, pluginName: plugin.displayName, view },
      { source: id },
      id,
    );
    const open = selectThreadRightPanelState(panels.byThreadKey, threadRef).surfaces.find(
      (shown) => shown.id === surface.id,
    );
    if (open !== undefined) panels.activateSurface(threadRef, open.id);
    else panels.openPluginApp(threadRef, surface);
    return true;
  }
  return false;
}

/** For a chat link or file chip; without a thread it opens nothing (`openInPanel`). */
export function useOpenChatFile(threadRef: ScopedThreadRef | null) {
  const plugins = useEnvironmentQuery(
    threadRef === null
      ? null
      : pluginEnvironment.list({ environmentId: threadRef.environmentId, input: {} }),
  ).data?.plugins;
  return (path: string, line?: number) =>
    threadRef !== null && openInPanel(plugins, threadRef, path, line);
}

/**
 * Opens a project file the person picked beside the thread, the way an engineer looks at it: a
 * model, board or drawing in the plugin view that claims it, in CAD mode (`openPartInCad`),
 * anything else as a document. Takes a path in the thread's folder, a full path, or a model's id.
 */
export function useOpenInWorkbench(threadRef: ScopedThreadRef) {
  const plugins = useEnvironmentQuery(
    pluginEnvironment.list({ environmentId: threadRef.environmentId, input: {} }),
  ).data?.plugins;
  return (path: string) => openPartInCad(plugins, threadRef, path);
}

/** `useOpenInWorkbench` for the Overview, whose files open at the panel's width (`openFromOverview`). */
export function useOpenFromOverview(threadRef: ScopedThreadRef) {
  const plugins = useEnvironmentQuery(
    pluginEnvironment.list({ environmentId: threadRef.environmentId, input: {} }),
  ).data?.plugins;
  return (path: string) => openFromOverview(plugins, threadRef, path);
}
