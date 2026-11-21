import { assert, it } from "@effect/vitest";
import {
  type ModelSelection,
  type OrchestrationV2AppThread,
  ProjectId,
  ProviderInstanceId,
  type ServerProvider,
  type StudioProject,
  StudioProjectsError,
  ThreadId,
} from "@t3tools/contracts";
import type { ProviderInstance } from "@t3tools/provider-core/server/driver";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as RuntimePolicy from "../orchestration-v2/RuntimePolicy.ts";
import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as StudioProjects from "./StudioProjects.ts";

const projectId = ProjectId.make("project:runtime-policy");
// A second project whose folder is in no Studio project.
const looseProjectId = ProjectId.make("project:runtime-policy-loose");
const workspaceRoots = new Map<ProjectId, string>([
  [projectId, "/project-root"],
  [looseProjectId, "/loose-root"],
]);
const providerInstanceId = ProviderInstanceId.make("codex");
const modelSelection = {
  instanceId: providerInstanceId,
  model: "gpt-5.5",
} satisfies ModelSelection;

function makeThread(input: {
  readonly now: DateTime.Utc;
  readonly worktreePath: string | null;
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
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: input.worktreePath,
    activeProviderThreadId: null,
    lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
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

const layerRuntimePolicy = RuntimePolicy.layerFromProjectStore.pipe(
  Layer.provide(ServerSettings.layerTest({ titleBlockCompany: "Rig Co", titleBlockDrawnBy: "" })),
  Layer.provide(
    Layer.succeed(ProviderInstanceRegistry.ProviderInstanceRegistry, {
      getInstance: () =>
        Effect.succeed({
          snapshot: { getSnapshot: Effect.succeed({} as ServerProvider) },
        } as ProviderInstance),
      listInstances: Effect.succeed([]),
      listUnavailable: Effect.succeed([]),
      streamChanges: Stream.empty,
      subscribeChanges: Effect.never,
    }),
  ),
  Layer.provide(
    Layer.mock(ProjectStore.ProjectStoreV2)({
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
    }),
  ),
);

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

const layerWithStudioProject = layerRuntimePolicy.pipe(
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
      // The person's title block, from Settings, read on the turn.
      assert.include(resolved.projectContext ?? "", '`company="Rig Co"`');
      assert.include(resolved.projectContext ?? "", "Drawn by: not set");
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

const layerWithUnreadableProjects = layerRuntimePolicy.pipe(
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
