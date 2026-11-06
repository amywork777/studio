import { useCallback, useState } from "react";

/**
 * Where a project was backed up to: a private GitHub repository Studio made for it, or a folder
 * the person chose (a Google Drive, Dropbox or iCloud folder carries it off the Mac).
 */
export type BackupPlace =
  | { readonly kind: "github"; readonly repository: string }
  | { readonly kind: "folder"; readonly folder: string };

/** A project's last backup, on this computer. */
export interface LastBackup {
  readonly place: BackupPlace;
  readonly at: number;
}

const KEY = "studio:backups";

/** The stored backups by project id; an entry from before GitHub (`{ folder, at }`) is a folder. */
function readBackups(): Record<string, LastBackup> {
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "{}") as unknown;
    if (stored === null || typeof stored !== "object") return {};
    return Object.fromEntries(
      Object.entries(stored as Record<string, unknown>).flatMap(([id, entry]) => {
        if (entry === null || typeof entry !== "object") return [];
        const { place, folder, at } = entry as { place?: unknown; folder?: unknown; at?: unknown };
        if (typeof at !== "number") return [];
        if (typeof folder === "string") return [[id, { place: { kind: "folder", folder }, at }]];
        return place !== null && typeof place === "object" ? [[id, { place, at }]] : [];
      }),
    ) as Record<string, LastBackup>;
  } catch {
    return {};
  }
}

/** A project's last backup, and recording a new one. */
export function useLastBackup(projectId: string | null) {
  const [backups, setBackups] = useState(readBackups);
  const remember = useCallback(
    (place: BackupPlace) => {
      if (projectId === null) return;
      const next = { ...readBackups(), [projectId]: { place, at: Date.now() } };
      setBackups(next);
      try {
        globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
      } catch {
        // Backed up all the same; where is asked again next time.
      }
    },
    [projectId],
  );
  return { last: projectId === null ? null : (backups[projectId] ?? null), remember };
}

/** The folder a project backs up to: one named for it inside the folder the person chose. */
export function backupFolder(chosen: string, projectName: string): string {
  const name = projectName.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Project";
  return `${chosen.replace(/[\\/]+$/, "")}/${name}`;
}

/** Where a backup went, as a person knows it: "GitHub, amy/roomba" or "My Drive/Roomba". */
export function backupPlaceLabel(place: BackupPlace): string {
  return place.kind === "github"
    ? `GitHub, ${place.repository}`
    : place.folder.split(/[\\/]/).filter(Boolean).slice(-2).join("/");
}

/** The repository Studio makes for a project: the person's account, the project's name. */
export function githubRepository(account: string, projectName: string): string {
  const name =
    projectName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project";
  return `${account}/${name}`;
}

/** What the GitHub choice says: where the copy is and, once read, whether it is up to date. */
export function githubDescription(input: {
  readonly repository: string | null;
  readonly account: string | null;
  /** Whether the online copy holds everything here; null until that is read. */
  readonly synced: boolean | null;
}): string {
  const versions = "Each backup is a version you can go back to.";
  if (input.repository === null) {
    const owner = input.account === null ? "" : `, ${input.account}`;
    return `A private copy on your GitHub account${owner}. ${versions}`;
  }
  const state = input.synced === null ? "" : input.synced ? "Synced. " : "Not synced. ";
  return `Into ${input.repository}, private. ${state}${versions}`;
}

/**
 * Whether the project can be backed up to GitHub, and if not why, in words. Studio pushes only to
 * a repository it made for the backup: a folder that already has a repository of its own (a code
 * project brought in, say) is left to it.
 */
export function githubChoice(input: {
  /** GitHub is set up on this computer, and the account it is signed in as. */
  readonly signedIn: boolean;
  readonly account: string | null;
  readonly folders: number;
  /** The folder's git status; null while it is read. */
  readonly folder: { readonly isRepo: boolean; readonly hasRemote: boolean } | null;
  /** The repository an earlier backup made, if any. */
  readonly backedUpTo: string | null;
}): { readonly available: boolean; readonly note: string | null; readonly signIn: boolean } {
  // In plain words, not the GitHub tool's own hints (its commands): Set up GitHub shows where.
  if (!input.signedIn || input.account === null) {
    return { available: false, note: "Not signed in to GitHub on this Mac yet.", signIn: true };
  }
  const not = (note: string | null) => ({ available: false, note, signIn: false });
  if (input.folders !== 1) return not("GitHub backup is for a project of one folder.");
  if (input.folder === null) return not(null);
  if (!input.folder.isRepo) return not("This folder has no version history to send yet.");
  if (input.folder.hasRemote && input.backedUpTo === null) {
    return not("This folder already has a repository of its own, so Studio leaves it alone.");
  }
  return { available: true, note: null, signIn: false };
}
