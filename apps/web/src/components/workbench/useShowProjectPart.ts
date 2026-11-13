import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { useEffect } from "react";

import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { showOverview, takeOpeningProject, useOpeningProjects } from "./overviewPanel";
import { openPartInCad } from "./useOpenInWorkbench";
import { useProjectPart } from "./useProjectCover";

/**
 * The second half of opening a project (`showProject`): once the project's files are read, its
 * main part opens beside the chat in CAD mode (`openPartInCad`; a file no viewer shows opens as a
 * document), or, with no part yet or no CAD viewer, its Overview across the window.
 */
export function useShowProjectPart(input: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef | null;
  /** The thread's project folder. */
  readonly cwd: string | null;
}) {
  const { environmentId, threadRef } = input;
  const threadKey = threadRef === null ? null : scopedThreadKey(threadRef);
  const opening = useOpeningProjects((state) => threadKey !== null && state.threads.has(threadKey));
  const part = useProjectPart(environmentId, opening ? (input.cwd ?? "") : "");
  const plugins = useEnvironmentQuery(
    opening ? pluginEnvironment.list({ environmentId, input: {} }) : null,
  ).data?.plugins;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- opens the project's part in the panel store once its files and plugins arrive from the server
  useEffect(() => {
    if (!opening || threadRef === null || plugins === undefined) return;
    const viewer = plugins.some(
      (plugin) => plugin.enabled && plugin.views.some((view) => view.tool === "cad_open"),
    );
    // Without a CAD viewer a part has nowhere to show, and its models are never read.
    if (viewer && part === undefined) return;
    if (!takeOpeningProject(threadRef)) return;
    if (!viewer || part === null || part === undefined) showOverview(threadRef);
    else openPartInCad(plugins, threadRef, part);
  }, [opening, threadRef, plugins, part]);
}
