import { WS_METHODS, type EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "./runtime.ts";

/** Bumped after every save so the list re-reads. */
const studioProjectsRevision = Atom.family((environmentId: EnvironmentId) =>
  Atom.make(0).pipe(
    Atom.keepAlive,
    Atom.withLabel(`environment-data:studio-projects:revision:${environmentId}`),
  ),
);

/** Bumped after every send so a folder's Synced or Not synced re-reads. */
const studioSyncRevision = Atom.family((environmentId: EnvironmentId) =>
  Atom.make(0).pipe(
    Atom.keepAlive,
    Atom.withLabel(`environment-data:studio-sync:revision:${environmentId}`),
  ),
);

/**
 * An environment's Studio projects (one folder and repository each on that
 * machine), the save that writes or renames one, Trash, which takes one out, and the send of a
 * folder to its online copy with whether that copy is up to date. Each client binds them to its
 * own connection runtime.
 */
export function createStudioProjectsEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    list: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:studio-projects:list",
      tag: WS_METHODS.studioProjectsList,
      staleTimeMs: 30_000,
      refreshTrigger: ({ environmentId }) => studioProjectsRevision(environmentId),
    }),
    /** Saves one project whole; saves run in order per environment. */
    save: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:studio-projects:save",
      tag: WS_METHODS.studioProjectsSave,
      scheduler: createAtomCommandScheduler(),
      concurrency: { mode: "serial", key: ({ environmentId }) => environmentId },
      onSettled: ({ environmentId }, registry) =>
        Effect.sync(() =>
          registry.update(studioProjectsRevision(environmentId), (value) => value + 1),
        ),
    }),
    /** Moves a project to Trash, restores it, or deletes its record there forever; in turn with saves. */
    trash: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:studio-projects:trash",
      tag: WS_METHODS.studioProjectsTrash,
      scheduler: createAtomCommandScheduler(),
      concurrency: { mode: "serial", key: ({ environmentId }) => environmentId },
      onSettled: ({ environmentId }, registry) =>
        Effect.sync(() =>
          registry.update(studioProjectsRevision(environmentId), (value) => value + 1),
        ),
    }),
    /** Whether a folder's online copy holds everything here. */
    syncStatus: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:studio-sync:status",
      tag: WS_METHODS.studioSyncStatus,
      staleTimeMs: 30_000,
      refreshTrigger: ({ environmentId }) => studioSyncRevision(environmentId),
    }),
    /** Sends a folder and every Version; one at a time per folder, as a first send takes a while. */
    syncSend: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:studio-sync:send",
      tag: WS_METHODS.studioSyncSend,
      scheduler: createAtomCommandScheduler(),
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) => `${environmentId}:${input.cwd}`,
      },
      onSettled: ({ environmentId }, registry) =>
        Effect.sync(() => registry.update(studioSyncRevision(environmentId), (value) => value + 1)),
    }),
  };
}
