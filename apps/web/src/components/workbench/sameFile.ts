import { isDocumentId } from "@t3tools/client-runtime/state/pluginFollow";

import type { PluginAppSurface, RightPanelSurface } from "~/rightPanelStore";

import { partName, resultTabLabel } from "./partNames";

/** A path as files are compared: `/` between folders, without a leading `./` or a trailing `/`. */
export const normalPath = (path: string) =>
  path
    .replaceAll("\\", "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/\/+$/, "");

/**
 * Whether two paths name the same file, the one written in the thread's folder (`parts/tray.step`
 * or `./parts/tray.step`) and the other in full, as a chat link, the Overview and a reference each
 * name a part: so a file opens in one tab, not two.
 */
export function sameFile(a: string, b: string): boolean {
  return sameNormalPath(normalPath(a), normalPath(b));
}

/**
 * `sameFile` on paths already read by `normalPath`: equal, or one the other's tail at a folder's
 * edge. Two such paths end in the same name, so a caller comparing many can look among those alone.
 */
export function sameNormalPath(left: string, right: string): boolean {
  return left === right || left.endsWith(`/${right}`) || right.endsWith(`/${left}`);
}

/** The file a panel tab shows, in the words it was opened with; null for a tab that shows none. */
export function surfaceFile(surface: RightPanelSurface): string | null {
  if (surface.kind === "file") return surface.relativePath;
  if (surface.kind !== "plugin-app") return null;
  if (surface.file !== undefined) return surface.file;
  // A view the agent opened (`agentViewSurface`) names its file only in its id.
  const named = /:agent:(.+)$/.exec(surface.id)?.[1];
  return named === undefined ? null : decodeURIComponent(named);
}

/**
 * A view's tab as an engineer reads it: its part's name ("LED module", "Head"). A file's tab is
 * titled by its file; a model's names only its document id, so its name comes from `modelTitles`
 * (`useModelTitles`). A view with no file, or a model not read yet, keeps the view's own title.
 */
export function viewTabTitle(
  surface: PluginAppSurface,
  modelTitles: ReadonlyMap<string, string>,
): string {
  const file = surfaceFile(surface);
  if (file !== null && isDocumentId(file)) return modelTitles.get(file) ?? surface.title;
  return (
    (file === null ? null : resultTabLabel(file)) ?? partName(surface.title)?.label ?? surface.title
  );
}
