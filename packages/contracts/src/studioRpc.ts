// Studio's WebSocket methods and RPCs, spread into T3 Code's `WS_METHODS` and `WsRpcGroup` (rpc.ts)
// with one line each, so T3's file keeps its own list.
import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";

import {
  AuthProvidersManageScope,
  AuthSourceControlWriteScope,
  EnvironmentAuthorizationError,
} from "./auth.ts";
import { OrchestrationDispatchCommandError } from "./orchestrationDispatch.ts";
import {
  InstalledPlugin,
  PluginCatalogInput,
  PluginCatalogResult,
  PluginIdInput,
  PluginInstallInput,
  PluginListResult,
  PluginExportInput,
  PluginExportResult,
  PluginModelPicturesInput,
  PluginModelPicturesResult,
  PluginOpenViewInput,
  PluginOperationError,
  PluginRequestInput,
  PluginRequestResult,
  PluginSetEnabledInput,
  PluginViewDocument,
  PluginSkillContent,
  PluginSkillCreateInput,
  PluginSkillInput,
  PluginSkillReadInput,
  PluginSkillResult,
  PluginSkillSaveInput,
} from "./plugins.ts";
import {
  ProjectStartHistoryInput,
  ProjectStartHistoryResult,
  StudioDeliverablesError,
  StudioDeliverablesInput,
  StudioDeliverablesResult,
  StudioProjectsError,
  StudioProjectsListInput,
  StudioProjectsListResult,
  StudioProjectsSaveInput,
  StudioProjectsSaveResult,
  StudioProjectsTrashInput,
  StudioGitHubSignInCheckInput,
  StudioGitHubSignInCheckResult,
  StudioGitHubSignInError,
  StudioGitHubSignInStartResult,
  StudioSyncError,
  StudioSyncRestoreInput,
  StudioSyncRestoreResult,
  StudioSyncSendInput,
  StudioSyncSendResult,
  StudioSyncStatusInput,
  StudioSyncStatusResult,
} from "./studioProjects.ts";

export const STUDIO_WS_METHODS = {
  projectsStartHistory: "projects.startHistory",
  pluginsCatalog: "plugins.catalog",
  pluginsList: "plugins.list",
  pluginsInstall: "plugins.install",
  pluginsSetEnabled: "plugins.setEnabled",
  pluginsUninstall: "plugins.uninstall",
  pluginsUpdate: "plugins.update",
  pluginsSkillRead: "plugins.skillRead",
  pluginsSkillCreate: "plugins.skillCreate",
  pluginsSkillSave: "plugins.skillSave",
  pluginsSkillCopy: "plugins.skillCopy",
  pluginsSkillRemove: "plugins.skillRemove",
  pluginsOpenView: "plugins.openView",
  pluginsRequest: "plugins.request",
  pluginsModelPictures: "plugins.modelPictures",
  pluginsExport: "plugins.export",
  studioProjectsList: "studioProjects.list",
  studioProjectsSave: "studioProjects.save",
  studioProjectsTrash: "studioProjects.trash",
  studioDeliverablesPack: "studioDeliverables.pack",
  studioSyncSend: "studioSync.send",
  studioSyncRestore: "studioSync.restore",
  studioSyncStatus: "studioSync.status",
  studioGitHubSignInStart: "studioGitHub.signInStart",
  studioGitHubSignInCheck: "studioGitHub.signInCheck",
} as const;

// Starts a history in a project folder that has none: what is there is its first commit.
const WsProjectsStartHistoryRpc = Rpc.make(STUDIO_WS_METHODS.projectsStartHistory, {
  payload: ProjectStartHistoryInput,
  success: ProjectStartHistoryResult,
  error: Schema.Union([OrchestrationDispatchCommandError, EnvironmentAuthorizationError]),
});

// No union with EnvironmentAuthorizationError on the plugin and projects RPCs: the group's
// RpcScopeAuthorization middleware adds it to every RPC's error.
const WsPluginsCatalogRpc = Rpc.make(STUDIO_WS_METHODS.pluginsCatalog, {
  payload: PluginCatalogInput,
  success: PluginCatalogResult,
  error: PluginOperationError,
});

const WsPluginsListRpc = Rpc.make(STUDIO_WS_METHODS.pluginsList, {
  payload: Schema.Struct({}),
  success: PluginListResult,
  error: PluginOperationError,
});

const WsPluginsInstallRpc = Rpc.make(STUDIO_WS_METHODS.pluginsInstall, {
  payload: PluginInstallInput,
  success: InstalledPlugin,
  error: PluginOperationError,
});

const WsPluginsSetEnabledRpc = Rpc.make(STUDIO_WS_METHODS.pluginsSetEnabled, {
  payload: PluginSetEnabledInput,
  success: InstalledPlugin,
  error: PluginOperationError,
});

const WsPluginsUninstallRpc = Rpc.make(STUDIO_WS_METHODS.pluginsUninstall, {
  payload: PluginIdInput,
  success: Schema.Struct({}),
  error: PluginOperationError,
});

const WsPluginsSkillReadRpc = Rpc.make(STUDIO_WS_METHODS.pluginsSkillRead, {
  payload: PluginSkillReadInput,
  success: PluginSkillContent,
  error: PluginOperationError,
});

const WsPluginsSkillCreateRpc = Rpc.make(STUDIO_WS_METHODS.pluginsSkillCreate, {
  payload: PluginSkillCreateInput,
  success: PluginSkillResult,
  error: PluginOperationError,
});

const WsPluginsSkillSaveRpc = Rpc.make(STUDIO_WS_METHODS.pluginsSkillSave, {
  payload: PluginSkillSaveInput,
  success: PluginSkillResult,
  error: PluginOperationError,
});

const WsPluginsSkillCopyRpc = Rpc.make(STUDIO_WS_METHODS.pluginsSkillCopy, {
  payload: PluginSkillInput,
  success: PluginSkillResult,
  error: PluginOperationError,
});

const WsPluginsSkillRemoveRpc = Rpc.make(STUDIO_WS_METHODS.pluginsSkillRemove, {
  payload: PluginSkillResult,
  success: Schema.Struct({}),
  error: PluginOperationError,
});

const WsPluginsUpdateRpc = Rpc.make(STUDIO_WS_METHODS.pluginsUpdate, {
  payload: PluginIdInput,
  success: InstalledPlugin,
  error: PluginOperationError,
});

const WsPluginsOpenViewRpc = Rpc.make(STUDIO_WS_METHODS.pluginsOpenView, {
  payload: PluginOpenViewInput,
  success: PluginViewDocument,
  error: PluginOperationError,
});

const WsPluginsRequestRpc = Rpc.make(STUDIO_WS_METHODS.pluginsRequest, {
  payload: PluginRequestInput,
  success: PluginRequestResult,
  error: PluginOperationError,
});

const WsPluginsModelPicturesRpc = Rpc.make(STUDIO_WS_METHODS.pluginsModelPictures, {
  payload: PluginModelPicturesInput,
  success: PluginModelPicturesResult,
  error: PluginOperationError,
});

const WsPluginsExportRpc = Rpc.make(STUDIO_WS_METHODS.pluginsExport, {
  payload: PluginExportInput,
  success: PluginExportResult,
  error: PluginOperationError,
});

const WsStudioProjectsListRpc = Rpc.make(STUDIO_WS_METHODS.studioProjectsList, {
  payload: StudioProjectsListInput,
  success: StudioProjectsListResult,
  error: StudioProjectsError,
});

const WsStudioProjectsSaveRpc = Rpc.make(STUDIO_WS_METHODS.studioProjectsSave, {
  payload: StudioProjectsSaveInput,
  success: StudioProjectsSaveResult,
  error: StudioProjectsError,
});

const WsStudioProjectsTrashRpc = Rpc.make(STUDIO_WS_METHODS.studioProjectsTrash, {
  payload: StudioProjectsTrashInput,
  success: StudioProjectsSaveResult,
  error: StudioProjectsError,
});

// Writes the project's deliverables package: exports by the CAD tools, copies, the receipt, a zip.
const WsStudioDeliverablesPackRpc = Rpc.make(STUDIO_WS_METHODS.studioDeliverablesPack, {
  payload: StudioDeliverablesInput,
  success: StudioDeliverablesResult,
  error: StudioDeliverablesError,
});

const WsStudioGitHubSignInStartRpc = Rpc.make(STUDIO_WS_METHODS.studioGitHubSignInStart, {
  payload: Schema.Struct({}),
  success: StudioGitHubSignInStartResult,
  error: StudioGitHubSignInError,
});

const WsStudioGitHubSignInCheckRpc = Rpc.make(STUDIO_WS_METHODS.studioGitHubSignInCheck, {
  payload: StudioGitHubSignInCheckInput,
  success: StudioGitHubSignInCheckResult,
  error: StudioGitHubSignInError,
});

const WsStudioSyncSendRpc = Rpc.make(STUDIO_WS_METHODS.studioSyncSend, {
  payload: StudioSyncSendInput,
  success: StudioSyncSendResult,
  error: StudioSyncError,
});

const WsStudioSyncRestoreRpc = Rpc.make(STUDIO_WS_METHODS.studioSyncRestore, {
  payload: StudioSyncRestoreInput,
  success: StudioSyncRestoreResult,
  error: StudioSyncError,
});

const WsStudioSyncStatusRpc = Rpc.make(STUDIO_WS_METHODS.studioSyncStatus, {
  payload: StudioSyncStatusInput,
  success: StudioSyncStatusResult,
});

export const STUDIO_RPCS = [
  WsProjectsStartHistoryRpc,
  WsPluginsCatalogRpc,
  WsPluginsListRpc,
  WsPluginsInstallRpc,
  WsPluginsSetEnabledRpc,
  WsPluginsUninstallRpc,
  WsPluginsUpdateRpc,
  WsPluginsSkillReadRpc,
  WsPluginsSkillCreateRpc,
  WsPluginsSkillSaveRpc,
  WsPluginsSkillCopyRpc,
  WsPluginsSkillRemoveRpc,
  WsPluginsOpenViewRpc,
  WsPluginsRequestRpc,
  WsPluginsModelPicturesRpc,
  WsPluginsExportRpc,
  WsStudioProjectsListRpc,
  WsStudioProjectsSaveRpc,
  WsStudioProjectsTrashRpc,
  WsStudioDeliverablesPackRpc,
  WsStudioSyncSendRpc,
  WsStudioSyncRestoreRpc,
  WsStudioSyncStatusRpc,
  WsStudioGitHubSignInStartRpc,
  WsStudioGitHubSignInCheckRpc,
] as const;

/** Studio's calls the client checks before sending; the server requires the same scopes. */
export const STUDIO_CLIENT_GUARDED_RPC_SCOPES = {
  // Plugins run code on this environment for every provider.
  [STUDIO_WS_METHODS.pluginsInstall]: AuthProvidersManageScope,
  [STUDIO_WS_METHODS.pluginsSetEnabled]: AuthProvidersManageScope,
  [STUDIO_WS_METHODS.pluginsUninstall]: AuthProvidersManageScope,
  [STUDIO_WS_METHODS.pluginsUpdate]: AuthProvidersManageScope,
  [STUDIO_WS_METHODS.pluginsSkillCreate]: AuthProvidersManageScope,
  [STUDIO_WS_METHODS.pluginsSkillSave]: AuthProvidersManageScope,
  [STUDIO_WS_METHODS.pluginsSkillCopy]: AuthProvidersManageScope,
  [STUDIO_WS_METHODS.pluginsSkillRemove]: AuthProvidersManageScope,
  [STUDIO_WS_METHODS.studioSyncSend]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioSyncRestore]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioGitHubSignInStart]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioGitHubSignInCheck]: AuthSourceControlWriteScope,
} as const;
