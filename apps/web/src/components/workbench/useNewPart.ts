import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { STUDIO_PROJECT_KINDS } from "@t3tools/shared/studioProjects";
import { useCallback, useMemo, useRef } from "react";

import { pluginEnvironment } from "~/state/plugins";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { studioProjectsEnvironment } from "~/state/studioProjects";
import { useAtomCommand } from "~/state/use-atom-command";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { toastManager } from "../ui/toast";
import { buildErrorLine } from "./buildErrorLine";
import { cadToolsCause } from "./cadToolsCause";
import { plainError } from "./importIntoProject";
import {
  buildPart,
  buildThenSwap,
  type BuiltPart,
  freePartStem,
  makeNewPart,
  PART_FOLDER,
  partStem,
  starterScript,
} from "./newPart";
import { showOverview } from "./overviewPanel";
import { ADVANCED_SETTINGS_LABEL, isEngineeringInterface } from "./studioInterface";
import { useCreateStudioProject } from "./useCreateStudioProject";
import { useOneAtATime } from "./useOneAtATime";
import { modelsChanged } from "./useFolderModels";
import { openPartInCad } from "./useOpenInWorkbench";
import { useEnvironmentCadService } from "./useVersions";

/** What a new part's project is, for its brief: a part. */
const PART_KIND = STUDIO_PROJECT_KINDS.find((kind) => kind.id === "part")!;

/** Each environment's New part under way: a second press while it is made does nothing more. */
const newPartsUnderWay = new Map<string, Promise<void>>();
/** Each project folder's added part under way, the same. */
const addedPartsUnderWay = new Map<string, Promise<void>>();

/** A failure's toast; with `retry`, its Build again. */
export const failedToast = (title: string, error: unknown, retry?: () => void) => {
  const id = toastManager.add({
    type: "error",
    title,
    description: plainError(error),
    ...(retry === undefined
      ? {}
      : {
          actionProps: {
            children: "Build again",
            onClick: () => {
              toastManager.close(id);
              retry();
            },
          },
        }),
  });
};

/** How long a first build waits for Studio's CAD service to come on (it starts with the app). */
const TOOLS_WAIT_MS = 60_000;
const TOOLS_POLL_MS = 500;

/** A path inside a folder, absolute as the folder is (Windows takes the forward slash too). */
const inside = (folder: string, path: string) => `${folder.replace(/[\\/]+$/, "")}/${path}`;

/**
 * Where Settings lists text-to-cad with its switch: the Plugins page, which the engineering
 * interface keeps under Advanced (`ADVANCED_SETTINGS_SECTIONS`).
 */
const pluginsPlace = () =>
  isEngineeringInterface() ? `Settings, ${ADVANCED_SETTINGS_LABEL}, Plugins` : "Settings, Plugins";

/**
 * Builds a part's script (absolute) through Studio's CAD service (`buildPart`, the environment's
 * server: a new chat is still a draft), waiting first for the CAD service while it comes on with the
 * app; a built part is listed on Home, ⌘K and the Overview at once. A service that never came on
 * says why when its start said one of the two causes a person can act on (`cadToolsCause`), and a
 * build that failed says its error alone (`buildErrorLine`). New part's build, and a copied
 * example's.
 */
export function useBuildPart(environmentId: EnvironmentId | null) {
  const service = useEnvironmentCadService(environmentId);
  // The build reads the service as it is when it asks, so one started while the tools come on waits.
  const current = useRef(service);
  current.current = service;
  const listPlugins = useAtomQueryRunner(pluginEnvironment.list, {
    reportFailure: false,
    refresh: true,
  });
  return useCallback(
    async (script: string): Promise<BuiltPart> => {
      const deadline = Date.now() + TOOLS_WAIT_MS;
      while (current.current === null && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, TOOLS_POLL_MS));
      }
      const post = current.current;
      if (post === null) {
        // Why a plugin's server did not start, as the server says it now.
        const listed =
          environmentId === null ? null : await listPlugins({ environmentId, input: {} });
        const cause = (listed?._tag === "Success" ? listed.value.plugins : [])
          .filter((plugin) => plugin.enabled)
          .flatMap((plugin) => plugin.servers.map((server) => cadToolsCause(server.error)))
          .find((sentence) => sentence !== null);
        return {
          error:
            cause ??
            `Studio's CAD service did not start. Turn text-to-cad on in ${pluginsPlace()}, then press Build again.`,
        };
      }
      const built = await buildPart({ post, script });
      // Home's tiles, ⌘K and the Overview list it now.
      if ("id" in built) modelsChanged();
      return "error" in built ? { error: buildErrorLine(built.error) } : built;
    },
    [environmentId, listPlugins],
  );
}

/**
 * Writes a part's starter (`starterScript`) into a folder and answers its script's absolute path;
 * builds it (`useBuildPart`); and opens its document beside the chat in CAD mode, the full
 * workspace, as the Overview's file list opens a part. A write that fails throws, naming the file.
 */
function useStarterSteps(environmentId: EnvironmentId | null) {
  const write = useAtomCommand(projectEnvironment.writeFile, { reportFailure: false });
  const plugins = useEnvironmentQuery(
    environmentId === null ? null : pluginEnvironment.list({ environmentId, input: {} }),
  ).data?.plugins;
  const build = useBuildPart(environmentId);
  const writeStarter = useCallback(
    async (input: { readonly cwd: string; readonly folder: string; readonly stem: string }) => {
      const path = `${input.folder}/${input.stem}.py`;
      if (environmentId === null) throw new Error(`${path} could not be written.`);
      const written = await write({
        environmentId,
        input: { cwd: input.cwd, relativePath: path, contents: starterScript(input.stem) },
      });
      if (written._tag !== "Success") throw new Error(`${path} could not be written.`);
      return inside(input.cwd, path);
    },
    [environmentId, write],
  );
  const open = useCallback(
    (threadRef: ScopedThreadRef, id: string) => void openPartInCad(plugins, threadRef, id),
    [plugins],
  );
  return { writeStarter, build, open };
}

/**
 * Home's New part, and New's Part on Home and the Projects page: a project named "Untitled part"
 * (`untitledName`, past every name of yours and Trash's) with the starter part in
 * `parts/part.py`, built, then opened beside its new chat in CAD mode (`makeNewPart`). No dialog
 * and no agent turn; renaming is Rename on the project. `create` resolves once it is open, or has
 * said why it could not be made or built; `busy` while it is under way, its build too, when
 * another press does nothing more.
 */
export function useNewPart(environmentId: EnvironmentId): {
  readonly create: () => Promise<void>;
  readonly busy: boolean;
} {
  const make = useCreateStudioProject(environmentId);
  const listStudioProjects = useAtomQueryRunner(studioProjectsEnvironment.list, {
    reportFailure: false,
    refresh: true,
  });
  const { writeStarter, build, open } = useStarterSteps(environmentId);
  const { run, busy } = useOneAtATime(newPartsUnderWay);
  const create = useCallback(
    () =>
      run(environmentId, () => {
        const stem = partStem("part");
        return makeNewPart<ScopedThreadRef>({
          // Read now, not from the last render: a part may have been made a moment ago.
          names: async () => {
            const known = await listStudioProjects({ environmentId, input: {} });
            if (known._tag !== "Success") throw new Error("Studio's projects could not be read.");
            return [
              ...Object.values(known.value.projects),
              ...Object.values(known.value.trashed ?? {}),
            ].map((project) => project.name);
          },
          create: ({ name, onFolder, show }) =>
            make({
              environmentId,
              name,
              kind: PART_KIND,
              units: "mm",
              material: "",
              purpose: "",
              folders: [],
              onFolder,
              show,
            }),
          writeStarter: (folder) => writeStarter({ cwd: folder, folder: PART_FOLDER, stem }),
          build: (_ref, script) => build(script),
          openPart: open,
          openProject: showOverview,
          failed: failedToast,
        });
      }),
    [build, environmentId, listStudioProjects, make, open, run, writeStarter],
  );
  return useMemo(() => ({ create, busy: busy.has(environmentId) }), [busy, create, environmentId]);
}

/**
 * New part in an open project: New's Part there, and the Overview's Start a part by hand. It
 * writes the starter as `<folder>/<name>.py` (`partStem`; `parts/part.py` from Start a part by
 * hand), the next name free beside what the folder holds so no file is written over, builds it,
 * and opens it beside the chat in CAD mode; a build that fails says why, and the script stays for
 * the agent or CAD mode to mend. Null without a chat or a folder.
 */
export function useAddPart(
  threadRef: ScopedThreadRef | null,
  cwd: string | null,
): ((input: { readonly name: string; readonly folder?: string }) => Promise<void>) | null {
  const environmentId = threadRef?.environmentId ?? null;
  const list = useAtomQueryRunner(projectEnvironment.listEntries, {
    reportFailure: false,
    refresh: true,
  });
  const { writeStarter, build, open } = useStarterSteps(environmentId);
  const { run } = useOneAtATime(addedPartsUnderWay);
  return useMemo(() => {
    if (threadRef === null || cwd === null) return null;
    const { environmentId } = threadRef;
    // What a folder of the project holds; a folder not there yet holds nothing. One that can't
    // be read throws, so nothing is written over a part in it.
    const filesIn = async (folder: string): Promise<ReadonlyArray<string>> => {
      const listed = await list({ environmentId, input: { cwd, directoryPath: folder } });
      if (listed._tag === "Success") return listed.value.entries.map((entry) => entry.path);
      const parent = folder.includes("/") ? folder.slice(0, folder.lastIndexOf("/")) : "";
      if (folder !== "" && !(await filesIn(parent)).includes(folder)) return [];
      throw new Error(`${folder || "The project's folder"} could not be read.`);
    };
    // One at a time in a folder: a second press would find the same name free.
    return (input) => {
      const folder = input.folder?.trim().replace(/^\/+|\/+$/g, "") || PART_FOLDER;
      return run(`${environmentId}\n${cwd}\n${folder}`, async () => {
        try {
          const stem = freePartStem(partStem(input.name), await filesIn(folder));
          const script = await writeStarter({ cwd, folder, stem });
          await buildThenSwap({
            ref: threadRef,
            script,
            failedTitle: `Made ${stem}.py, but its part did not build`,
            build: (_ref, path) => build(path),
            openPart: open,
            failed: failedToast,
          });
        } catch (error) {
          failedToast("Could not make the part", error);
        }
      });
    };
  }, [build, cwd, list, open, run, threadRef, writeStarter]);
}
