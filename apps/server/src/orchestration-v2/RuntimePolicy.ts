import {
  isRuntimeModeAbove,
  managedRuntimeModeCeilingMessage,
  ModelSelection,
  OrchestrationV2AppThread,
  ProjectId,
  ProviderInstanceId,
  RuntimeMode,
  ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  studioOtherFolders,
  studioProjectAt,
  studioProjectContext,
} from "@t3tools/shared/studioProjects";

import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";
import * as StudioProjects from "../studio/StudioProjects.ts";
import * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as ServerSettings from "../serverSettings.ts";
import * as ProjectStore from "./ProjectStore.ts";

export class RuntimePolicyResolveError extends Schema.TaggedError<RuntimePolicyResolveError>()(
  "RuntimePolicyResolveError",
  {
    projectId: ProjectId,
    providerInstanceId: ProviderInstanceId,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Failed to resolve runtime policy for provider instance ${this.providerInstanceId} in project ${this.projectId}.`;
  }
}

/**
 * A turn would start in a mode above the policy's ceiling. The orchestrator refuses those when
 * they are dispatched; this catches the ones it never saw, such as a run resumed after a restart
 * on a thread whose mode predates the policy.
 */
export class RuntimePolicyAboveCeilingError extends Schema.TaggedError<RuntimePolicyAboveCeilingError>()(
  "RuntimePolicyAboveCeilingError",
  {
    threadId: ThreadId,
    runtimeMode: RuntimeMode,
    maxRuntimeMode: RuntimeMode,
    organization: Schema.String,
  },
) {
  override get message(): string {
    return `${managedRuntimeModeCeilingMessage(this.organization, this.maxRuntimeMode)} Switch this thread's mode to continue.`;
  }
}

export const isRuntimePolicyAboveCeilingError = Schema.is(RuntimePolicyAboveCeilingError);

export const RuntimePolicyV2Error = Schema.Union([
  RuntimePolicyResolveError,
  RuntimePolicyAboveCeilingError,
]);
export type RuntimePolicyV2Error = typeof RuntimePolicyV2Error.Type;

export const RuntimePolicyV2Override = Schema.Struct({
  cwd: Schema.optional(Schema.String),
  approvalPolicy: Schema.optional(Schema.Unknown),
  sandboxPolicy: Schema.optional(Schema.Unknown),
  reasoningEffort: Schema.optional(Schema.String),
});
export type RuntimePolicyV2Override = typeof RuntimePolicyV2Override.Type;

export interface RuntimePolicyV2ResolveInput {
  readonly thread: OrchestrationV2AppThread;
  readonly modelSelection: ModelSelection;
}

export interface RuntimePolicyV2Shape {
  readonly resolve: (
    input: RuntimePolicyV2ResolveInput,
  ) => Effect.Effect<ProviderAdapter.ProviderAdapterV2RuntimePolicy, RuntimePolicyV2Error>;
}

export class RuntimePolicyV2 extends Context.Service<RuntimePolicyV2, RuntimePolicyV2Shape>()(
  "t3/orchestration-v2/RuntimePolicy/RuntimePolicyV2",
) {}

export const layer: Layer.Layer<RuntimePolicyV2> = Layer.succeed(RuntimePolicyV2, {
  resolve: Effect.fn("RuntimePolicyV2.resolve")(function (input) {
    return Effect.succeed({
      runtimeMode: input.thread.runtimeMode,
      interactionMode: input.thread.interactionMode,
      cwd: input.thread.worktreePath,
    });
  }),
});

function providerRuntimeMode(
  runtimeMode: RuntimeMode,
  supportedRuntimeModes: ReadonlyArray<RuntimeMode> | undefined,
): RuntimeMode {
  return supportedRuntimeModes === undefined ||
    supportedRuntimeModes.length === 0 ||
    supportedRuntimeModes.includes(runtimeMode)
    ? runtimeMode
    : "approval-required";
}

const refuseAboveCeiling = (
  managedPolicy: ServerSettings.ServerSettingsService["Service"]["managedPolicy"],
  thread: OrchestrationV2AppThread,
) => {
  const maxRuntimeMode = managedPolicy?.limits?.maxRuntimeMode;
  return managedPolicy !== undefined &&
    maxRuntimeMode !== undefined &&
    isRuntimeModeAbove(thread.runtimeMode, maxRuntimeMode)
    ? Effect.fail(
        new RuntimePolicyAboveCeilingError({
          threadId: thread.id,
          runtimeMode: thread.runtimeMode,
          maxRuntimeMode,
          organization: managedPolicy.organization,
        }),
      )
    : Effect.void;
};

/** Lays the policy's ceiling over another runtime policy, as `layerFromProjectStore` does. */
export const layerEnforcingCeiling: Layer.Layer<
  RuntimePolicyV2,
  never,
  RuntimePolicyV2 | ServerSettings.ServerSettingsService
> = Layer.effect(
  RuntimePolicyV2,
  Effect.gen(function* () {
    const base = yield* RuntimePolicyV2;
    const { managedPolicy } = yield* ServerSettings.ServerSettingsService;
    return RuntimePolicyV2.of({
      resolve: Effect.fn("RuntimePolicyV2.resolveWithinCeiling")(function* (input) {
        yield* refuseAboveCeiling(managedPolicy, input.thread);
        return yield* base.resolve(input);
      }),
    });
  }),
);

export const layerFromProjectStore: Layer.Layer<
  RuntimePolicyV2,
  never,
  | ProjectStore.ProjectStoreV2
  | ProviderInstanceRegistry.ProviderInstanceRegistry
  | ServerSettings.ServerSettingsService
> = Layer.effect(
  RuntimePolicyV2,
  Effect.gen(function* () {
    const projects = yield* ProjectStore.ProjectStoreV2;
    const providerInstances = yield* ProviderInstanceRegistry.ProviderInstanceRegistry;
    // Optional so tests that assemble this layer by hand need no projects stub;
    // the production composition always provides it.
    const studioProjects = yield* Effect.serviceOption(StudioProjects.StudioProjects);

    const projectWorkspaceRoot = (input: RuntimePolicyV2ResolveInput) =>
      projects.get(input.thread.projectId).pipe(
        Effect.mapError(
          (cause) =>
            new RuntimePolicyResolveError({
              projectId: input.thread.projectId,
              providerInstanceId: input.modelSelection.instanceId,
              cause,
            }),
        ),
        Effect.flatMap(
          Option.match({
            onNone: () =>
              Effect.fail(
                new RuntimePolicyResolveError({
                  projectId: input.thread.projectId,
                  providerInstanceId: input.modelSelection.instanceId,
                  cause: "Project not found.",
                }),
              ),
            onSome: (project) => Effect.succeed(project.workspaceRoot),
          }),
        ),
      );

    /**
     * What the thread's Studio project adds to its turns: the project's other
     * folders, its own record's folder (so the agent can change the setup when
     * asked, `studioProjectContext`), and its context. Matched by the
     * project's folder, so a worktree thread gets its project's. Projects that
     * cannot be read add nothing rather than fail the turn.
     */
    const studioProjectPolicy = Effect.fn("RuntimePolicyV2.studioProjectPolicy")(function* (
      input: RuntimePolicyV2ResolveInput,
      workspaceRoot: string | null,
    ) {
      if (Option.isNone(studioProjects)) return {};
      return yield* Effect.gen(function* () {
        const { folder, projects } = yield* studioProjects.value.list;
        if (Object.keys(projects).length === 0) return {};
        const root = workspaceRoot ?? (yield* projectWorkspaceRoot(input));
        const match = studioProjectAt(projects, root);
        if (match === null) return {};
        // The project's own folder under Studio's projects folder (an absolute path the server made).
        const record = `${folder.replace(/[\\/]+$/, "")}/${match.id}`;
        return {
          additionalDirectories: [...studioOtherFolders(match.project, root), record],
          projectContext: studioProjectContext(match.project, root, `${record}/project.json`),
        };
      }).pipe(
        Effect.catch((cause) =>
          Effect.logWarning("Could not resolve the thread's Studio project; leaving it out.", {
            threadId: input.thread.id,
            cause,
          }).pipe(Effect.as({})),
        ),
      );
    });

    // The same ceiling the orchestrator enforces, fixed for the server's life.
    const { managedPolicy } = yield* ServerSettings.ServerSettingsService;
    const maxRuntimeMode = managedPolicy?.limits?.maxRuntimeMode;
    return RuntimePolicyV2.of({
      resolve: Effect.fn("RuntimePolicyV2.resolve")(function* (input) {
        yield* refuseAboveCeiling(managedPolicy, input.thread);
        const instance = yield* providerInstances.getInstance(input.modelSelection.instanceId);
        const supportedRuntimeModes =
          instance === undefined
            ? undefined
            : (yield* instance.snapshot.getSnapshot).supportedRuntimeModes;
        const workspaceRoot =
          input.thread.worktreePath === null ? yield* projectWorkspaceRoot(input) : null;
        const studio = yield* studioProjectPolicy(input, workspaceRoot);
        return ProviderAdapter.ProviderAdapterV2RuntimePolicy.make({
          runtimeMode: providerRuntimeMode(input.thread.runtimeMode, supportedRuntimeModes),
          interactionMode: input.thread.interactionMode,
          cwd: input.thread.worktreePath ?? workspaceRoot,
          ...studio,
          ...(maxRuntimeMode === undefined ? {} : { maxRuntimeMode }),
        });
      }),
    });
  }),
);

export function layerWithOverride(
  override: RuntimePolicyV2Override,
): Layer.Layer<RuntimePolicyV2, never, RuntimePolicyV2> {
  return Layer.effect(
    RuntimePolicyV2,
    Effect.gen(function* () {
      const base = yield* RuntimePolicyV2;
      return {
        resolve: (input) =>
          base.resolve(input).pipe(
            Effect.map((policy) =>
              ProviderAdapter.ProviderAdapterV2RuntimePolicy.make({
                ...policy,
                ...(override.cwd === undefined ? {} : { cwd: override.cwd }),
                ...(override.approvalPolicy === undefined
                  ? {}
                  : { approvalPolicy: override.approvalPolicy }),
                ...(override.sandboxPolicy === undefined
                  ? {}
                  : { sandboxPolicy: override.sandboxPolicy }),
                ...(override.reasoningEffort === undefined
                  ? {}
                  : { reasoningEffort: override.reasoningEffort }),
              }),
            ),
          ),
      } satisfies RuntimePolicyV2Shape;
    }),
  );
}
