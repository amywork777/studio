import { workspaceRelativePath } from "@t3tools/client-runtime/state/pluginFollow";
import type {
  ThreadStructureTurnItem,
  ThreadStructureVisibleTurnItem,
} from "@t3tools/client-runtime/state/shell";
import { pluginFileHandlers } from "@t3tools/client-runtime/state/plugins";
import type {
  EnvironmentId,
  InstalledPlugin,
  OrchestrationV2TurnItem,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { useEffect } from "react";

import { type RightPanelSurface, useRightPanelStore } from "~/rightPanelStore";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import type { TurnDiffSummary } from "~/types";
import { pluginAppSurface } from "../plugins/pluginSurfaces";
import { shownView } from "./shownModels";
import { useEngineeringSurfaces } from "./studioInterface";

/**
 * What a run makes that a person opens, by kind: a document (a plan, a
 * report) above a table (a BOM) or machine code (G-code) above a picture.
 * Source and configuration never open: with the engineering surfaces on,
 * code stays put away.
 */
const OUTPUT_RANKS: ReadonlyArray<readonly [RegExp, number]> = [
  [/\.(?:md|mdx|pdf)$/i, 4],
  [/\.(?:csv|tsv)$/i, 3],
  [/\.(?:nc|gcode|ngc|tap|gco)$/i, 3],
  [/\.(?:png|jpe?g|webp|gif|svg)$/i, 2],
  [/\.(?:txt|html?)$/i, 1],
];
/** Files that instruct the agent, or that a repository keeps for itself: not the agent's work. */
const NOT_AN_OUTPUT =
  /(?:^|\/)(?:AGENTS|CLAUDE|GEMINI|README|CHANGELOG|LICENSE|CONTRIBUTING)\.md$|(?:^|\/)brief\/brief\.json$/i;
/** A study's or a job's result (an FEA colour map, a toolpath), as text-to-cad names and files them. */
const RESULT =
  /(?:^|\/)(?:studies|results|fea|cfd|sim|cam)\/|\.(?:fea|cfd|sim|study|result|toolpath)\.[a-z0-9]+$/i;

/** Whether a path can be the agent's work: not an instruction file, a tool folder (`.claude/`) or an environment. */
function isWork(path: string): boolean {
  return (
    !NOT_AN_OUTPUT.test(path) &&
    !path.split("/").some((segment) => segment.startsWith(".") || segment === "node_modules")
  );
}

export function outputRank(path: string): number {
  if (!isWork(path)) return 0;
  return OUTPUT_RANKS.find(([pattern]) => pattern.test(path))?.[1] ?? 0;
}

/** The documents a settled file edit wrote, workspace-relative, deletions left out. */
export function writtenDocuments(item: OrchestrationV2TurnItem, root: string | null): string[] {
  return writtenFiles(item, root).filter((path) => outputRank(path) > 0);
}

function writtenFiles(item: ThreadStructureTurnItem, root: string | null): string[] {
  if (item.type !== "file_change" || item.status !== "completed") return [];
  const changes = item.changes ?? [];
  const paths =
    changes.length === 0
      ? [item.fileName]
      : changes.filter((change) => !/^del/i.test(change.operation)).map((change) => change.path);
  return paths.flatMap((path) => {
    const relative = workspaceRelativePath(path, root);
    return relative === null ? [] : [relative];
  });
}

/** The best output among paths: the highest rank, the last of equals. */
export function bestOutput(paths: ReadonlyArray<string>): string | null {
  let best: { readonly path: string; readonly rank: number } | null = null;
  for (const path of paths) {
    const rank = outputRank(path);
    if (rank > 0 && (best === null || rank >= best.rank)) best = { path, rank };
  }
  return best?.path ?? null;
}

export type FollowPick =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "viewer"; readonly path: string };

/**
 * The one thing a run made that is most worth showing, or null: a document
 * it wrote, else a result a viewer draws (a study, a toolpath), else a model,
 * board or drawing it changed, else a table or G-code, else a picture. A file
 * a viewer claims opens there; one the viewer already shows is left be.
 */
export function pickFollow(
  paths: ReadonlyArray<string>,
  claimed: (path: string) => boolean,
  shown: (path: string) => boolean,
): FollowPick | null {
  let best: { readonly pick: FollowPick; readonly rank: number } | null = null;
  for (const path of paths) {
    if (!isWork(path)) continue;
    let pick: FollowPick | null = null;
    let rank = 0;
    if (claimed(path)) {
      if (shown(path)) continue;
      pick = { kind: "viewer", path };
      rank = RESULT.test(path) ? 5 : 3.5;
    } else {
      const output = outputRank(path);
      if (output === 0) continue;
      pick = { kind: "file", path };
      rank = output === 4 ? 6 : output;
    }
    if (best === null || rank >= best.rank) best = { pick, rank };
  }
  return best?.pick ?? null;
}

interface RunFollow {
  /** The panel's user-action count when the run began: a choice made since wins. */
  readonly revision: number;
  /** What the run's settled edits wrote, workspace-relative. */
  readonly written: string[];
  /** Whether the run has had its one thing opened. */
  done: boolean;
}

// Per thread for the session: runs seen live, and the items and checkpoints already read.
const followed = new Map<
  string,
  {
    readonly runs: Map<string, RunFollow>;
    readonly items: Set<string>;
    readonly checkpoints: Set<string>;
  }
>();

/**
 * With the engineering surfaces on, what the agent makes comes to the person, in
 * measure: one thing per run, the most worth seeing (`pickFollow`). A
 * document it writes opens as soon as it is written; otherwise, when the run
 * ends, its checkpoint names everything it made (models its commands built, a
 * study's result, G-code), and the best of those opens, in the viewer when
 * one draws it. Nothing the viewer already shows opens again, and a panel
 * choice the person made during the run is never overridden. The rest stays
 * on the project page. Only runs seen live: opening an old thread never
 * replays its finished runs.
 */
export function useDocumentFollow(input: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef | null;
  readonly threadKey: string | null;
  readonly runningRunId: string | null;
  readonly items: ReadonlyArray<ThreadStructureVisibleTurnItem>;
  readonly checkpoints: ReadonlyArray<TurnDiffSummary>;
  readonly workspaceRoot: string | null;
}) {
  const { environmentId, threadRef, threadKey, runningRunId, items, checkpoints, workspaceRoot } =
    input;
  const engineering = useEngineeringSurfaces();
  const list = useEnvironmentQuery(
    engineering && threadRef !== null ? pluginEnvironment.list({ environmentId, input: {} }) : null,
  );
  const plugins = list.data?.plugins;

  useEffect(() => {
    if (!engineering || threadRef === null || threadKey === null || runningRunId === null) return;
    let state = followed.get(threadKey);
    if (state === undefined) {
      state = { runs: new Map(), items: new Set(), checkpoints: new Set() };
      followed.set(threadKey, state);
    }
    if (!state.runs.has(runningRunId)) {
      state.runs.set(runningRunId, {
        revision: useRightPanelStore.getState().getUserActionRevision(threadRef),
        written: [],
        done: false,
      });
    }
  }, [engineering, threadRef, threadKey, runningRunId]);

  useEffect(() => {
    if (!engineering || threadRef === null || threadKey === null) return;
    const state = followed.get(threadKey);
    if (state === undefined) return;
    const show = (run: RunFollow, pick: FollowPick | null) => {
      if (pick === null) return;
      run.done = true;
      const panels = useRightPanelStore.getState();
      if (pick.kind === "file") {
        const surface: Extract<RightPanelSurface, { kind: "file" }> = {
          id: `file:${pick.path}`,
          kind: "file",
          relativePath: pick.path,
          revealLine: null,
          revealRequestId: 0,
        };
        panels.openProactive(threadRef, surface, run.revision);
        return;
      }
      const choice = plugins === undefined ? undefined : pluginFileHandlers(plugins, pick.path)[0];
      if (choice !== undefined) {
        panels.openProactive(threadRef, pluginAppSurface(choice, pick.path), run.revision);
      }
    };

    // A document opens as soon as it is written: the run's one thing.
    for (const { item } of items) {
      const run = item.runId === null ? undefined : state.runs.get(item.runId);
      if (run === undefined || state.items.has(item.id) || item.status !== "completed") continue;
      state.items.add(item.id);
      const written = writtenFiles(item, workspaceRoot);
      run.written.push(...written);
      if (run.done) continue;
      const document = written.findLast((path) => outputRank(path) === 4);
      if (document !== undefined) show(run, { kind: "file", path: document });
    }

    for (const checkpoint of checkpoints) {
      const key = `${checkpoint.runId}:${checkpoint.checkpointTurnCount}`;
      const run = state.runs.get(checkpoint.runId);
      if (run === undefined || state.checkpoints.has(key)) continue;
      state.checkpoints.add(key);
      if (run.done) continue;
      const viewing = shownView(threadRef)?.path ?? null;
      show(
        run,
        pickFollow(
          [...run.written, ...checkpoint.files.map((file) => file.path)],
          (path) => claimedByViewer(plugins, path),
          (path) => viewing !== null && (viewing === path || viewing.endsWith(`/${path}`)),
        ),
      );
    }
  }, [engineering, threadRef, threadKey, items, checkpoints, workspaceRoot, plugins]);
}

function claimedByViewer(plugins: ReadonlyArray<InstalledPlugin> | undefined, path: string) {
  return plugins !== undefined && pluginFileHandlers(plugins, path)[0] !== undefined;
}
