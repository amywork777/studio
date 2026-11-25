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
import {
  StudioTeamsCheckInInput,
  StudioTeamsCreateInput,
  StudioTeamsDeleteProjectInput,
  StudioTeamsError,
  StudioTeamsFolderInput,
  StudioTeamsFolderStatusResult,
  StudioTeamsGetInput,
  StudioTeamsGetResult,
  StudioTeamsInviteInput,
  StudioTeamsProjectsResult,
  StudioTeamsRemoveInput,
  StudioTeamsReviewCommentInput,
  StudioTeamsReviewDecideInput,
  StudioTeamsShareInput,
  StudioTeamsShareLinkInput,
  StudioTeamsShareLinkResult,
  StudioTeamsSignInCheckInput,
  StudioTeamsSignInStartInput,
  StudioTeamsStatusResult,
  StudioTeamsTeamInput,
} from "./studioTeams.ts";

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
  studioProjectsList: "studioProjects.list",
  studioProjectsSave: "studioProjects.save",
  studioProjectsTrash: "studioProjects.trash",
  studioSyncSend: "studioSync.send",
  studioSyncRestore: "studioSync.restore",
  studioSyncStatus: "studioSync.status",
  studioGitHubSignInStart: "studioGitHub.signInStart",
  studioGitHubSignInCheck: "studioGitHub.signInCheck",
  studioTeamsStatus: "studioTeams.status",
  studioTeamsSignInStart: "studioTeams.signInStart",
  studioTeamsSignInCheck: "studioTeams.signInCheck",
  studioTeamsSignOut: "studioTeams.signOut",
  studioTeamsCreate: "studioTeams.create",
  studioTeamsInvite: "studioTeams.invite",
  studioTeamsRemove: "studioTeams.remove",
  studioTeamsDeleteTeam: "studioTeams.deleteTeam",
  studioTeamsDeleteProject: "studioTeams.deleteProject",
  studioTeamsDeleteAccount: "studioTeams.deleteAccount",
  studioTeamsProjects: "studioTeams.projects",
  studioTeamsShare: "studioTeams.share",
  studioTeamsShareLink: "studioTeams.shareLink",
  studioTeamsGet: "studioTeams.get",
  studioTeamsFolderStatus: "studioTeams.folderStatus",
  studioTeamsCheckOut: "studioTeams.checkOut",
  studioTeamsCheckIn: "studioTeams.checkIn",
  studioTeamsGetLatest: "studioTeams.getLatest",
  studioTeamsRelease: "studioTeams.release",
  studioTeamsReviewComment: "studioTeams.reviewComment",
  studioTeamsReviewDecide: "studioTeams.reviewDecide",
  studioTeamsReleaseVersion: "studioTeams.releaseVersion",
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

// Studio Teams (`studioTeams.ts`): sign-in, the team's people, and check-out and check-in.
const WsStudioTeamsStatusRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsStatus, {
  payload: Schema.Struct({}),
  success: StudioTeamsStatusResult,
  error: StudioTeamsError,
});

const WsStudioTeamsSignInStartRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsSignInStart, {
  payload: StudioTeamsSignInStartInput,
  success: Schema.Struct({}),
  error: StudioTeamsError,
});

const WsStudioTeamsSignInCheckRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsSignInCheck, {
  payload: StudioTeamsSignInCheckInput,
  success: StudioTeamsStatusResult,
  error: StudioTeamsError,
});

const WsStudioTeamsSignOutRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsSignOut, {
  payload: Schema.Struct({}),
  success: Schema.Struct({}),
  error: StudioTeamsError,
});

const WsStudioTeamsCreateRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsCreate, {
  payload: StudioTeamsCreateInput,
  success: StudioTeamsStatusResult,
  error: StudioTeamsError,
});

const WsStudioTeamsInviteRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsInvite, {
  payload: StudioTeamsInviteInput,
  success: StudioTeamsStatusResult,
  error: StudioTeamsError,
});

const WsStudioTeamsRemoveRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsRemove, {
  payload: StudioTeamsRemoveInput,
  success: StudioTeamsStatusResult,
  error: StudioTeamsError,
});

const WsStudioTeamsDeleteTeamRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsDeleteTeam, {
  payload: StudioTeamsTeamInput,
  success: StudioTeamsStatusResult,
  error: StudioTeamsError,
});

const WsStudioTeamsDeleteProjectRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsDeleteProject, {
  payload: StudioTeamsDeleteProjectInput,
  success: StudioTeamsProjectsResult,
  error: StudioTeamsError,
});

const WsStudioTeamsDeleteAccountRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsDeleteAccount, {
  payload: Schema.Struct({}),
  success: StudioTeamsStatusResult,
  error: StudioTeamsError,
});

const WsStudioTeamsProjectsRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsProjects, {
  payload: Schema.Struct({}),
  success: StudioTeamsProjectsResult,
  error: StudioTeamsError,
});

const WsStudioTeamsShareRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsShare, {
  payload: StudioTeamsShareInput,
  success: StudioTeamsFolderStatusResult,
  error: StudioTeamsError,
});

const WsStudioTeamsShareLinkRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsShareLink, {
  payload: StudioTeamsShareLinkInput,
  success: StudioTeamsShareLinkResult,
  error: StudioTeamsError,
});

const WsStudioTeamsGetRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsGet, {
  payload: StudioTeamsGetInput,
  success: StudioTeamsGetResult,
  error: StudioTeamsError,
});

const WsStudioTeamsFolderStatusRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsFolderStatus, {
  payload: StudioTeamsFolderInput,
  success: StudioTeamsFolderStatusResult,
  error: StudioTeamsError,
});

const WsStudioTeamsCheckOutRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsCheckOut, {
  payload: StudioTeamsFolderInput,
  success: StudioTeamsFolderStatusResult,
  error: StudioTeamsError,
});

const WsStudioTeamsCheckInRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsCheckIn, {
  payload: StudioTeamsCheckInInput,
  success: StudioTeamsFolderStatusResult,
  error: StudioTeamsError,
});

const WsStudioTeamsGetLatestRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsGetLatest, {
  payload: StudioTeamsFolderInput,
  success: StudioTeamsFolderStatusResult,
  error: StudioTeamsError,
});

const WsStudioTeamsReleaseRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsRelease, {
  payload: StudioTeamsFolderInput,
  success: StudioTeamsFolderStatusResult,
  error: StudioTeamsError,
});

const WsStudioTeamsReviewCommentRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsReviewComment, {
  payload: StudioTeamsReviewCommentInput,
  success: StudioTeamsFolderStatusResult,
  error: StudioTeamsError,
});

const WsStudioTeamsReviewDecideRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsReviewDecide, {
  payload: StudioTeamsReviewDecideInput,
  success: StudioTeamsFolderStatusResult,
  error: StudioTeamsError,
});

const WsStudioTeamsReleaseVersionRpc = Rpc.make(STUDIO_WS_METHODS.studioTeamsReleaseVersion, {
  payload: StudioTeamsFolderInput,
  success: StudioTeamsFolderStatusResult,
  error: StudioTeamsError,
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
  WsStudioProjectsListRpc,
  WsStudioProjectsSaveRpc,
  WsStudioProjectsTrashRpc,
  WsStudioSyncSendRpc,
  WsStudioSyncRestoreRpc,
  WsStudioSyncStatusRpc,
  WsStudioGitHubSignInStartRpc,
  WsStudioGitHubSignInCheckRpc,
  WsStudioTeamsStatusRpc,
  WsStudioTeamsSignInStartRpc,
  WsStudioTeamsSignInCheckRpc,
  WsStudioTeamsSignOutRpc,
  WsStudioTeamsCreateRpc,
  WsStudioTeamsInviteRpc,
  WsStudioTeamsRemoveRpc,
  WsStudioTeamsDeleteTeamRpc,
  WsStudioTeamsDeleteProjectRpc,
  WsStudioTeamsDeleteAccountRpc,
  WsStudioTeamsProjectsRpc,
  WsStudioTeamsShareRpc,
  WsStudioTeamsShareLinkRpc,
  WsStudioTeamsGetRpc,
  WsStudioTeamsFolderStatusRpc,
  WsStudioTeamsCheckOutRpc,
  WsStudioTeamsCheckInRpc,
  WsStudioTeamsGetLatestRpc,
  WsStudioTeamsReleaseRpc,
  WsStudioTeamsReviewCommentRpc,
  WsStudioTeamsReviewDecideRpc,
  WsStudioTeamsReleaseVersionRpc,
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
  // Team calls act as the person signed in on this environment and move project files.
  [STUDIO_WS_METHODS.studioTeamsSignInStart]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioTeamsSignInCheck]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioTeamsSignOut]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioTeamsCreate]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioTeamsInvite]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioTeamsRemove]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioTeamsDeleteTeam]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioTeamsDeleteProject]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioTeamsDeleteAccount]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioTeamsShare]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioTeamsShareLink]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioTeamsGet]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioTeamsCheckOut]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioTeamsCheckIn]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioTeamsGetLatest]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioTeamsRelease]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioTeamsReviewComment]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioTeamsReviewDecide]: AuthSourceControlWriteScope,
  [STUDIO_WS_METHODS.studioTeamsReleaseVersion]: AuthSourceControlWriteScope,
} as const;
