import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect } from "react";

import {
  type RightPanelSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
} from "~/rightPanelStore";

import { normalPath, sameFile, surfaceFile } from "./sameFile";

// Kept between runs, so a STEP tab and its document's tab restored from before still merge.
const SAVED_KEY = "studio:part-documents";

function readSaved(): ReadonlyArray<readonly [string, string]> {
  try {
    const raw = globalThis.localStorage?.getItem(SAVED_KEY);
    const pairs: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(pairs)
      ? pairs.filter(
          (pair): pair is [string, string] =>
            Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function save(): void {
  try {
    globalThis.localStorage?.setItem(SAVED_KEY, JSON.stringify([...documentOfFile].slice(-200)));
  } catch {
    // A pairing not kept only means a restored pair merges once its STEP asks for its document again.
  }
}

/**
 * Parts opened as their STEP and shown by their built document (`useSwapViewForDocument`): the file
 * as the tab named it, by the document now showing it. One part is one tab, however it is opened
 * again (the agent's follow, a chat link, the Overview, `cad_open` of the document).
 */
const documentOfFile = new Map<string, string>(readSaved());

/** A tab that shows a file: a document or a view of one (`surfaceFile`). */
export type PartTab = Extract<RightPanelSurface, { kind: "file" | "plugin-app" }>;

const isPartTab = (surface: RightPanelSurface): surface is PartTab =>
  surface.kind === "file" || surface.kind === "plugin-app";

/** A part's file is shown by `documentId` now. */
export function notePartDocument(file: string, documentId: string): void {
  documentOfFile.set(normalPath(file), documentId);
  save();
}

/** Forgets every pairing (tests). */
export function forgetPartDocuments(): void {
  documentOfFile.clear();
  save();
}

/**
 * A part open as two tabs, its STEP's and its document's (restored from before, or opened by a build
 * that kept both): the document's tab takes the STEP tab's place and the STEP tab goes, the document's
 * tab in front if either was. Paired by the part's identity (`notePartDocument`), never a tab's id.
 */
export function partTabMerges(
  surfaces: ReadonlyArray<RightPanelSurface>,
  activeSurfaceId: string | null,
): ReadonlyArray<{
  readonly keep: string;
  readonly drop: string;
  readonly index: number;
  readonly front: boolean;
}> {
  const merges: Array<{ keep: string; drop: string; index: number; front: boolean }> = [];
  surfaces.forEach((surface, index) => {
    if (!isPartTab(surface)) return;
    const file = surfaceFile(surface);
    if (file === null) return;
    const document = documentOfFile.get(normalPath(file));
    if (document === undefined || sameFile(file, document)) return;
    const shown = surfaces.find((other) => {
      if (other.id === surface.id || !isPartTab(other)) return false;
      const otherFile = surfaceFile(other);
      return otherFile !== null && sameFile(otherFile, document);
    });
    if (shown === undefined) return;
    merges.push({
      keep: shown.id,
      drop: surface.id,
      index,
      front: activeSurfaceId === surface.id || activeSurfaceId === shown.id,
    });
  });
  return merges;
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

/** Applies `partTabMerges` to a thread's tabs in the store; true where something merged. */
function mergePartTabs(threadRef: ScopedThreadRef): boolean {
  const panels = useRightPanelStore.getState();
  const state = selectThreadRightPanelState(panels.byThreadKey, threadRef);
  const merges = partTabMerges(state.surfaces, state.activeSurfaceId);
  for (const merge of merges) {
    panels.moveSurface(threadRef, merge.keep, merge.index);
    panels.closeSurface(threadRef, merge.drop);
    if (merge.front) panels.activateSurface(threadRef, merge.keep);
  }
  return merges.length > 0;
}

/** Keeps a thread's tabs one per part as they change (restored, opened by the agent, pressed). */
export function useMergedPartTabs(threadRef: ScopedThreadRef | null): void {
  const environmentId = threadRef?.environmentId ?? null;
  const threadId = threadRef?.threadId ?? null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to the right panel store, outside React, to merge a part's two tabs
  useEffect(() => {
    if (environmentId === null || threadId === null) return;
    const ref = scopeThreadRef(environmentId, threadId);
    mergePartTabs(ref);
    let merging = false;
    return useRightPanelStore.subscribe(() => {
      if (merging) return;
      merging = true;
      mergePartTabs(ref);
      merging = false;
    });
  }, [environmentId, threadId]);
}
