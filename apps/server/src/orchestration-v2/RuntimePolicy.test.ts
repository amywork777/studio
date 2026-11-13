import { assert, it } from "@effect/vitest";
import {
  type ManagedPolicySummary,
  type ModelSelection,
  type OrchestrationV2AppThread,
  ProjectId,
  ProviderInstanceId,
  type RuntimeMode,
  type ServerProvider,
  type StudioProject,
  StudioProjectsError,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import type { ProviderInstance } from "@t3tools/provider-core/server/driver";
import { acpPermissionDisposition } from "@t3tools/provider-acp/server/clientPolicy";
import * as ServerSettings from "../serverSettings.ts";
import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";
import * as StudioProjects from "../studio/StudioProjects.ts";
import * as ProjectStore from "./ProjectStore.ts";
import * as RuntimePolicy from "./RuntimePolicy.ts";

const projectId = ProjectId.make("project:runtime-policy");
const providerInstanceId = ProviderInstanceId.make("codex");
const modelSelection = {
  instanceId: providerInstanceId,
  model: "gpt-5.5",
} satisfies ModelSelection;

function makeThread(input: {
  readonly now: DateTime.Utc;
  readonly worktreePath: string | null;
  readonly runtimeMode?: RuntimeMode;
  readonly projectId?: ProjectId;
}): OrchestrationV2AppThread {
  const threadId = ThreadId.make("thread:runtime-policy");
  return {
    createdBy: "user",
    creationSource: "web",
    id: threadId,
    projectId: input.projectId ?? projectId,
    title: "Runtime policy",
    providerInstanceId,
    modelSelection,
    runtimeMode: input.runtimeMode ?? "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: input.worktreePath,
    activeProviderThreadId: null,
    lineage: {
      parentThreadId: null,
      relationshipToParent: null,
      rootThreadId: threadId,
    },
    forkedFrom: null,
    createdAt: input.now,
    updatedAt: input.now,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    lastVisitedAt: null,
    deletedAt: null,
  };
}

const grokInstanceId = ProviderInstanceId.make("grok");
const antigravityInstanceId = ProviderInstanceId.make("antigravity");
const supportedRuntimeModesByInstance = new Map<ProviderInstanceId, ReadonlyArray<RuntimeMode>>([
  [grokInstanceId, ["approval-required", "auto", "full-access"]],
  [antigravityInstanceId, ["approval-required", "auto-accept-edits", "full-access"]],
]);
const providerInstanceFor = (instanceId: ProviderInstanceId) =>
  ({
    snapshot: {
      getSnapshot: Effect.succeed({
        supportedRuntimeModes: supportedRuntimeModesByInstance.get(instanceId),
      } as ServerProvider),
    },
  }) as ProviderInstance;

// A second project whose folder is in no Studio project.
const looseProjectId = ProjectId.make("project:runtime-policy-loose");
const workspaceRoots = new Map<ProjectId, string>([
  [projectId, "/project-root"],
  [looseProjectId, "/loose-root"],
]);

const layerProviderInstances = Layer.succeed(ProviderInstanceRegistry.ProviderInstanceRegistry, {
  getInstance: (instanceId) => Effect.succeed(providerInstanceFor(instanceId)),
  listInstances: Effect.succeed([]),
  listUnavailable: Effect.succeed([]),
  streamChanges: Stream.empty,
  subscribeChanges: Effect.never,
});

const layerProjects = Layer.mock(ProjectStore.ProjectStoreV2)({
  get: (id) =>
    Effect.succeedSome({
      projectId: id,
      title: "Project",
      workspaceRoot: workspaceRoots.get(id) ?? "/unknown",
      defaultModelSelection: null,
      defaultThreadEnvMode: null,
      hasCustomTitle: false,
      autoPull: false,
      faviconPath: null,
      projectIcon: null,
      scripts: [],
      pinnedAt: null,
      archivedAt: null,
      createdAt: "2026-06-21T00:00:00.000Z",
      updatedAt: "2026-06-21T00:00:00.000Z",
      deletedAt: null,
    }),
});

const layerWithPolicy = (policy?: ManagedPolicySummary) =>
  RuntimePolicy.layerFromProjectStore.pipe(
    Layer.provide(ServerSettings.layerTest({}, policy)),
    Layer.provide(layerProviderInstances),
    Layer.provide(layerProjects),
  );

const layerTest = layerWithPolicy();

it.layer(layerTest)("RuntimePolicyV2", (it) => {
  it.effect("asks for Antigravity command approval when a stored Auto thread falls back", () =>
    Effect.gen(function* () {
      const policy = yield* RuntimePolicy.RuntimePolicyV2;
      const now = yield* DateTime.now;
      const resolve = (runtimeMode: RuntimeMode) =>
        policy.resolve({
          thread: makeThread({ now, worktreePath: null, runtimeMode }),
          modelSelection: { instanceId: antigravityInstanceId, model: "test-model" },
        });
      const request = {
        sessionId: "session-1",
        toolCall: { toolCallId: "command-1", title: "Run command", kind: "execute" as const },
        options: [{ optionId: "allow", name: "Allow", kind: "allow_once" as const }],
      };
      const auto = yield* resolve("auto");
      assert.equal(auto.runtimeMode, "approval-required");
      assert.equal(acpPermissionDisposition(auto, request), "ask");
      assert.equal(acpPermissionDisposition(yield* resolve("auto-accept-edits"), request), "ask");
      assert.equal(acpPermissionDisposition(yield* resolve("full-access"), request), "allow");
    }),
  );

  it.effect("runs a mode the provider does not offer in Supervised", () =>
    Effect.gen(function* () {
      const policy = yield* RuntimePolicy.RuntimePolicyV2;
      const now = yield* DateTime.now;
      const modeFor = (instanceId: ProviderInstanceId, runtimeMode: RuntimeMode) =>
        policy
          .resolve({
            thread: makeThread({ now, worktreePath: null, runtimeMode }),
            modelSelection: { instanceId, model: "test-model" },
          })
          .pipe(Effect.map((resolved) => resolved.runtimeMode));

      assert.equal(yield* modeFor(grokInstanceId, "auto-accept-edits"), "approval-required");
      assert.equal(yield* modeFor(grokInstanceId, "auto"), "auto");
      assert.equal(yield* modeFor(grokInstanceId, "full-access"), "full-access");
      assert.equal(yield* modeFor(providerInstanceId, "auto-accept-edits"), "auto-accept-edits");
    }),
  );
});

it.layer(
  layerWithPolicy({
    organization: "Example Corp",
    lockedSettings: [],
    limits: { maxRuntimeMode: "auto-accept-edits" },
  }),
)("RuntimePolicyV2 under a runtime mode ceiling", (it) => {
  it.effect("refuses to start a turn above the ceiling, such as one resumed after a restart", () =>
    Effect.gen(function* () {
      const policy = yield* RuntimePolicy.RuntimePolicyV2;
      const now = yield* DateTime.now;
      const resolve = (runtimeMode: RuntimeMode) =>
        policy.resolve({
          thread: makeThread({ now, worktreePath: "/work", runtimeMode }),
          modelSelection,
        });

      const refused = yield* resolve("full-access").pipe(Effect.flip);
      assert.equal(refused._tag, "RuntimePolicyAboveCeilingError");
      assert.equal(
        refused.message,
        "Example Corp limits threads to Auto-accept edits. Switch this thread's mode to continue.",
      );
      const allowed = yield* resolve("auto-accept-edits");
      assert.equal(allowed.runtimeMode, "auto-accept-edits");
      assert.equal(allowed.maxRuntimeMode, "auto-accept-edits");
    }),
  );
});

const studioProject: StudioProject = {
  name: "Test rig",
  template: "part",
  brief: {
    purpose: "Hold the sensor steady",
    requirements: "",
    units: "mm",
    material: "6061 aluminum",
    process: "CNC machining",
    quantity: "2",
    links: "",
    notes: "",
  },
  folders: ["/project-root/", "/project-cad", "/project-firmware"],
  createdAt: "2026-10-01T00:00:00.000Z",
};

const layerWithStudioProject = layerWithPolicy().pipe(
  Layer.provide(
    Layer.mock(StudioProjects.StudioProjects)({
      list: Effect.succeed({
        folder: "/studio",
        git: true,
        projects: { rig: studioProject },
        trashed: {},
      }),
    }),
  ),
);

it.layer(layerWithStudioProject)("RuntimePolicyV2 Studio projects", (it) => {
  it.effect("gives a thread in a Studio project folder the other folders and the brief", () =>
    Effect.gen(function* () {
      const policy = yield* RuntimePolicy.RuntimePolicyV2;
      const now = yield* DateTime.now;
      const resolved = yield* policy.resolve({
        thread: makeThread({ now, worktreePath: null }),
        modelSelection,
      });
      assert.equal(resolved.cwd, "/project-root");
      assert.deepEqual(resolved.additionalDirectories, [
        "/project-cad",
        "/project-firmware",
        "/studio/rig",
      ]);
      assert.include(resolved.projectContext ?? "", "# Studio project: Test rig");
      assert.include(resolved.projectContext ?? "", "- Material: 6061 aluminum");
      assert.include(resolved.projectContext ?? "", "kept in `/studio/rig/project.json`");
    }),
  );

  it.effect("matches a worktree thread by its project's folder", () =>
    Effect.gen(function* () {
      const policy = yield* RuntimePolicy.RuntimePolicyV2;
      const now = yield* DateTime.now;
      const resolved = yield* policy.resolve({
        thread: makeThread({ now, worktreePath: "/project-worktree" }),
        modelSelection,
      });
      assert.equal(resolved.cwd, "/project-worktree");
      assert.deepEqual(resolved.additionalDirectories, [
        "/project-cad",
        "/project-firmware",
        "/studio/rig",
      ]);
      assert.isDefined(resolved.projectContext);
    }),
  );

  it.effect("leaves both off for a thread whose folder is in no Studio project", () =>
    Effect.gen(function* () {
      const policy = yield* RuntimePolicy.RuntimePolicyV2;
      const now = yield* DateTime.now;
      const resolved = yield* policy.resolve({
        thread: makeThread({ now, worktreePath: null, projectId: looseProjectId }),
        modelSelection,
      });
      assert.equal(resolved.cwd, "/loose-root");
      assert.notProperty(resolved, "additionalDirectories");
      assert.notProperty(resolved, "projectContext");
    }),
  );
});

const layerWithUnreadableProjects = layerWithPolicy().pipe(
  Layer.provide(
    Layer.mock(StudioProjects.StudioProjects)({
      list: Effect.fail(new StudioProjectsError({ failure: "read", folder: "/studio" })),
    }),
  ),
);

it.layer(layerWithUnreadableProjects)("RuntimePolicyV2 unreadable Studio projects", (it) => {
  it.effect("still resolves the turn without a Studio project", () =>
    Effect.gen(function* () {
      const policy = yield* RuntimePolicy.RuntimePolicyV2;
      const now = yield* DateTime.now;
      const resolved = yield* policy.resolve({
        thread: makeThread({ now, worktreePath: null }),
        modelSelection,
      });
      assert.equal(resolved.cwd, "/project-root");
      assert.notProperty(resolved, "additionalDirectories");
      assert.notProperty(resolved, "projectContext");
    }),
  );
});
