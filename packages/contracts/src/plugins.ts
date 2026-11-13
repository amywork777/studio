import * as Schema from "effect/Schema";

import { ThreadId, TrimmedNonEmptyString, TrimmedString } from "./baseSchemas.ts";

/**
 * Plugins in the Codex/Claude plugin format (manifest, MCP servers, skills, MCP App views). The
 * environment installs them in its own state dir (never `~/.claude` or `~/.codex`), runs their
 * servers once per thread, and gives their tools to every provider through T3's MCP server.
 */

const Text = (max: number) => Schema.String.check(Schema.isMaxLength(max));
const NullableText = (max: number) => Schema.NullOr(Text(max));

/** `<plugin name>` as installed, unique per environment. */
export const PluginId = TrimmedNonEmptyString.check(
  Schema.isMaxLength(128),
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
);
export type PluginId = typeof PluginId.Type;

/** A catalog row: `<marketplace>/<plugin name>` for the source Install will use. */
export const PluginCatalogKey = TrimmedNonEmptyString.check(Schema.isMaxLength(300));
export type PluginCatalogKey = typeof PluginCatalogKey.Type;

export const PluginCompatibilityLevel = Schema.Literals([
  "works",
  "signin",
  "partly",
  "codex",
  "unknown",
  "unavailable",
]);
export type PluginCompatibilityLevel = typeof PluginCompatibilityLevel.Type;

export const PluginCompatibility = Schema.Struct({
  level: PluginCompatibilityLevel,
  /** Short label for a card: "Works", "Partly", "Checked on install"… */
  label: Text(40),
  /** One line each: what works here and what is ignored. */
  notes: Schema.Array(Text(200)).check(Schema.isMaxLength(12)),
});
export type PluginCompatibility = typeof PluginCompatibility.Type;

export const PluginMarketplaceRef = Schema.Struct({
  id: Text(160),
  name: Text(160),
  official: Schema.Boolean,
});
export type PluginMarketplaceRef = typeof PluginMarketplaceRef.Type;

export const PluginCatalogEntry = Schema.Struct({
  key: PluginCatalogKey,
  name: Text(128),
  displayName: Text(160),
  description: Text(400),
  category: NullableText(80),
  publisher: NullableText(160),
  homepage: NullableText(2048),
  version: NullableText(64),
  /** Every marketplace that lists this plugin; the first is the one Install uses. */
  marketplaces: Schema.Array(PluginMarketplaceRef).check(Schema.isMaxLength(16)),
  verified: Schema.Boolean,
  compatibility: PluginCompatibility,
  /** Set when this plugin is installed. */
  installedId: Schema.NullOr(PluginId),
});
export type PluginCatalogEntry = typeof PluginCatalogEntry.Type;

export const PluginCatalogStatus = Schema.Struct({
  id: Text(160),
  name: Text(160),
  source: Text(2048),
  state: Schema.Literals(["ready", "fetching", "error"]),
  pluginCount: Schema.Number,
  error: NullableText(400),
});
export type PluginCatalogStatus = typeof PluginCatalogStatus.Type;

export const PLUGIN_CATALOG_PAGE_LIMIT = 200;

export const PluginCatalogInput = Schema.Struct({
  query: TrimmedString.check(Schema.isMaxLength(120)),
  /** Fetch every catalog again instead of using the cached copies. */
  refresh: Schema.optionalKey(Schema.Boolean),
});
export type PluginCatalogInput = typeof PluginCatalogInput.Type;

export const PluginCatalogResult = Schema.Struct({
  entries: Schema.Array(PluginCatalogEntry).check(Schema.isMaxLength(PLUGIN_CATALOG_PAGE_LIMIT)),
  matchCount: Schema.Number,
  catalogs: Schema.Array(PluginCatalogStatus).check(Schema.isMaxLength(32)),
});
export type PluginCatalogResult = typeof PluginCatalogResult.Type;

/** Where a view can be opened from, as the plugin's tool declares it. */
export const PluginViewEntrypoint = Schema.Union([
  Schema.Struct({ type: Schema.Literal("global") }),
  Schema.Struct({ type: Schema.Literal("thread") }),
  Schema.Struct({
    type: Schema.Literal("file"),
    extensions: Schema.Array(Text(32)).check(Schema.isMaxLength(64)),
  }),
]);
export type PluginViewEntrypoint = typeof PluginViewEntrypoint.Type;

/** A tool whose result is an MCP App view (`_meta.ui.resourceUri`). */
export const PluginView = Schema.Struct({
  server: Text(128),
  tool: Text(128),
  title: Text(160),
  resourceUri: Text(2048),
  entrypoints: Schema.Array(PluginViewEntrypoint).check(Schema.isMaxLength(8)),
});
export type PluginView = typeof PluginView.Type;

export const PluginServerStatus = Schema.Struct({
  name: Text(128),
  transport: Schema.Literals(["stdio", "http"]),
  /** Tools the server listed when it last started, or an error. */
  state: Schema.Literals(["idle", "starting", "ready", "error"]),
  error: NullableText(400),
});
export type PluginServerStatus = typeof PluginServerStatus.Type;

/**
 * What a skill says about itself, read from its own files: a display name, a
 * one-line description and an ask that shows it off. A skill whose files say
 * nothing has a null display name and ask, and an empty description.
 */
export const PluginSkillDetail = Schema.Struct({
  /** The skill's name, as listed in the plugin's `skills`. */
  name: Text(128),
  displayName: NullableText(160),
  description: Text(400),
  defaultPrompt: NullableText(300),
});
export type PluginSkillDetail = typeof PluginSkillDetail.Type;

export const InstalledPlugin = Schema.Struct({
  id: PluginId,
  displayName: Text(160),
  description: Text(400),
  version: NullableText(64),
  publisher: NullableText(160),
  enabled: Schema.Boolean,
  marketplace: NullableText(160),
  /** Commit the installed copy was cloned at, when it came from git. */
  commit: NullableText(64),
  skills: Schema.Array(Text(128)).check(Schema.isMaxLength(200)),
  /** Each of `skills`, described by its own files, in the same order. */
  skillDetails: Schema.optional(Schema.Array(PluginSkillDetail).check(Schema.isMaxLength(200))),
  servers: Schema.Array(PluginServerStatus).check(Schema.isMaxLength(32)),
  views: Schema.Array(PluginView).check(Schema.isMaxLength(64)),
  compatibility: PluginCompatibility,
  updateAvailable: Schema.Boolean,
  /** Prompts the plugin suggests starting with (Codex's `interface.defaultPrompt`). */
  starterPrompts: Schema.optional(Schema.Array(Text(300)).check(Schema.isMaxLength(6))),
  /** A manifest that no longer reads, or a server that is failing to start. */
  error: NullableText(400),
});
export type InstalledPlugin = typeof InstalledPlugin.Type;

/**
 * The name an agent sees a plugin tool by on T3's MCP server: `<plugin>__<tool>`,
 * kept to what every provider accepts. Claude prefixes `mcp__t3-code__` (14
 * characters) and caps the whole name at 64, so this stays within 50; a longer
 * one keeps its start and ends in a hash of the full name.
 */
export const AGENT_TOOL_NAME_MAX = 50;

export function agentToolName(pluginId: string, tool: string): string {
  const full = `${pluginId}__${tool}`.replace(/[^A-Za-z0-9_-]/g, "_");
  if (full.length <= AGENT_TOOL_NAME_MAX) return full;
  let hash = 0x811c9dc5;
  for (let index = 0; index < full.length; index += 1) {
    hash ^= full.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const suffix = hash.toString(16).padStart(8, "0");
  return `${full.slice(0, AGENT_TOOL_NAME_MAX - suffix.length - 1)}_${suffix}`;
}

export const PluginListResult = Schema.Struct({
  plugins: Schema.Array(InstalledPlugin).check(Schema.isMaxLength(500)),
});
export type PluginListResult = typeof PluginListResult.Type;

export const PluginInstallInput = Schema.Struct({ key: PluginCatalogKey });
export type PluginInstallInput = typeof PluginInstallInput.Type;

export const PluginIdInput = Schema.Struct({ pluginId: PluginId });
export type PluginIdInput = typeof PluginIdInput.Type;

/** The plugin holding the person's own skills, there once they add one. */
export const MY_SKILLS_PLUGIN_ID = "my-skills";

const SkillName = TrimmedNonEmptyString.check(Schema.isMaxLength(128));

export const PluginSkillInput = Schema.Struct({ pluginId: PluginId, skill: SkillName });
export type PluginSkillInput = typeof PluginSkillInput.Type;

export const PluginSkillReadInput = Schema.Struct({
  ...PluginSkillInput.fields,
  /** One of the skill's other files, by its path in the skill's folder; else its `SKILL.md`. */
  file: Schema.NullOr(Text(512)),
});
export type PluginSkillReadInput = typeof PluginSkillReadInput.Type;

/** A skill as its files have it: the text asked for, and what else the skill holds. */
export const PluginSkillContent = Schema.Struct({
  text: Schema.String,
  /** What the skill says it is for, in full: the list's may be shorter. */
  description: Schema.String,
  files: Schema.Array(Text(512)).check(Schema.isMaxLength(200)),
});
export type PluginSkillContent = typeof PluginSkillContent.Type;

export const PluginSkillCreateInput = Schema.Struct({
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(120)),
  description: TrimmedNonEmptyString.check(Schema.isMaxLength(400)),
});
export type PluginSkillCreateInput = typeof PluginSkillCreateInput.Type;

export const PluginSkillSaveInput = Schema.Struct({
  skill: SkillName,
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(120)),
  description: TrimmedNonEmptyString.check(Schema.isMaxLength(1024)),
  instructions: Schema.String.check(Schema.isMaxLength(1024 * 1024)),
});
export type PluginSkillSaveInput = typeof PluginSkillSaveInput.Type;

/** Where a skill landed in the person's own: its name in `MY_SKILLS_PLUGIN_ID`. */
export const PluginSkillResult = Schema.Struct({ skill: SkillName });
export type PluginSkillResult = typeof PluginSkillResult.Type;

export const PluginSetEnabledInput = Schema.Struct({
  pluginId: PluginId,
  enabled: Schema.Boolean,
});
export type PluginSetEnabledInput = typeof PluginSetEnabledInput.Type;

/** A view runs against one thread's server process, or the environment's own scope. */
export const PluginScope = Schema.NullOr(ThreadId);

export const PluginOpenViewInput = Schema.Struct({
  threadId: PluginScope,
  pluginId: PluginId,
  server: Text(128),
  tool: Text(128),
  arguments: Schema.Record(Schema.String, Schema.Unknown),
  /** Opening a file: its path relative to the thread's workspace. */
  file: Schema.optionalKey(Text(4096)),
  /** A new thread's project folder, in full: the server has no record of the thread until its first message. */
  workspace: Schema.optionalKey(Text(4096)),
});
export type PluginOpenViewInput = typeof PluginOpenViewInput.Type;

export const PluginViewDocument = Schema.Struct({
  /** Apps inline their bundle: text-to-cad's CAD view is about 7 MB. */
  html: Schema.String.check(Schema.isMaxLength(32 * 1024 * 1024)),
  /** `_meta.ui.csp` from the resource, passed through for the host to apply. */
  csp: Schema.NullOr(
    Schema.Struct({
      connectDomains: Schema.optionalKey(Schema.Array(Text(512))),
      resourceDomains: Schema.optionalKey(Schema.Array(Text(512))),
      frameDomains: Schema.optionalKey(Schema.Array(Text(512))),
    }),
  ),
  toolInput: Schema.Record(Schema.String, Schema.Unknown),
  /** The MCP `CallToolResult` the view is given on initialize. */
  toolResult: Schema.Unknown,
});
export type PluginViewDocument = typeof PluginViewDocument.Type;

/** A JSON-RPC request a view makes to its own server (tools/call, resources/read…). */
export const PluginRequestInput = Schema.Struct({
  threadId: PluginScope,
  pluginId: PluginId,
  server: Text(128),
  method: Schema.Literals([
    "tools/call",
    "tools/list",
    "resources/read",
    "resources/list",
    "resources/templates/list",
    "prompts/list",
    "prompts/get",
  ]),
  params: Schema.Unknown,
});
export type PluginRequestInput = typeof PluginRequestInput.Type;

export const PluginRequestResult = Schema.Struct({ result: Schema.Unknown });
export type PluginRequestResult = typeof PluginRequestResult.Type;

/** Pictures of a project's models, rendered by an enabled plugin that renders them (text-to-cad). */
export const PluginModelPicturesInput = Schema.Struct({
  /** The project's workspace root. */
  cwd: Text(4096),
  /** Workspace-relative files to picture, and cadgen models by their document id. */
  paths: Schema.Array(Text(1024)).check(Schema.isMaxLength(64)),
  /** Each model's build (its Recents `updated`), by document id: what its picture is cached by. */
  versions: Schema.optional(Schema.Record(Text(64), Text(64))),
});
export type PluginModelPicturesInput = typeof PluginModelPicturesInput.Type;

export const PluginModelPicturesResult = Schema.Struct({
  /** A base64 PNG per path, null where there is none (gone, or it would not render). */
  pictures: Schema.Array(Schema.Struct({ path: Schema.String, png: Schema.NullOr(Schema.String) })),
});
export type PluginModelPicturesResult = typeof PluginModelPicturesResult.Type;

export const PluginOperationErrorReason = Schema.Literals([
  "not_found",
  "install_failed",
  "manifest_invalid",
  "server_failed",
  "request_failed",
  // The plugin's server took longer than its tool timeout to answer.
  "timed_out",
  "thread_not_found",
  "catalog_unavailable",
]);
export type PluginOperationErrorReason = typeof PluginOperationErrorReason.Type;

export class PluginOperationError extends Schema.TaggedError<PluginOperationError>()(
  "PluginOperationError",
  {
    reason: PluginOperationErrorReason,
    message: Schema.String,
  },
) {}
