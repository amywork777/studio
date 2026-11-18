// What the server needs to know about Studio's RPCs, spread into T3 Code's tables with one line each:
// the scope each needs beyond the client-guarded ones (`auth/RpcAuthorization.ts`) and its trace
// aggregate (`observability/RpcInstrumentation.ts`).
import {
  AuthFilesystemReadScope,
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  AuthProvidersManageScope,
  WS_METHODS,
} from "@t3tools/contracts";

export const STUDIO_RPC_REQUIRED_SCOPES = {
  [WS_METHODS.pluginsCatalog]: AuthOrchestrationReadScope,
  [WS_METHODS.pluginsList]: AuthOrchestrationReadScope,
  [WS_METHODS.pluginsInstall]: AuthProvidersManageScope,
  [WS_METHODS.pluginsSetEnabled]: AuthProvidersManageScope,
  [WS_METHODS.pluginsUninstall]: AuthProvidersManageScope,
  [WS_METHODS.pluginsUpdate]: AuthProvidersManageScope,
  [WS_METHODS.pluginsSkillRead]: AuthOrchestrationReadScope,
  [WS_METHODS.pluginsSkillCreate]: AuthProvidersManageScope,
  [WS_METHODS.pluginsSkillSave]: AuthProvidersManageScope,
  [WS_METHODS.pluginsSkillCopy]: AuthProvidersManageScope,
  [WS_METHODS.pluginsSkillRemove]: AuthProvidersManageScope,
  [WS_METHODS.pluginsOpenView]: AuthOrchestrationOperateScope,
  [WS_METHODS.pluginsRequest]: AuthOrchestrationOperateScope,
  [WS_METHODS.pluginsModelPictures]: AuthOrchestrationOperateScope,
  // Projects are files on this machine; listing them reads like listing a folder.
  [WS_METHODS.studioProjectsList]: AuthFilesystemReadScope,
  [WS_METHODS.studioProjectsSave]: AuthOrchestrationOperateScope,
  [WS_METHODS.studioProjectsTrash]: AuthOrchestrationOperateScope,
  [WS_METHODS.studioSyncStatus]: AuthOrchestrationReadScope,
  [WS_METHODS.projectsStartHistory]: AuthOrchestrationOperateScope,
} as const;

export const STUDIO_RPC_AGGREGATES = {
  [WS_METHODS.pluginsCatalog]: "server",
  [WS_METHODS.pluginsList]: "server",
  [WS_METHODS.pluginsInstall]: "server",
  [WS_METHODS.pluginsSetEnabled]: "server",
  [WS_METHODS.pluginsUninstall]: "server",
  [WS_METHODS.pluginsUpdate]: "server",
  [WS_METHODS.pluginsSkillRead]: "server",
  [WS_METHODS.pluginsSkillCreate]: "server",
  [WS_METHODS.pluginsSkillSave]: "server",
  [WS_METHODS.pluginsSkillCopy]: "server",
  [WS_METHODS.pluginsSkillRemove]: "server",
  [WS_METHODS.pluginsOpenView]: "server",
  [WS_METHODS.pluginsRequest]: "server",
  [WS_METHODS.pluginsModelPictures]: "server",
  [WS_METHODS.studioProjectsList]: "server",
  [WS_METHODS.studioProjectsSave]: "server",
  [WS_METHODS.studioProjectsTrash]: "server",
  [WS_METHODS.studioSyncSend]: "source-control",
  [WS_METHODS.studioSyncRestore]: "source-control",
  [WS_METHODS.studioSyncStatus]: "source-control",
  [WS_METHODS.studioGitHubSignInStart]: "source-control",
  [WS_METHODS.studioGitHubSignInCheck]: "source-control",
  [WS_METHODS.projectsStartHistory]: "orchestration",
} as const;
