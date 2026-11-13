import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { STUDIO_PROJECT_KINDS } from "@t3tools/shared/studioProjects";

import { useStableCallback } from "~/hooks/useStableCallback";
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
 * Waits for Studio's CAD service while it comes on with the app, then builds through the
 * environment's server (a new chat is still a draft). A service that never came on says why when
 * its start gave a cause a person can act on (`cadToolsCause`).
 */
export function useBuildPart(environmentId: EnvironmentId | null) {
  const service = useEnvironmentCadService(environmentId);
  // The build reads the service as it is when it asks, so one started while the tools come on waits.
  const currentService = useStableCallback(() => service);
  const listPlugins = useAtomQueryRunner(pluginEnvironment.list, {
    reportFailure: false,
    refresh: true,
  });
  return async (script: string): Promise<BuiltPart> => {
    const deadline = Date.now() + TOOLS_WAIT_MS;
    while (currentService() === null && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, TOOLS_POLL_MS));
    }
    const post = currentService();
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
  };
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
  const writeStarter = async (input: {
    readonly cwd: string;
    readonly folder: string;
    readonly stem: string;
  }) => {
    const path = `${input.folder}/${input.stem}.py`;
    if (environmentId === null) throw new Error(`${path} could not be written.`);
    const written = await write({
      environmentId,
      input: { cwd: input.cwd, relativePath: path, contents: starterScript(input.stem) },
    });
    if (written._tag !== "Success") throw new Error(`${path} could not be written.`);
    return inside(input.cwd, path);
  };
  const open = (threadRef: ScopedThreadRef, id: string) =>
    void openPartInCad(plugins, threadRef, id);
  return { writeStarter, build, open };
}

/**
 * A project named past every name of yours and Trash's, with the starter in `parts/part.py`, built
 * and opened beside its new chat in CAD mode (`makeNewPart`). No dialog and no agent turn. `busy`
 * covers the build too, while another press does nothing more.
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
  const create = () =>
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
    });
  return { create, busy: busy.has(environmentId) };
}

/**
 * Writes the starter as `<folder>/<name>.py` at the next name free in the folder, so no file is
 * written over, then builds and opens it. A failed build leaves the script for the agent or CAD
 * mode to mend. Null without a chat or a folder.
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
  if (threadRef === null || cwd === null) return null;
  // What a folder of the project holds; a folder not there yet holds nothing. One that can't
  // be read throws, so nothing is written over a part in it.
  const filesIn = async (folder: string): Promise<ReadonlyArray<string>> => {
    const listed = await list({
      environmentId: threadRef.environmentId,
      input: { cwd, directoryPath: folder },
    });
    if (listed._tag === "Success") return listed.value.entries.map((entry) => entry.path);
    const parent = folder.includes("/") ? folder.slice(0, folder.lastIndexOf("/")) : "";
    if (folder !== "" && !(await filesIn(parent)).includes(folder)) return [];
    throw new Error(`${folder || "The project's folder"} could not be read.`);
  };
  // One at a time in a folder: a second press would find the same name free.
  return (input) => {
    const folder = input.folder?.trim().replace(/^\/+|\/+$/g, "") || PART_FOLDER;
    return run(`${threadRef.environmentId}\n${cwd}\n${folder}`, async () => {
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
}
