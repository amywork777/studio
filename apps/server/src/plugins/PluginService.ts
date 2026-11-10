/**
 * Plugins as clients and agents use them: the catalog and lifecycle (over
 * `PluginStore`), views and their requests (over `PluginHost`, in the
 * thread's own scope with the thread's workspace as its root), and the
 * plugin tools agents call through T3's MCP server.
 *
 * Installing or enabling a plugin lists its servers' tools in the background,
 * which fills its views and server status; the call waits a few seconds for
 * that so a quick server's views are there on return, never for a slow first
 * download.
 */
import {
  type InstalledPlugin,
  type PluginCatalogInput,
  type PluginCatalogResult,
  type PluginListResult,
  type PluginModelPicturesInput,
  type PluginModelPicturesResult,
  PluginOperationError,
  type PluginOpenViewInput,
  type PluginRequestInput,
  type PluginRequestResult,
  type PluginViewDocument,
  type ThreadId,
} from "@t3tools/contracts";
import {
  agentToolName,
  clip,
  isAppOnly,
  isRecord,
  type ListedTool,
  readToolUi,
} from "@t3tools/plugins";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schedule from "effect/Schedule";
import type * as Stream from "effect/Stream";

import * as HostProcess from "@t3tools/shared/HostProcess";

import * as ServerConfig from "../config.ts";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as AppCapability from "./appCapability.ts";
import * as ListingRetries from "./listingRetries.ts";
import * as PluginFiles from "./pluginFiles.ts";
import * as ModelPictures from "./modelPictures.ts";
import * as PluginHost from "./PluginHost.ts";
import * as PluginStore from "./PluginStore.ts";

/** A plugin tool as agents see it on T3's MCP server. */
export interface AgentTool {
  /** `<plugin>__<tool>`, see `agentToolName`. */
  readonly name: string;
  readonly pluginId: string;
  readonly server: string;
  readonly tool: ListedTool & Readonly<Record<string, unknown>>;
}

const MAX_VIEW_BYTES = 32 * 1024 * 1024;
const LISTING_WAIT = "10 seconds";
/** How often failed listings are looked at for a retry that is due. */
const LISTING_RETRY_CHECK = "5 seconds";

const fail = (reason: PluginOperationError["reason"], message: string) =>
  new PluginOperationError({ reason, message: clip(message, 400) });

const strings = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => clip(item, 512))
    : undefined;

export class PluginService extends Context.Service<
  PluginService,
  {
    readonly catalog: (
      input: PluginCatalogInput,
    ) => Effect.Effect<PluginCatalogResult, PluginOperationError>;
    readonly list: Effect.Effect<PluginListResult>;
    readonly install: (key: string) => Effect.Effect<InstalledPlugin, PluginOperationError>;
    readonly update: (pluginId: string) => Effect.Effect<InstalledPlugin, PluginOperationError>;
    readonly uninstall: (pluginId: string) => Effect.Effect<void, PluginOperationError>;
    readonly readSkill: PluginStore.PluginStore["Service"]["readSkill"];
    readonly createSkill: PluginStore.PluginStore["Service"]["createSkill"];
    readonly saveSkill: PluginStore.PluginStore["Service"]["saveSkill"];
    readonly copySkill: PluginStore.PluginStore["Service"]["copySkill"];
    readonly removeSkill: PluginStore.PluginStore["Service"]["removeSkill"];
    readonly setEnabled: (
      pluginId: string,
      enabled: boolean,
    ) => Effect.Effect<InstalledPlugin, PluginOperationError>;
    /** Call a view's tool and read its UI resource, in the thread's scope (or the environment's). */
    readonly openView: (
      input: PluginOpenViewInput,
    ) => Effect.Effect<PluginViewDocument, PluginOperationError>;
    /** A request a view makes of its own server; app-only tools are callable here. */
    readonly request: (
      input: PluginRequestInput,
    ) => Effect.Effect<PluginRequestResult, PluginOperationError>;
    /**
     * Pictures of a project's models, rendered by the first enabled plugin whose
     * CAD server renders them (`modelPictures.ts`); none when no plugin does.
     */
    readonly modelPictures: (
      input: PluginModelPicturesInput,
    ) => Effect.Effect<PluginModelPicturesResult, PluginOperationError>;
    /** Every enabled plugin tool an agent may call, from the servers' last listing. */
    readonly agentTools: Effect.Effect<ReadonlyArray<AgentTool>>;
    /** Call a plugin tool for an agent in its thread's scope. Answers the server's `CallToolResult`. */
    readonly callAgentTool: (input: {
      readonly threadId: ThreadId;
      readonly name: string;
      readonly arguments: unknown;
    }) => Effect.Effect<unknown, PluginOperationError>;
    /** Anything `agentTools` answers may have changed. */
    readonly changes: Stream.Stream<void>;
  }
>()("t3/plugins/PluginService") {}

const make = Effect.gen(function* () {
  const store = yield* PluginStore.PluginStore;
  const host = yield* PluginHost.PluginHost;
  const threads = yield* ThreadManagementService.ThreadManagementService;
  const projects = yield* ProjectStore.ProjectStoreV2;
  const path = yield* Path.Path;
  const scope = yield* Effect.scope;
  const config = yield* ServerConfig.ServerConfig;
  const environment = yield* HostProcess.Environment;

  const modelPictures = (input: PluginModelPicturesInput) =>
    Effect.gen(function* () {
      const plugins = yield* store.enabledPlugins;
      const launch =
        plugins
          .map((plugin) => ModelPictures.snapshotLaunch(plugin, environment))
          .find((candidate) => candidate !== null) ?? null;
      if (launch === null) {
        return { pictures: input.paths.map((entry) => ({ path: entry, png: null })) };
      }
      const pictures = yield* Effect.tryPromise({
        try: () =>
          ModelPictures.renderModelPictures({
            launch,
            cwd: input.cwd,
            paths: input.paths,
            versions: input.versions,
            cacheDir: path.join(config.stateDir, "plugins", "pictures"),
          }),
        catch: (cause) =>
          fail("request_failed", cause instanceof Error ? cause.message : "Rendering failed."),
      });
      return { pictures };
    }).pipe(Effect.withSpan("PluginService.modelPictures"));

  // A new thread lives only in its client until its first message is sent, so the server has no
  // record of it. A view opened in one names its file by its absolute path, or its project's folder
  // when it opens no file (a model by its document id), and works in that project's folder, kept
  // here for the view's later requests until the server has the thread.
  const draftRoots = new Map<ThreadId, string>();

  /** The thread's workspace: its worktree, else its project's root; a new thread's, as above. */
  const workspaceOf = (
    threadId: ThreadId,
    file: string | undefined,
    workspace: string | undefined,
  ) =>
    Effect.gen(function* () {
      const records = yield* threads.getThreadRecords(threadId, []).pipe(Effect.option);
      if (Option.isSome(records)) {
        draftRoots.delete(threadId);
        if (records.value.thread.worktreePath !== null) return records.value.thread.worktreePath;
        const project = yield* projects.get(records.value.thread.projectId);
        if (Option.isNone(project)) return yield* Effect.fail("missing project");
        return project.value.workspaceRoot;
      }
      if (file !== undefined && path.isAbsolute(file)) {
        const holding = (yield* projects.list())
          .map((project) => project.workspaceRoot)
          .filter((root) => PluginFiles.isInside(root, file))
          .sort((a, b) => b.length - a.length)[0];
        if (holding !== undefined) {
          draftRoots.set(threadId, holding);
          return holding;
        }
      }
      if (workspace !== undefined) {
        const named = path.resolve(workspace);
        const project = (yield* projects.list()).find(
          (each) => path.resolve(each.workspaceRoot) === named,
        );
        if (project !== undefined) {
          draftRoots.set(threadId, project.workspaceRoot);
          return project.workspaceRoot;
        }
      }
      const remembered = draftRoots.get(threadId);
      if (remembered === undefined) return yield* Effect.fail("missing thread");
      return remembered;
    }).pipe(Effect.mapError(() => fail("thread_not_found", "that thread is gone")));

  const rootsOf = (threadId: ThreadId | null, file?: string, workspace?: string) =>
    threadId === null
      ? Effect.succeed([])
      : workspaceOf(threadId, file, workspace).pipe(Effect.map((root) => [root]));

  const scopeOf = (threadId: ThreadId | null) => threadId ?? PluginHost.ENVIRONMENT_SCOPE;

  // Each scope's CAD server's app capability (`appCapability.ts`), by scope, plugin and server: the
  // last a launch it answered delivered.
  const capabilities = new Map<string, string>();
  const capabilityKey = (threadId: ThreadId | null, pluginId: string, server: string) =>
    [scopeOf(threadId), pluginId, server].join("\u0000");
  const remember = (key: string, result: unknown) => {
    const token = AppCapability.readCapability(result);
    if (token !== null) capabilities.set(key, token);
    return token;
  };
  // Each key's launch under way: reads that start together ask the server's home launch once.
  const launching = new Map<string, Deferred.Deferred<string | null>>();
  const capabilityOf = (key: string, launch: Effect.Effect<string | null>) =>
    Effect.gen(function* () {
      const known = capabilities.get(key);
      if (known !== undefined) return known;
      const pending = launching.get(key);
      if (pending !== undefined) return yield* Deferred.await(pending);
      const deferred = yield* Deferred.make<string | null>();
      launching.set(key, deferred);
      return yield* launch.pipe(
        Effect.tap((token) => Deferred.succeed(deferred, token)),
        Effect.ensuring(
          Deferred.succeed(deferred, null).pipe(
            Effect.andThen(Effect.sync(() => launching.delete(key))),
          ),
        ),
      );
    });

  /**
   * A request of a view's server. A `cad_http` call that carries no capability (Studio's own UI
   * reading the viewer's routes) carries its scope's, asked of the server's home launch when none
   * is known (once for reads that start together), and asked again once when the server answers
   * the call with an error: the server that gave it may have restarted since.
   */
  const request = (input: PluginRequestInput) =>
    Effect.gen(function* () {
      const roots = yield* rootsOf(input.threadId);
      const call = (method: PluginHost.ForwardedMethod, params: unknown) =>
        host.request({
          scope: scopeOf(input.threadId),
          pluginId: input.pluginId,
          server: input.server,
          method,
          params,
          roots,
        });
      if (!AppCapability.wantsCapability(input.method, input.params) || !isRecord(input.params)) {
        return { result: yield* call(input.method, input.params) };
      }
      const params = input.params;
      const key = capabilityKey(input.threadId, input.pluginId, input.server);
      const launch = call("tools/call", { name: AppCapability.LAUNCH_TOOL, arguments: {} }).pipe(
        Effect.map((result) => remember(key, result)),
        Effect.orElseSucceed(() => null),
      );
      const token = yield* capabilityOf(key, launch);
      if (token === null) return { result: yield* call("tools/call", params) };
      const result = yield* call("tools/call", AppCapability.withCapability(params, token));
      if (!AppCapability.isErrorResult(result)) return { result };
      if (capabilities.get(key) === token) capabilities.delete(key);
      const fresh = yield* capabilityOf(key, launch);
      return {
        result:
          fresh === null
            ? result
            : yield* call("tools/call", AppCapability.withCapability(params, fresh)),
      };
    });

  /** List the plugin's tools in the background, waiting a little for a quick server. */
  const relist = (pluginId: string) =>
    Effect.gen(function* () {
      yield* host.closePlugin(pluginId);
      const fiber = yield* host.listPlugin(pluginId).pipe(Effect.forkIn(scope));
      yield* Fiber.join(fiber).pipe(Effect.timeout(LISTING_WAIT), Effect.ignore);
      return yield* store.get(pluginId);
    });

  const listedTool = (pluginId: string, server: string, tool: string) =>
    store.enabledPlugins.pipe(
      Effect.map(
        (plugins) =>
          plugins
            .find((plugin) => plugin.id === pluginId)
            ?.listings[server]?.tools.find((item) => item.name === tool) ?? null,
      ),
    );

  const openView = Effect.fn("PluginService.openView")(function* (input: PluginOpenViewInput) {
    const roots = yield* rootsOf(input.threadId, input.file, input.workspace);
    let toolInput: Record<string, unknown> = { ...input.arguments };
    let meta: Record<string, unknown> | undefined;
    if (input.file !== undefined) {
      const root = roots[0];
      if (root === undefined) return yield* fail("request_failed", "opening a file needs a thread");
      const absolute = PluginFiles.resolveInside(root, input.file);
      if (absolute === null)
        return yield* fail("request_failed", `${input.file} is outside the thread's workspace`);
      toolInput = {
        ...toolInput,
        file: { name: path.basename(absolute), resourceUri: PluginFiles.fileUrl(absolute) },
      };
      meta = { "openai/resource": { path: absolute } };
    }
    const call = (method: PluginHost.ForwardedMethod, params: unknown) =>
      host.request({
        scope: scopeOf(input.threadId),
        pluginId: input.pluginId,
        server: input.server,
        method,
        params,
        roots,
      });
    let listed = yield* listedTool(input.pluginId, input.server, input.tool);
    if (listed === null) {
      yield* host.listPlugin(input.pluginId);
      listed = yield* listedTool(input.pluginId, input.server, input.tool);
    }
    const view = listed === null ? null : readToolUi(input.server, listed);
    if (view === null) {
      // A server that did not start lists no views: say why it did not, not that the view is missing.
      const listing = (yield* store.enabledPlugins).find((plugin) => plugin.id === input.pluginId)
        ?.listings[input.server];
      if (listed === null && listing?.state === "error" && listing.error !== null) {
        return yield* fail("server_failed", listing.error);
      }
      return yield* fail("not_found", `${input.pluginId} has no view called ${input.tool}`);
    }
    const toolResult = yield* call("tools/call", {
      name: input.tool,
      arguments: toolInput,
      ...(meta === undefined ? {} : { _meta: meta }),
    });
    // The launch's `_meta` goes to the view whole (its capability among it), and is remembered for
    // Studio's own reads of the same server.
    remember(capabilityKey(input.threadId, input.pluginId, input.server), toolResult);
    const resource = yield* call("resources/read", { uri: view.resourceUri });
    const contents =
      isRecord(resource) && Array.isArray(resource.contents) ? resource.contents : [];
    const first: unknown = contents[0];
    if (!isRecord(first))
      return yield* fail("request_failed", `${view.resourceUri} has no content`);
    const html =
      typeof first.text === "string"
        ? first.text
        : typeof first.blob === "string"
          ? Buffer.from(first.blob, "base64").toString("utf8")
          : null;
    if (html === null)
      return yield* fail("request_failed", `${view.resourceUri} is not a document`);
    if (html.length > MAX_VIEW_BYTES)
      return yield* fail("request_failed", `${view.resourceUri} is too large to show`);
    const ui = isRecord(first._meta) && isRecord(first._meta.ui) ? first._meta.ui : {};
    const csp = isRecord(ui.csp) ? ui.csp : null;
    const connectDomains = strings(csp?.connectDomains);
    const resourceDomains = strings(csp?.resourceDomains);
    const frameDomains = strings(csp?.frameDomains);
    return {
      html,
      csp:
        csp === null
          ? null
          : {
              ...(connectDomains === undefined ? {} : { connectDomains }),
              ...(resourceDomains === undefined ? {} : { resourceDomains }),
              ...(frameDomains === undefined ? {} : { frameDomains }),
            },
      toolInput,
      toolResult,
    };
  });

  const agentTools = store.enabledPlugins.pipe(
    Effect.map((plugins) => {
      const seen = new Set<string>();
      return plugins.flatMap((plugin) =>
        Object.entries(plugin.listings).flatMap(([server, listing]) =>
          listing.tools.flatMap((tool): Array<AgentTool> => {
            if (plugin.servers[server] === undefined || isAppOnly(tool)) return [];
            const name = agentToolName(plugin.id, tool.name);
            if (seen.has(name)) return [];
            seen.add(name);
            return [{ name, pluginId: plugin.id, server, tool }];
          }),
        ),
      );
    }),
  );

  const callAgentTool: PluginService["Service"]["callAgentTool"] = (input) =>
    Effect.gen(function* () {
      const tool = (yield* agentTools).find((item) => item.name === input.name);
      if (tool === undefined)
        return yield* fail("not_found", `no enabled plugin has the tool ${input.name}`);
      const roots = yield* rootsOf(input.threadId);
      const result = yield* host.request({
        scope: input.threadId,
        pluginId: tool.pluginId,
        server: tool.server,
        method: "tools/call",
        params: {
          name: tool.tool.name,
          arguments: isRecord(input.arguments) ? input.arguments : {},
        },
        roots,
      });
      // A launch's app capability is the UI's alone: it never reaches the agent's context.
      return AppCapability.withoutCapability(result);
    });

  // An enabled plugin whose servers failed to list is listed again on its own (`listingRetries.ts`),
  // as opening one of its views would: a server that has come back gives agents its tools.
  const retries = new Map<string, ListingRetries.Retry>();
  yield* Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const failing = (yield* store.enabledPlugins)
      .filter((plugin) =>
        Object.entries(plugin.listings).some(
          ([server, listing]) => listing.state === "error" && plugin.servers[server] !== undefined,
        ),
      )
      .map((plugin) => plugin.id);
    yield* Effect.forEach(
      ListingRetries.dueRetries(failing, retries, now),
      (pluginId) => host.listPlugin(pluginId),
      { concurrency: "unbounded", discard: true },
    );
  }).pipe(Effect.repeat(Schedule.spaced(LISTING_RETRY_CHECK)), Effect.forkScoped);

  return PluginService.of({
    catalog: store.catalog,
    list: store.list.pipe(Effect.map((plugins) => ({ plugins }))),
    install: (key) => store.install(key).pipe(Effect.flatMap(relist)),
    // Stop the servers before the update replaces the folder they run from.
    update: (pluginId) =>
      host
        .closePlugin(pluginId)
        .pipe(Effect.andThen(store.update(pluginId)), Effect.flatMap(relist)),
    uninstall: (pluginId) =>
      host.closePlugin(pluginId).pipe(Effect.andThen(store.uninstall(pluginId))),
    readSkill: store.readSkill,
    createSkill: store.createSkill,
    saveSkill: store.saveSkill,
    copySkill: store.copySkill,
    removeSkill: store.removeSkill,
    setEnabled: (pluginId, enabled) =>
      store
        .setEnabled(pluginId, enabled)
        .pipe(
          Effect.andThen(
            enabled
              ? relist(pluginId)
              : host.closePlugin(pluginId).pipe(Effect.andThen(store.get(pluginId))),
          ),
        ),
    openView,
    request,
    modelPictures,
    agentTools,
    callAgentTool,
    changes: store.changes,
  });
});

export const layer = Layer.effect(PluginService, make).pipe(Layer.provide(PluginHost.layer));
