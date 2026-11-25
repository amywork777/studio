import type { ImportFile } from "./importPlan";

/**
 * From the desktop app (`apps/desktop/src/studio/studioImport.ts`, `window.studioImport`). The
 * later methods are absent from a desktop app built before them.
 */
export interface StudioImportBridge {
  roots(): Promise<ReadonlyArray<{ readonly label: string; readonly path: string }>>;
  scan(root: string): Promise<{
    readonly root: string;
    readonly files: ReadonlyArray<ImportFile>;
    readonly truncated: boolean;
  }>;
  pick(): Promise<ReadonlyArray<string>>;
  copy(sources: ReadonlyArray<string>, folder: string): Promise<ReadonlyArray<string>>;
  pickFolder?(title: string, buttonLabel: string): Promise<string | null>;
  backUp?(
    sources: ReadonlyArray<string>,
    folder: string,
  ): Promise<{ readonly folder: string; readonly copied: number }>;
  /** Opens a document, sheet, drawing or model in its own app on this Mac (`StudioFilePage`). */
  openFile?(path: string): Promise<void>;
}

/** Null outside the desktop app (the hosted or a remote web app), where Import is not offered. */
export function readStudioImport(): StudioImportBridge | null {
  if (typeof window === "undefined") return null;
  return (window as { studioImport?: StudioImportBridge }).studioImport ?? null;
}

/** A dropped file's or folder's path on this computer, from the desktop app; null elsewhere. */
export function droppedPath(file: File): string | null {
  const path = window.desktopBridge?.getPathForFile?.(file);
  return typeof path === "string" && path !== "" ? path : null;
}

/** The folders last scanned and when, for the notice of files new since (`useNewFiles.ts`). */
export interface RememberedScan {
  readonly roots: ReadonlyArray<string>;
  readonly at: number;
}

const SCAN_KEY = "studio:import-scan";

export function readRememberedScan(): RememberedScan | null {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SCAN_KEY) ?? "null") as unknown;
    if (stored === null || typeof stored !== "object") return null;
    const { roots, at } = stored as { roots?: unknown; at?: unknown };
    return Array.isArray(roots) &&
      roots.every((root) => typeof root === "string") &&
      typeof at === "number"
      ? { roots, at }
      : null;
  } catch {
    return null;
  }
}

export function rememberScan(scan: RememberedScan): void {
  try {
    window.localStorage.setItem(SCAN_KEY, JSON.stringify(scan));
  } catch {
    // Storage off: no notice of new files next time.
  }
}
