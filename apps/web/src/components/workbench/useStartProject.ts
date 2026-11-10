import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { STUDIO_PROJECT_KINDS } from "@t3tools/shared/studioProjects";
import { useCallback, useState } from "react";

import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useRightPanelStore } from "~/rightPanelStore";
import { copyIntoReferences } from "./attachToReferences";
import type { NewJob } from "./NewDialog";
import { humanName } from "./partNames";
import type { ListedProject } from "./projectList";
import {
  nameFirstChatAfterProject,
  nameFromAttachment,
  provisionalProjectName,
  setPendingStart,
  type StartAttachment,
  startMessage,
} from "./startProject";
import { useCreateStudioProject } from "./useCreateStudioProject";

/**
 * How Home starts work: from a description and what is attached, in a new project or as a new
 * chat in one of yours (`project`), or from New (a part, a board, a PRD) in a new project.
 */
export type ProjectStart =
  | {
      readonly kind: "described";
      readonly description: string;
      /** Files and folders for the project, copied into its References; with none, only words. */
      readonly attachments: ReadonlyArray<StartAttachment>;
      /** The project to start a chat in; null makes a new one. */
      readonly project: ListedProject | null;
    }
  | { readonly kind: "new"; readonly job: NewJob };

/**
 * A project started from New is named by what New names: "Servo bracket", else as new work of its
 * kind, "New board", "New FMEA" (a word in capitals stays as it is).
 */
export function newProjectName(job: Pick<NewJob, "template" | "name">): string {
  const name = job.name.trim();
  if (name !== "" && name !== job.template.defaultName) return humanName(name);
  const label = job.template.label;
  const firstWord = label.split(" ")[0] ?? label;
  const lead =
    firstWord === firstWord.toUpperCase() ? label.charAt(0) : label.charAt(0).toLowerCase();
  return `New ${lead}${label.slice(1)}`;
}

const kindOf = (id: string) => STUDIO_PROJECT_KINDS.find((kind) => kind.id === id)!;

/**
 * The kind of project New starts for its work, which sets the folders the agent keeps it in: an
 * assembly's is a product, a circuit board's a circuit board, a robot description's a robot, and
 * the rest (a part, a sheet metal part, a document) a mechanical part. A blank project has no choice of its own in New.
 */
export function projectKindFor(templateId: string) {
  switch (templateId) {
    case "assembly":
      return kindOf("product");
    case "board":
      return kindOf("board");
    case "robot":
      return kindOf("robot");
    default:
      return kindOf("part");
  }
}

/**
 * Home's Start: makes the project (a new folder with its repository, `useCreateStudioProject`)
 * and opens its first chat, which sends the description, or New's job, as its first message
 * (`usePendingStart`), the way New in a project hands its job to the open chat. With a project of
 * yours chosen, it opens a new chat there instead, which sends the description the same way.
 * What was attached is copied into the project's References first, and the first message asks
 * the agent to read it before anything else (`startMessage`): a new project is set up from it.
 */
/**
 * Starts work as `useStartProject` does, one start at a time, from Home's box or from New on Home
 * and the Projects page: a second press while one is being made does nothing. `busy` says one is.
 */
export function useStartOnce(environmentId: EnvironmentId): {
  readonly busy: boolean;
  readonly start: (work: ProjectStart) => Promise<void>;
} {
  const startProject = useStartProject(environmentId);
  const [busy, setBusy] = useState(false);
  const start = async (work: ProjectStart) => {
    if (busy) return;
    setBusy(true);
    try {
      await startProject(work);
    } finally {
      setBusy(false);
    }
  };
  return { busy, start };
}

/** A new project's Overview beside its first chat, where the chat's first turn writes it. */
const showOverviewBeside = (threadRef: ScopedThreadRef) =>
  useRightPanelStore.getState().open(threadRef, "files");

export function useStartProject(environmentId: EnvironmentId) {
  const create = useCreateStudioProject(environmentId);
  const handleNewThread = useNewThreadHandler();

  return useCallback(
    async (start: ProjectStart): Promise<boolean> => {
      const units = "mm" as const;
      if (start.kind === "described") {
        const description = start.description.trim();
        const { attachments } = start;
        if (description === "" && attachments.length === 0) return false;
        const paths = attachments.flatMap((attachment) => attachment.path ?? []);
        // What has no path on this computer goes with the first message, as a chat attaches it.
        const files = attachments.flatMap((attachment) =>
          attachment.path === null && attachment.file !== null ? [attachment.file] : [],
        );
        const prepare = async (folder: string, newProject: boolean) => {
          const references = await copyIntoReferences(folder, paths);
          setPendingStart(folder, {
            prompt: startMessage({ description, references, attached: files.length, newProject }),
            files,
          });
        };
        const folder = start.project?.folder ?? null;
        if (start.project !== null) {
          if (folder === null) return false;
          await prepare(folder.workspaceRoot, false);
          const draft = await handleNewThread(scopeProjectRef(folder.environmentId, folder.id));
          // The new chat in front, where its first message shows going out.
          if (draft !== null) {
            const ref = scopeThreadRef(folder.environmentId, draft.threadId);
            useRightPanelStore.getState().setMaximized(ref, false);
          }
          return draft !== null;
        }
        // Started from files alone, it is named after the first until the agent names it.
        const name =
          description === ""
            ? nameFromAttachment(attachments[0]!.name)
            : provisionalProjectName(description);
        return create({
          environmentId,
          name,
          kind: kindOf("part"),
          units,
          material: "",
          // The description goes with the first message, where the agent reads it. It is no
          // purpose: written to run a chat, it reads badly as "What it is", and the agent writes one.
          purpose: "",
          folders: [],
          onFolder: async (folder) => {
            await prepare(folder, true);
            nameFirstChatAfterProject(folder, name);
          },
          show: showOverviewBeside,
        });
      }
      const { job } = start;
      const name = newProjectName(job);
      return create({
        environmentId,
        name,
        kind: projectKindFor(job.template.id),
        units: job.units,
        material: "",
        purpose: "",
        folders: [],
        onFolder: (folder) => {
          setPendingStart(folder, { prompt: job.prompt, files: [] });
          nameFirstChatAfterProject(folder, name);
        },
        show: showOverviewBeside,
      });
    },
    [create, environmentId, handleNewThread],
  );
}
