import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { STUDIO_PROJECT_KINDS, studioFolderKey } from "@t3tools/shared/studioProjects";
import { useCallback, useMemo } from "react";

import { useServerConfigs } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { pluginEnvironment } from "~/state/plugins";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { studioProjectsEnvironment } from "~/state/studioProjects";
import { useAtomCommand } from "~/state/use-atom-command";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { toastManager } from "../../ui/toast";
import { isCheckResultPath } from "../checkResults";
import { copyBrief, copyName, listExamples, sampleFile } from "../examples/examples";
import { plainError } from "../importIntoProject";
import { readStudioImport } from "../studioImportBridge";
import { useCreateStudioProject } from "../useCreateStudioProject";
import { copiedEntries } from "../useDuplicateProject";
import { showOverview } from "../overviewPanel";
import { openInPanel, openPartInCad } from "../useOpenInWorkbench";
import { failedToast, useBuildPart } from "../useNewPart";
import { useTrashedProjects } from "../trash/useTrash";
import { useStudioProjects } from "../useStudioProjects";
import { copySample, copyThenOpen, inTurn } from "./sampleProject";

/** What a copy of an example is, for its brief: a part; its README says the rest. */
const PART_KIND = STUDIO_PROJECT_KINDS.find((kind) => kind.id === "part")!;

/** Each environment's copy of an example under way, which the next one waits for (`inTurn`). */
const underWay = new Map<string, Promise<unknown>>();

/**
 * The examples an environment's server ships (`samples`), as the Library lists them
 * (`listExamples`); `loaded` is false until its config is known. None where the server was
 * started without `T3CODE_SAMPLES_DIR` (the web app's own server, T3 Code).
 */
export function useExamples(environmentId: EnvironmentId | null) {
  const configs = useServerConfigs();
  const config = environmentId === null ? undefined : configs.get(environmentId);
  const samples = config?.samples;
  const examples = useMemo(() => listExamples(samples), [samples]);
  return { examples, loaded: config !== undefined };
}

/**
 * The example a library entry's example is in (`exampleIn`), where the environment's server ships
 * it; null where it does not, or the entry has no example, so no See the example shows.
 */
export function useEntryExample(
  environmentId: EnvironmentId,
  exampleIn: string | null,
): string | null {
  const examples = useExamples(environmentId).examples;
  return exampleIn !== null && examples.some((example) => example.id === exampleIn)
    ? exampleIn
    : null;
}

/**
 * An example the server ships, by its id, and Make a copy to edit: `copy` makes a new project
 * named `copyName` (the example's name, or the next one free among your projects and Trash's:
 * "Phone stand 2"), copies the
 * example's files into its folder (the desktop app copies them, `studioImport`), and opens it on
 * the example's main file, or on `file` of it (the Library's See the example), beside its new
 * chat. A model's script opens as New part opens a part (`copyThenOpen`): the project's Overview at
 * once, then the model's document once its build lands, `onBuilding` told while it builds (a copy's
 * models have never been built). It resolves to whether the copy was made, once what it opens is
 * open. Copies are made one at a time per environment,
 * so a second is named past the first and never lands on it. `canCopy` is false where nothing can
 * be copied (the web app, an environment on another computer): the example still shows, view
 * only. Null for an example the server does not ship.
 */
export function useExample(environmentId: EnvironmentId, sampleId: string) {
  const sample = useExamples(environmentId).examples.find((entry) => entry.id === sampleId) ?? null;
  const bridge = readStudioImport();
  // The desktop app copies on this computer, so only into the environment it runs.
  const onThisComputer = usePrimaryEnvironmentId() === environmentId;
  const canCopy = bridge !== null && onThisComputer;
  const projects = useStudioProjects(environmentId);
  const trashed = useTrashedProjects(environmentId);
  const listStudioProjects = useAtomQueryRunner(studioProjectsEnvironment.list, {
    reportFailure: false,
    refresh: true,
  });
  const list = useAtomQueryRunner(projectEnvironment.listEntries, { reportFailure: false });
  const read = useAtomQueryRunner(projectEnvironment.readFile, { reportFailure: false });
  const listAgain = useAtomQueryRunner(projectEnvironment.listEntries, {
    reportFailure: false,
    refresh: true,
  });
  const readAgain = useAtomQueryRunner(projectEnvironment.readFile, {
    reportFailure: false,
    refresh: true,
  });
  const write = useAtomCommand(projectEnvironment.writeFile, { reportFailure: false });
  const create = useCreateStudioProject(environmentId);
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;
  const build = useBuildPart(environmentId);

  const copy = useCallback(
    (file?: string, onBuilding?: () => void) =>
      inTurn(underWay, environmentId, async () => {
        if (sample === null || bridge === null || !canCopy) return false;
        const failed = (description: string) => {
          toastManager.add({
            type: "error",
            title: `Could not copy ${sample.name}`,
            description,
          });
          return false;
        };
        try {
          // Read now, not from the last render: a copy may have been made a moment ago.
          const known = await listStudioProjects({ environmentId, input: {} });
          if (known._tag !== "Success") return failed("Studio's projects could not be read.");
          // Trash's names are taken too, so a restore never makes two of one name.
          const name = copyName(sample.name, [
            ...Object.values(known.value.projects).map((project) => project.name),
            ...Object.values(known.value.trashed ?? {}).map((project) => project.name),
          ]);
          const listed = await list({
            environmentId,
            input: { cwd: sample.path, directoryPath: "" },
          });
          if (listed._tag !== "Success") return failed("Its files could not be read.");
          const entries = listed.value.entries.map((entry) => entry.path);
          const copyInto = async (folder: string) => {
            // The new folder keeps what it starts with (its repository, its icon); its README
            // gives way to the example's.
            const fresh = await list({ environmentId, input: { cwd: folder, directoryPath: "" } });
            const present =
              fresh._tag === "Success" ? fresh.value.entries.map((entry) => entry.path) : [];
            const from = studioFolderKey(sample.path);
            await copySample({
              entries: copiedEntries(entries, present),
              copy: (names) =>
                bridge.copy(
                  names.map((entry) => `${from}/${entry}`),
                  folder,
                ),
              writeReadme: entries.includes("README.md")
                ? async () => {
                    const readme = await read({
                      environmentId,
                      input: { cwd: sample.path, relativePath: "README.md" },
                    });
                    if (readme._tag !== "Success" || readme.value.truncated) {
                      throw new Error("Its README could not be read.");
                    }
                    const written = await write({
                      environmentId,
                      input: {
                        cwd: folder,
                        relativePath: "README.md",
                        contents: readme.value.contents,
                      },
                    });
                    if (written._tag !== "Success") {
                      throw new Error("Its README could not be written.");
                    }
                  }
                : null,
            });
          };
          // Its new chat runs in the copy, where the example's paths hold.
          const shown = (typeof file === "string" ? sampleFile(file) : null) ?? sample.open;
          return await copyThenOpen<ScopedThreadRef>({
            file: shown,
            name,
            // A copy that fails throws out of `create` before it says the project was made or
            // opens its chat, and the catch below says so, once.
            create: ({ onFolder, show }) =>
              create({
                environmentId,
                name,
                kind: PART_KIND,
                units: "mm",
                origin: "sample",
                ...copyBrief(sample),
                folders: [],
                onFolder,
                show,
              }),
            copyInto,
            openFile: (ref, path) => void openInPanel(plugins, ref, path),
            openProject: showOverview,
            build: (_ref, script) => build(script),
            // The model takes the Overview's place, beside the chat, in CAD mode.
            openPart: (ref, id) => void openPartInCad(plugins, ref, id),
            building: () => onBuilding?.(),
            redateChecks: async (folder) => {
              const files = await listAgain({ environmentId, input: { cwd: folder } });
              if (files._tag !== "Success") return;
              const checks = files.value.entries.filter(({ path }) => isCheckResultPath(path));
              for (const { path: relativePath } of checks) {
                const input = { cwd: folder, relativePath };
                const check = await read({ environmentId, input });
                if (check._tag !== "Success" || check.value.truncated) continue;
                await write({
                  environmentId,
                  input: { ...input, contents: check.value.contents },
                });
                await readAgain({ environmentId, input });
              }
            },
            failed: failedToast,
          });
        } catch (error) {
          return failed(plainError(error));
        }
      }),
    [
      bridge,
      build,
      canCopy,
      create,
      environmentId,
      list,
      listAgain,
      listStudioProjects,
      plugins,
      read,
      readAgain,
      sample,
      write,
    ],
  );
  const nextName = useMemo(
    () =>
      sample === null
        ? null
        : copyName(
            sample.name,
            [...Object.values(projects), ...Object.values(trashed)].map((project) => project.name),
          ),
    [projects, sample, trashed],
  );
  return useMemo(
    () =>
      sample === null || nextName === null ? null : { sample, canCopy, copyName: nextName, copy },
    [canCopy, copy, nextName, sample],
  );
}
