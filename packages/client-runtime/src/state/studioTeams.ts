import { WS_METHODS, type EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "./runtime.ts";

/** Bumped after every Teams call that changes something, so the team, lists and folders re-read. */
const studioTeamsRevision = Atom.family((environmentId: EnvironmentId) =>
  Atom.make(0).pipe(
    Atom.keepAlive,
    Atom.withLabel(`environment-data:studio-teams:revision:${environmentId}`),
  ),
);

/**
 * Studio Teams on an environment: the person signed in there and their teams, the team's projects,
 * one folder's check-out, and the calls that change them. Each client binds them to its own runtime.
 */
export function createStudioTeamsEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const refresh = ({ environmentId }: { readonly environmentId: EnvironmentId }) =>
    studioTeamsRevision(environmentId);
  const scheduler = createAtomCommandScheduler();
  const settled = (
    { environmentId }: { readonly environmentId: EnvironmentId },
    registry: { readonly update: (atom: Atom.Writable<number>, f: (n: number) => number) => void },
  ) => Effect.sync(() => registry.update(studioTeamsRevision(environmentId), (value) => value + 1));
  const serial = {
    mode: "serial" as const,
    key: ({ environmentId }: { readonly environmentId: EnvironmentId }) => environmentId,
  };
  return {
    status: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:studio-teams:status",
      tag: WS_METHODS.studioTeamsStatus,
      staleTimeMs: 60_000,
      refreshTrigger: refresh,
    }),
    projects: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:studio-teams:projects",
      tag: WS_METHODS.studioTeamsProjects,
      staleTimeMs: 30_000,
      refreshTrigger: refresh,
    }),
    folderStatus: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:studio-teams:folder-status",
      tag: WS_METHODS.studioTeamsFolderStatus,
      staleTimeMs: 30_000,
      refreshTrigger: refresh,
    }),
    signInStart: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:studio-teams:sign-in-start",
      tag: WS_METHODS.studioTeamsSignInStart,
      scheduler,
      concurrency: serial,
      onSettled: settled,
    }),
    signInCheck: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:studio-teams:sign-in-check",
      tag: WS_METHODS.studioTeamsSignInCheck,
      scheduler,
      concurrency: serial,
      onSettled: settled,
    }),
    signOut: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:studio-teams:sign-out",
      tag: WS_METHODS.studioTeamsSignOut,
      scheduler,
      concurrency: serial,
      onSettled: settled,
    }),
    create: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:studio-teams:create",
      tag: WS_METHODS.studioTeamsCreate,
      scheduler,
      concurrency: serial,
      onSettled: settled,
    }),
    invite: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:studio-teams:invite",
      tag: WS_METHODS.studioTeamsInvite,
      scheduler,
      concurrency: serial,
      onSettled: settled,
    }),
    remove: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:studio-teams:remove",
      tag: WS_METHODS.studioTeamsRemove,
      scheduler,
      concurrency: serial,
      onSettled: settled,
    }),
    share: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:studio-teams:share",
      tag: WS_METHODS.studioTeamsShare,
      scheduler,
      concurrency: serial,
      onSettled: settled,
    }),
    get: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:studio-teams:get",
      tag: WS_METHODS.studioTeamsGet,
      scheduler,
      concurrency: serial,
      onSettled: settled,
    }),
    checkOut: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:studio-teams:check-out",
      tag: WS_METHODS.studioTeamsCheckOut,
      scheduler,
      concurrency: serial,
      onSettled: settled,
    }),
    checkIn: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:studio-teams:check-in",
      tag: WS_METHODS.studioTeamsCheckIn,
      scheduler,
      concurrency: serial,
      onSettled: settled,
    }),
    getLatest: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:studio-teams:get-latest",
      tag: WS_METHODS.studioTeamsGetLatest,
      scheduler,
      concurrency: serial,
      onSettled: settled,
    }),
    release: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:studio-teams:release",
      tag: WS_METHODS.studioTeamsRelease,
      scheduler,
      concurrency: serial,
      onSettled: settled,
    }),
    reviewComment: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:studio-teams:review-comment",
      tag: WS_METHODS.studioTeamsReviewComment,
      scheduler,
      concurrency: serial,
      onSettled: settled,
    }),
    reviewDecide: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:studio-teams:review-decide",
      tag: WS_METHODS.studioTeamsReviewDecide,
      scheduler,
      concurrency: serial,
      onSettled: settled,
    }),
    releaseVersion: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:studio-teams:release-version",
      tag: WS_METHODS.studioTeamsReleaseVersion,
      scheduler,
      concurrency: serial,
      onSettled: settled,
    }),
  };
}
