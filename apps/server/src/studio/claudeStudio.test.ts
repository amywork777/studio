import { assert, describe, it } from "@effect/vitest";
import { ProviderInstanceId, type ModelSelection } from "@t3tools/contracts";
import * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as ClaudeAdapterV2 from "../orchestration-v2/Adapters/ClaudeAdapterV2.ts";

const CLAUDE_TEST_MODEL_SELECTION = {
  instanceId: ProviderInstanceId.make(ClaudeAdapterV2.CLAUDE_PROVIDER),
  model: "claude-sonnet-4-6",
  options: [{ id: "effort", value: "ultrathink" }],
} satisfies ModelSelection;
const CLAUDE_TEST_RUNTIME_POLICY = ProviderAdapter.ProviderAdapterV2RuntimePolicy.make({
  runtimeMode: "full-access",
  interactionMode: "default",
  cwd: "/workspace",
});

describe("A Studio project's Claude thread", () => {
  it("works in a Studio project's other folders and is told about the project", () => {
    const projectContext = "# Studio project: Test rig\n\n- Material: 6061 aluminum";
    const options = ClaudeAdapterV2.makeClaudeQueryOptions({
      modelSelection: CLAUDE_TEST_MODEL_SELECTION,
      nativeThreadId: "native-thread-studio-project",
      resume: false,
      cwd: "/workspace",
      attachmentsDir: "/attachments",
      additionalDirectories: ["/workspace-cad", "/workspace-firmware"],
      projectContext,
    });

    assert.equal(options.cwd, "/workspace");
    assert.includeMembers(options.additionalDirectories ?? [], [
      "/workspace-cad",
      "/workspace-firmware",
      "/attachments",
    ]);
    const systemPrompt = options.systemPrompt as { readonly append?: string };
    assert.isTrue(systemPrompt.append?.endsWith(`\n\n${projectContext}`));
    // The person's own ~/.claude settings stay out; a thread outside a project keeps them.
    assert.deepEqual(options.settingSources, ["project", "local"]);
    const outside = ClaudeAdapterV2.makeClaudeQueryOptions({
      modelSelection: CLAUDE_TEST_MODEL_SELECTION,
      nativeThreadId: "native-thread-plain",
      resume: false,
      cwd: "/workspace",
    });
    assert.isUndefined(outside.settingSources);
  });

  it("reopens the live query when the Studio project changes", () => {
    const queryPolicy = ClaudeAdapterV2.claudeRuntimeQueryPolicyForRuntimePolicy(
      CLAUDE_TEST_RUNTIME_POLICY,
    );
    const keyFor = (
      studioProject: Parameters<typeof ClaudeAdapterV2.claudeEffectiveQueryPolicyKey>[2],
    ) => ClaudeAdapterV2.claudeEffectiveQueryPolicyKey(queryPolicy, {}, studioProject);
    const project = {
      additionalDirectories: ["/workspace-cad"],
      projectContext: "# Studio project: Test rig",
    };

    assert.equal(keyFor(project), keyFor({ ...project }));
    assert.notEqual(keyFor(project), keyFor({}));
    assert.notEqual(keyFor(project), keyFor({ ...project, additionalDirectories: [] }));
    assert.notEqual(
      keyFor(project),
      keyFor({ ...project, projectContext: "# Studio project: Renamed rig" }),
    );
  });
});
