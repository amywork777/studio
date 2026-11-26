import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";

import { useRefreshOnReturn } from "~/hooks/useRefreshOnReturn";
import { useStableCallback } from "~/hooks/useStableCallback";
import { useWorkspaceMutationRefresh } from "~/hooks/useWorkspaceMutationRefresh";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { projectEnvironment } from "~/state/projects";
import {
  type CheckResult,
  isCheckResultPath,
  isNamedStudyPath,
  parseCheckResult,
} from "./checkResults";

/** One of the project's folders: its files and the check results among them. */
export interface FolderChecks {
  readonly root: string;
  /** The folder's files, relative to it; null while it is being read. */
  readonly paths: ReadonlyArray<string> | null;
  readonly results: ReadonlyArray<CheckResult>;
}

interface Target {
  readonly environmentId: EnvironmentId;
  readonly folders: ReadonlyArray<string>;
}

const listing = (environmentId: EnvironmentId, root: string) =>
  projectEnvironment.listEntries({ environmentId, input: { cwd: root } });

const reading = (environmentId: EnvironmentId, root: string, relativePath: string) =>
  projectEnvironment.readFile({ environmentId, input: { cwd: root, relativePath } });

/**
 * Each folder as last read, by environment and folder, for the session: past a listing's idle time
 * the Overview draws from this while it is read again, as `useFolderModels` keeps its models and
 * `usePictures` its pictures, so a page shown again does not go empty.
 */
const lastRead = new Map<string, FolderChecks>();

// React cannot subscribe to a list of atoms whose length changes, so every folder's listing and
// every result read happen inside one derived atom keyed by the folders.
const checksFamily = Atom.family((key: string) =>
  Atom.make((get): ReadonlyArray<FolderChecks> => {
    const { environmentId, folders } = JSON.parse(key) as Target;
    return folders.map((root) => {
      const entries = Option.getOrNull(
        AsyncResult.value(get(listing(environmentId, root))),
      )?.entries;
      const held = `${environmentId}\n${root}`;
      if (entries === undefined) return lastRead.get(held) ?? { root, paths: null, results: [] };
      const paths = entries
        .filter((entry) => entry.kind === "file" && entry.ignored !== true)
        .map((entry) => entry.path);
      const present = new Set(paths);
      const results = paths
        .filter((path) => isCheckResultPath(path) || isNamedStudyPath(path, present))
        .flatMap((path) => {
          const file = Option.getOrNull(AsyncResult.value(get(reading(environmentId, root, path))));
          const result =
            file === null || file.truncated
              ? null
              : parseCheckResult(path, file.contents, file.modifiedAt);
          return result === null ? [] : [result];
        });
      const folder = { root, paths, results };
      lastRead.set(held, folder);
      return folder;
    });
  }).pipe(Atom.withLabel(`studio:project-checks:${key}`)),
);

/**
 * Every folder of a project with its files and the checks its parts have been
 * through (`checkResults.ts`), read again when the thread's agent changes
 * files, so a check it just ran shows.
 */
export function useProjectChecks(input: {
  readonly environmentId: EnvironmentId;
  readonly folders: ReadonlyArray<string>;
  /** The thread's workspace changes: a new result appears, a rerun replaces one. */
  readonly mutationId: string | null;
}): ReadonlyArray<FolderChecks> {
  const key = JSON.stringify({
    environmentId: input.environmentId,
    folders: input.folders,
  } satisfies Target);
  const folders = useAtomValue(checksFamily(key));
  const refresh = useStableCallback(() => {
    const { environmentId, folders: roots } = JSON.parse(key) as Target;
    for (const root of roots) appAtomRegistry.refresh(listing(environmentId, root));
    for (const folder of appAtomRegistry.get(checksFamily(key))) {
      for (const result of folder.results) {
        appAtomRegistry.refresh(reading(environmentId, folder.root, result.path));
      }
    }
  });
  useWorkspaceMutationRefresh({
    mutationId: input.mutationId,
    refresh,
    resourceKey: `project-checks:${key}`,
  });
  // Files added or removed outside Studio (in Finder, by another app) show when the user comes back.
  useRefreshOnReturn(refresh);
  return folders;
}
