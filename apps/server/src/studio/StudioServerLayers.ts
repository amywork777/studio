// Studio's server layers, each taken into T3 Code's `server.ts` with one line.
import * as GitHubCredentials from "@t3tools/source-control-github/server/GitHubCredentials";
import * as Layer from "effect/Layer";

import * as BundledPlugins from "../plugins/BundledPlugins.ts";
import * as PluginService from "../plugins/PluginService.ts";
import * as PluginToolSessions from "../plugins/PluginToolSessions.ts";
import * as ProcessRunner from "../processRunner.ts";
import type * as SourceControlRepositoryService from "../sourceControl/SourceControlRepositoryService.ts";
import * as AppUpdated from "../telemetry/AppUpdated.ts";
import * as ClaudeSignIn from "../telemetry/ClaudeSignIn.ts";
import * as StudioAnalytics from "../telemetry/StudioAnalytics.ts";
import * as TurnFailure from "../telemetry/TurnFailure.ts";
import * as StudioGitHubSignIn from "./StudioGitHubSignIn.ts";
import * as StudioProjects from "./StudioProjects.ts";
import * as StudioSync from "./StudioSync.ts";
import * as StudioTeams from "./StudioTeams.ts";

/** Studio's usage counts in place of T3's analytics; reads the usage-data setting on each event. */
export const layerAnalytics = StudioAnalytics.layer;

/** Counts a provider turn that failed, for the orchestration runtime's event ingestor. */
export const layerTurnFailureAnalytics = TurnFailure.layerFailureAnalytics;

/** Beside T3's core runtime services. */
export const layerCoreServices = Layer.mergeAll(
  // One plugin host for the WebSocket views and the agents' MCP tools.
  PluginService.layer,
  // Counts a Claude sign-in when an instance's auth status turns authenticated.
  ClaudeSignIn.layer,
  // Counts a launch of another release than the one that ran last.
  AppUpdated.layer,
);

/**
 * Studio projects, Sync, Teams and GitHub sign-in, below the orchestration runtime so a turn reads its
 * thread's Studio project; the WebSocket lists and saves them. The repository service carries the
 * source control host that GitHub's credentials read.
 */
export const layerProjects = <E, R>(
  repositories: Layer.Layer<SourceControlRepositoryService.SourceControlRepositoryService, E, R>,
) =>
  StudioProjects.layer.pipe(
    Layer.provide(ProcessRunner.layer),
    Layer.provideMerge(
      // Teams checks in through Sync's own checks and commit.
      StudioTeams.layer.pipe(
        Layer.provide(ProcessRunner.layer),
        Layer.provideMerge(
          StudioSync.layer.pipe(
            Layer.provide(ProcessRunner.layer),
            Layer.provide(GitHubCredentials.layer),
            Layer.provide(repositories),
          ),
        ),
      ),
    ),
    Layer.provideMerge(StudioGitHubSignIn.layer),
  );

/** Installed plugins: provider adapters load their skills, routes and MCP serve their tools. */
export const layerPluginStore = BundledPlugins.storeLayer;

/** On top of the runtime's dependencies. */
export const layerPluginRuntime = Layer.mergeAll(
  // Offers the app's bundled plugins once the plugin service is up.
  BundledPlugins.layer,
  // Provider sessions open again once idle when the plugin tools agents see change.
  PluginToolSessions.layer,
);
