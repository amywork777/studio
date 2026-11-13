import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, StudioProject } from "@t3tools/contracts";

import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { waitForProject } from "~/state/entities";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { toastManager } from "../ui/toast";
import { copyName as freeName } from "./examples/examples";
import { readStudioImport } from "./studioImportBridge";
import { useTrashedProjects } from "./trash/useTrash";
import { useSaveStudioProject } from "./useStudioProjects";

/** A folder's own things that are no project's work: hidden folders, caches and scratch (`projectFiles`). */
const NOT_COPIED = /^(?:\..*|node_modules|__pycache__|tmp|dist|build)$/;

/** The copy's name: "<name> copy", then "<name> copy 2" and on, past the names already taken. */
export function copyName(name: string, taken: ReadonlyArray<string>): string {
  return freeName(`${name.trim()} copy`, taken);
}

/** The top-level files and folders of a folder's listing to copy, in order, but those already there. */
export function copiedEntries(
  paths: ReadonlyArray<string>,
  present: ReadonlyArray<string> = [],
): string[] {
  const there = new Set(present.map((path) => path.split(/[\\/]/)[0]));
  const top = new Set<string>();
  for (const path of paths) {
    const first = path.split(/[\\/]/)[0];
    if (first && !NOT_COPIED.test(first) && !there.has(first)) top.add(first);
  }
  return [...top];
}

/**
 * A new project "<name> copy" with its own folder holding a copy of the first folder's work, the
 * other folders shared and no chats yet. The desktop app copies the files (`studioImport`), so
 * this is null elsewhere.
 */
export function useDuplicateProject(environmentId: EnvironmentId) {
  const createNew = useAtomCommand(projectEnvironment.createNew, { reportFailure: false });
  const list = useAtomQueryRunner(projectEnvironment.listEntries, { reportFailure: false });
  const read = useAtomQueryRunner(projectEnvironment.readFile, { reportFailure: false });
  const write = useAtomCommand(projectEnvironment.writeFile, { reportFailure: false });
  const save = useSaveStudioProject(environmentId);
  const trashed = useTrashedProjects(environmentId);
  const handleNewThread = useNewThreadHandler();
  const bridge = readStudioImport();
  const duplicate = async (
    project: StudioProject,
    taken: ReadonlyArray<string>,
  ): Promise<boolean> => {
    const source = project.folders[0];
    if (bridge === null || source === undefined) return false;
    // Trash's names are taken too, so a restore never makes two of one name.
    const name = copyName(project.name, [
      ...taken,
      ...Object.values(trashed).map((each) => each.name),
    ]);
    // Copying takes a moment: it says so at once, then becomes what came of it.
    const toastId = toastManager.add({
      type: "loading",
      title: `Duplicating ${project.name}`,
      timeout: 0,
      data: { hideCopyButton: true },
    });
    const failed = (description: string) => {
      toastManager.update(toastId, {
        type: "error",
        title: `Could not duplicate ${project.name}`,
        description,
        timeout: 8_000,
      });
      return false;
    };
    const listed = await list({ environmentId, input: { cwd: source } });
    if (listed._tag !== "Success") return failed("Its folder could not be read.");
    const created = await createNew({ environmentId, input: { name } });
    if (created._tag !== "Success") {
      const error = squashAtomCommandFailure(created);
      return failed(error instanceof Error ? error.message : "Its folder could not be made.");
    }
    const target = created.value.workspaceRoot;
    // What the new folder starts with (its repository, Studio's own files) stays as made.
    const fresh = await list({ environmentId, input: { cwd: target } });
    const present = fresh._tag === "Success" ? fresh.value.entries.map((entry) => entry.path) : [];
    const sources = copiedEntries(
      listed.value.entries.map((entry) => entry.path),
      present,
    ).map((entry) => `${source.replace(/[\\/]+$/, "")}/${entry}`);
    try {
      await bridge.copy(sources, target);
    } catch (error) {
      return failed(error instanceof Error ? error.message : "Its files could not be copied.");
    }
    // The new folder starts with Studio's own README, which a copy keeps aside rather than
    // overwrite: the project's README (what it is, its decisions) takes its place here.
    if (listed.value.entries.some((entry) => entry.path === "README.md")) {
      const readme = await read({
        environmentId,
        input: { cwd: source, relativePath: "README.md" },
      });
      if (readme._tag === "Success" && !readme.value.truncated) {
        await write({
          environmentId,
          input: { cwd: target, relativePath: "README.md", contents: readme.value.contents },
        });
      }
    }
    const id = await save(
      null,
      {
        ...project,
        name,
        folders: [target, ...project.folders.slice(1)],
        createdAt: new Date().toISOString(),
      },
      "copy",
    );
    // The save says itself what went wrong.
    if (id === null) {
      toastManager.close(toastId);
      return false;
    }
    toastManager.update(toastId, { type: "success", title: `Made ${name}`, timeout: 5_000 });
    const projectRef = scopeProjectRef(environmentId, created.value.projectId);
    const ready = await waitForProject(projectRef).catch(() => null);
    if (ready !== null) await handleNewThread(projectRef).catch(() => undefined);
    return true;
  };
  return bridge === null ? null : duplicate;
}
