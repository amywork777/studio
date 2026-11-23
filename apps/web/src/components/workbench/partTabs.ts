import type { RightPanelSurface } from "~/rightPanelStore";

import { normalPath, sameFile, surfaceFile } from "./sameFile";

/**
 * Parts opened as their STEP and shown by their built document (`useSwapViewForDocument`): the file
 * as the tab named it, by the document now showing it. One part is one tab, however it is opened
 * again (the agent's follow, a chat link, the Overview, `cad_open` of the document).
 */
const documentOfFile = new Map<string, string>();

/** A tab that shows a file: a document or a view of one (`surfaceFile`). */
export type PartTab = Extract<RightPanelSurface, { kind: "file" | "plugin-app" }>;

const isPartTab = (surface: RightPanelSurface): surface is PartTab =>
  surface.kind === "file" || surface.kind === "plugin-app";

/** A part's file is shown by `documentId` now. */
export function notePartDocument(file: string, documentId: string): void {
  documentOfFile.set(normalPath(file), documentId);
}

/** Forgets every pairing (tests). */
export function forgetPartDocuments(): void {
  documentOfFile.clear();
}

/** The other names of the part `wanted` names: a file's document, or a document's files. */
function partnersOf(wanted: string): ReadonlyArray<string> {
  const partners: Array<string> = [];
  for (const [file, document] of documentOfFile) {
    if (document === wanted) partners.push(file);
    else if (sameFile(file, wanted)) partners.push(document);
  }
  return partners;
}

/**
 * The open tab that shows the part `wanted` names (a path or a document id), other than `except`:
 * the same file, or its STEP and built document. Null when none is open.
 */
export function openPartTab(
  surfaces: ReadonlyArray<RightPanelSurface>,
  wanted: string,
  except?: string,
): PartTab | null {
  const partners = partnersOf(wanted);
  for (const surface of surfaces) {
    if (surface.id === except || !isPartTab(surface)) continue;
    const file = surfaceFile(surface);
    if (file === null) continue;
    if (sameFile(file, wanted) || partners.some((partner) => sameFile(file, partner))) {
      return surface;
    }
  }
  return null;
}

/** As `openPartTab`, but only a tab showing the part under its other name (not the same file). */
export function partnerTab(
  surfaces: ReadonlyArray<RightPanelSurface>,
  wanted: string,
  except?: string,
): PartTab | null {
  const partners = partnersOf(wanted);
  if (partners.length === 0) return null;
  for (const surface of surfaces) {
    if (surface.id === except || !isPartTab(surface)) continue;
    const file = surfaceFile(surface);
    if (file !== null && partners.some((partner) => sameFile(file, partner))) return surface;
  }
  return null;
}
