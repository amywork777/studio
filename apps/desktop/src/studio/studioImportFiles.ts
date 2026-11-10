// @effect-diagnostics nodeBuiltinImport:off - file walking and copying with Node's own APIs.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { type StudioImportKind, studioImportKind } from "@t3tools/shared/studioImport";

/**
 * Studio's Import and Back up, on this computer's files: the folders a first scan offers, a walk
 * of one folder (or a file) for its engineering files, copying into a project's folder, and
 * backing a project up into a folder the person chose. No Electron here: the main process exposes
 * these (`studioImport.ts`), and the walkthrough script runs them as they are.
 */

/**
 * The files Studio opens in their own app on this Mac (`shell.openPath`): documents, sheets,
 * slides, pictures, drawings, models, boards and machine files. Never a script, an app or
 * anything else that would run.
 */
const OPENABLE =
  /\.(?:xlsx|xlsm|xls|numbers|csv|docx|doc|pages|rtf|txt|md|pptx|ppt|key|pdf|zip|heic|heif|png|jpe?g|gif|tiff?|webp|svg|dwg|dxf|step|stp|iges|igs|stl|3mf|obj|glb|f3d|sldprt|sldasm|kicad_pcb|kicad_sch|kicad_pro|gbr|drl|gcode|gco|nc|ngc|tap|mp4|mov)$/i;

export const isOpenable = (path: string) => OPENABLE.test(path);

export interface StudioImportFile {
  readonly path: string;
  readonly kind: StudioImportKind;
  readonly size: number;
  readonly modifiedMs: number;
}

export interface StudioImportScan {
  readonly root: string;
  readonly files: ReadonlyArray<StudioImportFile>;
  /** The walk stopped at its limit; the folder holds more than it found. */
  readonly truncated: boolean;
}

/** Folders no engineering work lives in: tools' caches, other apps' data and bundles. */
const SKIPPED = new Set([
  "node_modules",
  "Library",
  "Applications",
  "venv",
  "__pycache__",
  "site-packages",
  "Caches",
]);
const BUNDLES = /\.(app|photoslibrary|bundle|framework)$/i;
const MAX_FILES = 20_000;
const MAX_DEPTH = 8;

export async function scanFolder(
  root: string,
  limits = { files: MAX_FILES, depth: MAX_DEPTH },
): Promise<StudioImportScan> {
  // A file dropped or picked on its own is its own scan.
  const rootStat = await NodeFSP.stat(root).catch(() => null);
  if (rootStat?.isFile()) {
    const kind = studioImportKind(root);
    return {
      root,
      files:
        kind === null
          ? []
          : [{ path: root, kind, size: rootStat.size, modifiedMs: rootStat.mtimeMs }],
      truncated: false,
    };
  }
  const files: StudioImportFile[] = [];
  let truncated = false;
  const walk = async (folder: string, depth: number): Promise<void> => {
    let entries;
    try {
      entries = await NodeFSP.readdir(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (truncated) return;
      if (entry.name.startsWith(".") || SKIPPED.has(entry.name) || BUNDLES.test(entry.name)) {
        continue;
      }
      const path = NodePath.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (depth < limits.depth) await walk(path, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const kind = studioImportKind(entry.name);
      if (kind === null) continue;
      if (files.length >= limits.files) {
        truncated = true;
        return;
      }
      try {
        const stat = await NodeFSP.stat(path);
        files.push({ path, kind, size: stat.size, modifiedMs: stat.mtimeMs });
      } catch {
        // Gone or unreadable since the folder was listed: left out.
      }
    }
  };
  await walk(root, 0);
  return { root, files, truncated };
}

/** A folder a first scan offers, by the name Electron's `app.getPath` knows it by. */
export type StudioImportRootName = "documents" | "desktop" | "downloads";

const DEFAULT_ROOTS: ReadonlyArray<{
  readonly label: string;
  readonly name: StudioImportRootName;
}> = [
  { label: "Documents", name: "documents" },
  { label: "Desktop", name: "desktop" },
  { label: "Downloads", name: "downloads" },
];

/**
 * The folders a first scan offers: Documents, Desktop and Downloads, where they exist. `pathOf`
 * says where this computer keeps each one: the main process gives Electron's `app.getPath`, which
 * follows a folder Windows has moved (OneDrive's backup puts Documents and Desktop under
 * `OneDrive\`). Without it, each is looked for by its name in the home folder.
 */
export async function defaultRoots(
  pathOf: (name: StudioImportRootName) => string = (name) =>
    NodePath.join(NodeOS.homedir(), DEFAULT_ROOTS.find((root) => root.name === name)!.label),
): Promise<ReadonlyArray<{ readonly label: string; readonly path: string }>> {
  const roots: { label: string; path: string }[] = [];
  for (const { label, name } of DEFAULT_ROOTS) {
    try {
      const path = pathOf(name);
      if ((await NodeFSP.stat(path)).isDirectory()) roots.push({ label, path });
    } catch {
      // Not on this computer, or the system could not say where it is.
    }
  }
  return roots;
}

/** A name in the folder nothing has yet: `part.step`, then `part (2).step`. */
async function freeName(folder: string, name: string): Promise<string> {
  const extension = NodePath.extname(name);
  const stem = name.slice(0, name.length - extension.length);
  for (let n = 1; ; n += 1) {
    const candidate = NodePath.join(folder, n === 1 ? name : `${stem} (${n})${extension}`);
    try {
      await NodeFSP.access(candidate);
    } catch {
      return candidate;
    }
  }
}

/** Copies files or folders into a project's folder, never over a file already there. */
export async function copyInto(
  sources: ReadonlyArray<string>,
  folder: string,
): Promise<ReadonlyArray<string>> {
  await NodeFSP.mkdir(folder, { recursive: true });
  const copied: string[] = [];
  for (const source of sources) {
    const target = await freeName(folder, NodePath.basename(source));
    await NodeFSP.cp(source, target, { recursive: true, errorOnExist: true, force: false });
    copied.push(target);
  }
  return copied;
}

/** What a backup leaves out: tools' caches, Studio's own scratch, and git's lock files. */
const BACKUP_SKIPPED = new Set([
  "node_modules",
  "__pycache__",
  ".venv",
  "venv",
  ".studio",
  ".DS_Store",
]);

export interface StudioBackup {
  /** Where the project's folders were backed up to. */
  readonly folder: string;
  /** Files copied this time: new, or changed since the last backup. */
  readonly copied: number;
}

/** Whether `inner` is `outer` or inside it. */
const isWithin = (outer: string, inner: string) => {
  const relation = NodePath.relative(outer, inner);
  return relation === "" || (!relation.startsWith("..") && !NodePath.isAbsolute(relation));
};

/** Whole seconds, as every file system a backup lands on keeps a file's time. */
const seconds = (ms: number) => Math.floor(ms / 1000);

/**
 * Backs a project's folders up into a folder the person chose (a Google Drive, Dropbox or iCloud
 * folder carries it off this computer from there): each folder under its own name, its version
 * history (`.git`) too, so the copy opens as the project. Only files new or changed since the last
 * backup are copied, their times kept so the next backup can tell; nothing in a backup is
 * deleted, so a file removed from the project stays in it.
 */
export async function backUp(
  sources: ReadonlyArray<string>,
  folder: string,
): Promise<StudioBackup> {
  const destination = NodePath.resolve(folder);
  if (sources.some((source) => isWithin(NodePath.resolve(source), destination))) {
    throw new Error("Choose a folder outside the project to back it up into.");
  }
  await NodeFSP.mkdir(destination, { recursive: true });
  let copied = 0;
  for (const source of sources) {
    const from = NodePath.resolve(source);
    await NodeFSP.cp(from, NodePath.join(destination, NodePath.basename(from)), {
      recursive: true,
      force: true,
      preserveTimestamps: true,
      filter: async (path, target) => {
        const name = NodePath.basename(path);
        if (BACKUP_SKIPPED.has(name) || name.endsWith(".lock")) return false;
        const stat = await NodeFSP.lstat(path);
        if (stat.isDirectory()) return true;
        const held = await NodeFSP.lstat(target).catch(() => null);
        if (held !== null) {
          if (held.size === stat.size && seconds(held.mtimeMs) === seconds(stat.mtimeMs)) {
            return false;
          }
          // Git keeps its objects read-only; a changed one is replaced, not refused.
          await NodeFSP.chmod(target, held.mode | 0o200).catch(() => undefined);
        }
        copied += 1;
        return true;
      },
    });
  }
  return { folder: destination, copied };
}
