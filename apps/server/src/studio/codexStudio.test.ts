import { assert, describe, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as CodexAdapterV2 from "../orchestration-v2/Adapters/CodexAdapterV2.ts";
import * as CodexStudio from "./codexStudio.ts";

describe("A Studio project's Codex thread", () => {
  it.effect("lets Codex write a Studio project's other folders and tells it the brief", () =>
    Effect.gen(function* () {
      const modelSelection = { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" };
      const build = (
        runtimeMode: "approval-required" | "auto-accept-edits" | "auto" | "full-access",
      ) =>
        CodexAdapterV2.buildCodexTurnStartParams({
          nativeThreadId: `native-studio-${runtimeMode}`,
          codexInput: [{ type: "text", text: "add a mounting hole" }],
          runtimePolicy: {
            runtimeMode,
            interactionMode: "default",
            cwd: "/workspace",
            additionalDirectories: ["/workspace-cad"],
            projectContext: "# Studio project: Test rig",
          },
          modelSelection,
          hasT3Mcp: false,
        });

      const auto = yield* build("auto");
      assert.deepEqual(auto.sandboxPolicy, {
        type: "workspaceWrite",
        writableRoots: ["/workspace-cad"],
      });
      // Without T3's MCP server the project context still goes in, alone.
      assert.deepEqual(auto.additionalContext, {
        t3_code_project: { kind: "application", value: "# Studio project: Test rig" },
      });
      // Read-only and full-access sandboxes are left as they are.
      assert.deepEqual((yield* build("approval-required")).sandboxPolicy, { type: "readOnly" });
      assert.deepEqual((yield* build("full-access")).sandboxPolicy, { type: "dangerFullAccess" });
    }),
  );

  it("starts a Studio project's thread with only Studio's tools, not the person's own", () => {
    const mcpSession = {
      environmentId: EnvironmentId.make("environment-codex-mcp"),
      threadId: ThreadId.make("thread-studio"),
      providerSessionId: "mcp-session-codex",
      providerInstanceId: ProviderInstanceId.make("codex"),
      endpoint: "http://127.0.0.1:43123/mcp",
      authorizationHeader: "Bearer secret-codex-token",
      browserToolsAvailable: true,
    };
    // The person's Codex config, as `config/read` returns it: their CAD server and others.
    const personal = CodexStudio.codexConfigMcpServers({
      model: "gpt-5.5",
      mcp_servers: { cad: { command: "uvx" }, github: { command: "npx" }, "t3-code": {} },
    });
    const policy = {
      runtimeMode: "full-access" as const,
      interactionMode: "default" as const,
      cwd: "/projects/bracket",
    };
    const code = CodexAdapterV2.codexThreadRuntimeParams({
      threadId: ThreadId.make("thread-studio"),
      mcpSession,
      runtimePolicy: policy,
      personalMcpServers: personal,
    });
    const studio = CodexAdapterV2.codexThreadRuntimeParams({
      threadId: ThreadId.make("thread-studio"),
      mcpSession,
      runtimePolicy: { ...policy, projectContext: "# Studio project: Bracket" },
      personalMcpServers: personal,
    });

    // Plugins, apps and each of the person's servers are off; T3's own servers stay.
    assert.deepEqual(studio.config, {
      ...code.config,
      "features.plugins": false,
      "features.apps": false,
      "mcp_servers.cad.enabled": false,
      "mcp_servers.github.enabled": false,
    });
    // A thread outside a Studio project keeps the person's setup as it is.
    assert.notProperty(code.config, "features.plugins");
    assert.deepEqual(
      Object.keys(code.config).filter((key) => key.startsWith("mcp_servers.")),
      ["mcp_servers.t3-code", "mcp_servers.t3-code-direct"],
    );
    assert.deepEqual(CodexStudio.codexConfigMcpServers({ model: "gpt-5.5" }), []);
  });
});
