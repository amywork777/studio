// Studio's WebSocket handlers and usage counts, each taken into T3 Code's `ws.ts` with one line.
import {
  OrchestrationDispatchCommandError,
  type OrchestrationV2Command,
  StudioTeamsError,
  type ProviderInstanceId,
  WS_METHODS,
  type WsRpcGroup,
} from "@t3tools/contracts";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import type { RpcGroup } from "effect/rpc";

import * as PluginService from "../plugins/PluginService.ts";
import * as PluginUsageEvents from "../plugins/usageEvents.ts";
import * as ManagedProjectFolders from "../project/ManagedProjectFolders.ts";
import * as RepositoryIdentityResolver from "../project/RepositoryIdentityResolver.ts";
import type * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";
import type * as AnalyticsService from "../telemetry/AnalyticsService.ts";
import * as SkillUse from "../telemetry/SkillUse.ts";
import * as StudioAnalytics from "../telemetry/StudioAnalytics.ts";
import * as StudioGitHubSignIn from "./StudioGitHubSignIn.ts";
import * as StudioProjects from "./StudioProjects.ts";
import * as StudioSamples from "./StudioSamples.ts";
import * as StudioSync from "./StudioSync.ts";
import * as StudioTeams from "./StudioTeams.ts";

type Analytics = AnalyticsService.AnalyticsService["Service"];
type WsHandlers = Partial<RpcGroup.HandlersFrom<RpcGroup.Rpcs<typeof WsRpcGroup>>>;

/** Which of Studio's skills and jobs a message asked for, by names from a closed list only. */
const recordSkillsUsed = (analytics: Analytics, text: string) =>
  Effect.forEach(
    SkillUse.skillsUsed(text),
    (use) => analytics.record("studio.skill.used", { ...use }).pipe(Effect.ignore),
    { discard: true },
  );

/** A client's command: the skills a message asked for. */
export const recordCommandSkills = (analytics: Analytics, command: OrchestrationV2Command) =>
  command.type === "message.dispatch" ? recordSkillsUsed(analytics, command.text) : Effect.void;

/**
 * A new chat counts by the AI it starts with, by its kind (Claude, Codex and the rest), in place of
 * T3's workspace strategy; its first message counts as a requested turn with the skills it asked for.
 */
export const recordThreadStarted = (
  analytics: Analytics,
  providerInstances: ProviderInstanceRegistry.ProviderInstanceRegistry["Service"],
  originProps: Readonly<Record<string, unknown>>,
  input: {
    readonly modelSelection: { readonly instanceId: ProviderInstanceId };
    readonly initialMessage?: { readonly text: string } | undefined;
  },
) =>
  providerInstances.getInstance(input.modelSelection.instanceId).pipe(
    Effect.map((instance) => instance?.driverKind ?? "unknown"),
    Effect.orElseSucceed(() => "unknown"),
    Effect.flatMap((provider) =>
      analytics.record("client.thread.started", { ...originProps, provider }),
    ),
    Effect.andThen(
      input.initialMessage === undefined
        ? Effect.void
        : analytics
            .record("client.turn.requested", originProps)
            .pipe(Effect.andThen(recordSkillsUsed(analytics, input.initialMessage.text))),
    ),
    Effect.ignore,
  );

/** Studio still counts connections (README's "Usage data"), reconnects included. */
export const recordConnected = (analytics: Analytics, props: Readonly<Record<string, unknown>>) =>
  analytics.record("client.connected", props);

/** Whether this install can send usage data and the anonymous id it sends with, for the client. */
export const configObservability = Effect.all({
  usageDataAvailable: StudioAnalytics.usageDataAvailable.pipe(Effect.orElseSucceed(() => false)),
  usageId: StudioAnalytics.usageId.pipe(Effect.orElseSucceed(() => null)),
});

/** The finished sample projects an app built on T3 ships (Studio's examples). */
export const configSamples = Effect.gen(function* () {
  const samplesDir = yield* Config.String("T3CODE_SAMPLES_DIR").pipe(
    Config.withDefault(""),
    Config.map((folder) => folder.trim()),
    Effect.orElseSucceed(() => ""),
  );
  const samples = samplesDir === "" ? [] : yield* StudioSamples.readSamples(samplesDir);
  return samples.length === 0 ? {} : { samples };
});

/** The handlers for Studio's RPCs (`packages/contracts/src/studioRpc.ts`). */
export const makeHandlers = Effect.fn("ws.makeStudioHandlers")(function* (
  analytics: Analytics,
  refreshGitStatus: (cwd: string) => Effect.Effect<void>,
) {
  const plugins = yield* PluginService.PluginService;
  const studioProjects = yield* StudioProjects.StudioProjects;
  const studioSync = yield* StudioSync.StudioSync;
  const studioGitHubSignIn = yield* StudioGitHubSignIn.StudioGitHubSignIn;
  const studioTeams = yield* StudioTeams.StudioTeams;
  const managedFolders = yield* ManagedProjectFolders.ManagedProjectFolders;
  const repositoryIdentityResolver = yield* RepositoryIdentityResolver.RepositoryIdentityResolver;
  return {
    [WS_METHODS.pluginsCatalog]: (input) => plugins.catalog(input),
    [WS_METHODS.pluginsList]: () => plugins.list,
    [WS_METHODS.pluginsInstall]: (input) => plugins.install(input.key),
    [WS_METHODS.pluginsSetEnabled]: (input) => plugins.setEnabled(input.pluginId, input.enabled),
    [WS_METHODS.pluginsUninstall]: (input) => plugins.uninstall(input.pluginId).pipe(Effect.as({})),
    [WS_METHODS.pluginsUpdate]: (input) => plugins.update(input.pluginId),
    [WS_METHODS.pluginsSkillRead]: (input) => plugins.readSkill(input),
    [WS_METHODS.pluginsSkillCreate]: (input) => plugins.createSkill(input),
    [WS_METHODS.pluginsSkillSave]: (input) => plugins.saveSkill(input),
    [WS_METHODS.pluginsSkillCopy]: (input) => plugins.copySkill(input),
    [WS_METHODS.pluginsSkillRemove]: (input) =>
      plugins.removeSkill(input.skill).pipe(Effect.as({})),
    [WS_METHODS.pluginsOpenView]: (input) => plugins.openView(input),
    [WS_METHODS.pluginsRequest]: (input) =>
      plugins.request(input).pipe(
        Effect.tap(({ result }) => {
          const usage = PluginUsageEvents.cadUsageEvent(input.method, input.params, result);
          return usage === null
            ? Effect.void
            : analytics.record(usage.event, usage.properties).pipe(Effect.ignore);
        }),
      ),
    [WS_METHODS.pluginsModelPictures]: (input) => plugins.modelPictures(input),
    [WS_METHODS.studioProjectsList]: () => studioProjects.list,
    [WS_METHODS.studioProjectsSave]: (input) =>
      studioProjects.save(input).pipe(
        // A new project counts by its starter's id (blank, sheet metal, an example) and how it
        // came to be (made, imported, restored, copied), no name.
        Effect.tap(() => {
          if (input.id !== null) return Effect.void;
          const { template } = input.project;
          return analytics
            .record("studio.project.created", {
              template: template !== null && /^[a-z0-9-]{1,40}$/.test(template) ? template : "none",
              origin: input.origin ?? "new",
            })
            .pipe(Effect.ignore);
        }),
      ),
    [WS_METHODS.studioProjectsTrash]: (input) =>
      studioProjects[input.action](input.id).pipe(
        // Moving a project to Trash, back, or out for good counts by the action alone.
        Effect.tap(() =>
          (input.action === "trash"
            ? analytics.record("studio.project.trashed")
            : input.action === "restore"
              ? analytics.record("studio.project.restored")
              : analytics.record("studio.project.deleted")
          ).pipe(Effect.ignore),
        ),
      ),
    [WS_METHODS.studioSyncSend]: (input) =>
      studioSync.send(input).pipe(
        // A Sync counts by how it ended, never by the project or its online copy.
        Effect.tap((result) =>
          analytics
            .record("studio.sync.sent", { outcome: result.sent ? "sent" : "unchanged" })
            .pipe(Effect.ignore),
        ),
        Effect.tapError(() =>
          analytics.record("studio.sync.sent", { outcome: "failed" }).pipe(Effect.ignore),
        ),
        // A failed first send can still have linked the online copy, so both ways refresh.
        Effect.ensuring(
          repositoryIdentityResolver
            .resolve(input.cwd, { refresh: true })
            .pipe(Effect.andThen(refreshGitStatus(input.cwd)), Effect.ignore({ log: true })),
        ),
      ),
    [WS_METHODS.studioSyncRestore]: (input) =>
      managedFolders.newProjectsRoot.pipe(
        Effect.flatMap((root) => studioSync.restore({ ...input, root })),
        Effect.tap(() =>
          analytics.record("studio.sync.restored", { outcome: "restored" }).pipe(Effect.ignore),
        ),
        Effect.tapError(() =>
          analytics.record("studio.sync.restored", { outcome: "failed" }).pipe(Effect.ignore),
        ),
      ),
    [WS_METHODS.studioSyncStatus]: (input) => studioSync.status(input),
    [WS_METHODS.studioGitHubSignInStart]: () => studioGitHubSignIn.start,
    [WS_METHODS.studioGitHubSignInCheck]: (input) =>
      studioGitHubSignIn
        .check(input)
        .pipe(
          Effect.tap(({ state }) =>
            state === "signed-in"
              ? analytics.record("studio.github.connected").pipe(Effect.ignore)
              : Effect.void,
          ),
        ),
    [WS_METHODS.studioTeamsStatus]: () => studioTeams.status,
    [WS_METHODS.studioTeamsSignInStart]: (input) =>
      studioTeams.signInStart(input).pipe(Effect.as({})),
    [WS_METHODS.studioTeamsSignInCheck]: (input) => studioTeams.signInCheck(input),
    [WS_METHODS.studioTeamsSignOut]: () => studioTeams.signOut.pipe(Effect.as({})),
    [WS_METHODS.studioTeamsCreate]: (input) => studioTeams.create(input),
    [WS_METHODS.studioTeamsInvite]: (input) => studioTeams.invite(input),
    [WS_METHODS.studioTeamsRemove]: (input) => studioTeams.remove(input),
    [WS_METHODS.studioTeamsProjects]: () => studioTeams.projects,
    [WS_METHODS.studioTeamsShare]: (input) =>
      studioTeams.share(input).pipe(Effect.ensuring(refreshGitStatus(input.cwd))),
    [WS_METHODS.studioTeamsGet]: (input) =>
      managedFolders.newProjectsRoot.pipe(
        Effect.mapError(
          () =>
            new StudioTeamsError({
              reason: "local",
              message: "Studio could not find its projects folder.",
            }),
        ),
        Effect.flatMap((root) => studioTeams.get({ ...input, root })),
      ),
    [WS_METHODS.studioTeamsFolderStatus]: (input) => studioTeams.folderStatus(input),
    [WS_METHODS.studioTeamsCheckOut]: (input) =>
      studioTeams.checkOut(input).pipe(Effect.ensuring(refreshGitStatus(input.cwd))),
    [WS_METHODS.studioTeamsCheckIn]: (input) =>
      studioTeams.checkIn(input).pipe(Effect.ensuring(refreshGitStatus(input.cwd))),
    [WS_METHODS.studioTeamsGetLatest]: (input) =>
      studioTeams.getLatest(input).pipe(Effect.ensuring(refreshGitStatus(input.cwd))),
    [WS_METHODS.studioTeamsRelease]: (input) => studioTeams.release(input),
    [WS_METHODS.projectsStartHistory]: (input) =>
      managedFolders.startHistory(input).pipe(
        Effect.tap(() => refreshGitStatus(input.cwd)),
        Effect.mapError(
          (cause) => new OrchestrationDispatchCommandError({ message: cause.message, cause }),
        ),
      ),
  } satisfies WsHandlers;
});
