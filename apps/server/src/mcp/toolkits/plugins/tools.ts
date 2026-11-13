/**
 * Every enabled plugin's MCP tools on T3's MCP server, named `<plugin>__<tool>`, run in the calling
 * thread's own plugin processes. App-only tools (`ui.visibility: ["app"]`) are not listed. Only
 * thread callers may call one: an outside MCP client has no thread for the processes to run in.
 */
import { McpSchema } from "effect/ai";
import type { McpServer } from "effect/ai";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import * as PluginService from "../../../plugins/PluginService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

type AddTool = McpServer.McpServer["Service"]["addTool"];

const decodeTool = Schema.decodeUnknownEffect(McpSchema.Tool);
const decodeResult = Schema.decodeUnknownEffect(McpSchema.CallToolResult);

const errorResult = (text: string) =>
  new McpSchema.CallToolResult({ isError: true, content: [{ type: "text", text }] });

/** Keep `addTool` in step with the enabled plugins' tools for as long as the server runs. */
export const register = Effect.fn("PluginTools.register")(function* (addTool: AddTool) {
  // Absent from test servers that do not run plugins.
  const service = yield* Effect.serviceOption(PluginService.PluginService);
  if (Option.isNone(service)) return;
  const plugins = service.value;
  const offered = new Set<string>();
  /** Each registered tool's definition, so a changed one registers again. */
  const registered = new Map<string, unknown>();

  const handle = (name: string) => (payload: unknown) =>
    Effect.withFiber((fiber) => {
      const invocation = Context.getOption(
        fiber.context,
        McpInvocationContext.McpInvocationContext,
      );
      const thread = Option.isSome(invocation) ? invocation.value.thread : undefined;
      if (thread === undefined) {
        return Effect.succeed(
          errorResult("Plugin tools run inside a T3 Code thread; this MCP client has no thread."),
        );
      }
      return plugins.callAgentTool({ threadId: thread.threadId, name, arguments: payload }).pipe(
        Effect.flatMap((raw) => decodeResult(raw)),
        Effect.catch((error) =>
          Effect.succeed(
            errorResult(
              error._tag === "PluginOperationError"
                ? error.message
                : `${name} returned a result T3 Code cannot read.`,
            ),
          ),
        ),
      );
    });

  const sync = Effect.gen(function* () {
    const tools = yield* plugins.agentTools;
    offered.clear();
    for (const tool of tools) offered.add(tool.name);
    for (const tool of tools) {
      const { _meta: _ignored, ...definition } = tool.tool;
      if (Equal.equals(registered.get(tool.name), definition)) continue;
      const decoded = yield* decodeTool({ ...definition, name: tool.name }).pipe(Effect.option);
      if (Option.isNone(decoded)) continue;
      registered.set(tool.name, definition);
      const name = tool.name;
      yield* addTool({
        tool: decoded.value,
        annotations: Context.make(McpSchema.EnabledWhen, () => offered.has(name)),
        handle: handle(name),
      });
    }
  });

  yield* sync;
  yield* plugins.changes.pipe(
    Stream.runForEach(() => sync),
    Effect.forkScoped,
  );
});
