import { isDocumentId } from "@t3tools/client-runtime/state/pluginFollow";
import {
  pluginFileHandlers,
  pluginViewsWithEntrypoint,
} from "@t3tools/client-runtime/state/plugins";
import type { EnvironmentId, InstalledPlugin, ScopedThreadRef } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { AtomRegistry } from "effect/reactivity";

import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { agentViewSurface, pluginAppSurface } from "../plugins/pluginSurfaces";
import { keepOverviewSpread } from "./overviewPanel";
import { rememberRecentFile } from "./recentFiles";
import { setSimpleView } from "./simpleView";
import { foldSidebarForPart } from "./sidebarFold";
import { knownModelTitle } from "./useFolderModels";
import { sameFile, surfaceFile } from "./sameFile";

type Plugins = ReadonlyArray<InstalledPlugin>;
/** The plugins as the server lists them now, read when the app's copy can't be trusted (`openInPanel`). */
export type FreshPlugins = () => Promise<Plugins | undefined>;

/** Asks the server for its plugin list again; undefined when it can't answer. */
export function freshPlugins(environmentId: EnvironmentId): FreshPlugins {
  return () => {
    const atom = pluginEnvironment.list({ environmentId, input: {} });
    appAtomRegistry.refresh(atom);
    return Effect.runPromise(
      AtomRegistry.getResult(appAtomRegistry, atom, { suspendOnWaiting: true }).pipe(
        Effect.map((result): Plugins | undefined => result.plugins),
        Effect.timeout("10 seconds"),
        Effect.orElseSucceed(() => undefined),
      ),
    );
  };
}

/**
 * A copy of the plugins still loading, or listing no file view at all (taken before the CAD view's
 * server listed its tools), can't say that no view claims a file.
 */
function unsettled(plugins: Plugins | undefined): boolean {
  return plugins === undefined || pluginViewsWithEntrypoint(plugins, "file").length === 0;
}

/**
 * A file goes to the plugin view that claims it, anything else to a document at its line; says
 * whether a view shows it now. Given `fresh`, a file the plugins still loading can't place waits for
 * the server's list (a picture opened at launch still opens to mark up); `onShown` hears if a view
 * takes it then. */
export function openInPanel(
  plugins: Plugins | undefined,
  threadRef: ScopedThreadRef,
  path: string,
  line?: number,
  fresh?: FreshPlugins,
  onShown?: () => void,
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
  if (viewer !== undefined) {
    panels.openPluginApp(threadRef, pluginAppSurface(viewer, path));
    return true;
  }
  if (fresh === undefined || !unsettled(plugins)) {
    panels.openFile(threadRef, path, line);
    return false;
  }
  void fresh().then((listed) => {
    const late = listed === undefined ? undefined : pluginFileHandlers(listed, path)[0];
    const now = useRightPanelStore.getState();
    if (late === undefined) {
      now.openFile(threadRef, path, line);
      return;
    }
    now.openPluginApp(threadRef, pluginAppSurface(late, path));
    onShown?.();
  });
  return false;
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
  plugins: Plugins | undefined,
  threadRef: ScopedThreadRef,
  part: string,
  fresh?: FreshPlugins,
): boolean {
  useRightPanelStore.getState().setMaximized(threadRef, false);
  const shown = openInPanel(plugins, threadRef, part, undefined, fresh, startInCad);
  if (shown) startInCad();
  return shown;
}

/**
 * Opens a file picked on the Overview as `openPartInCad` does, at the width the panel has: one
 * spread across the window stays so, as the person left it.
 */
export function openFromOverview(
  plugins: Plugins | undefined,
  threadRef: ScopedThreadRef,
  path: string,
  fresh?: FreshPlugins,
): boolean {
  keepOverviewSpread(threadRef);
  const shown = openInPanel(plugins, threadRef, path, undefined, fresh, startInCad);
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
  plugins: Plugins | undefined,
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
    threadRef !== null &&
    openInPanel(plugins, threadRef, path, line, freshPlugins(threadRef.environmentId));
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
  return (path: string) =>
    openPartInCad(plugins, threadRef, path, freshPlugins(threadRef.environmentId));
}

/** `useOpenInWorkbench` for the Overview, whose files open at the panel's width (`openFromOverview`). */
export function useOpenFromOverview(threadRef: ScopedThreadRef) {
  const plugins = useEnvironmentQuery(
    pluginEnvironment.list({ environmentId: threadRef.environmentId, input: {} }),
  ).data?.plugins;
  return (path: string) =>
    openFromOverview(plugins, threadRef, path, freshPlugins(threadRef.environmentId));
}
