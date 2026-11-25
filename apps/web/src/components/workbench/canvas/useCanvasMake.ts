import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { deriveThreadTitleSeed } from "@t3tools/client-runtime/operations";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  DEFAULT_SERVER_SETTINGS,
  type EnvironmentId,
  type ProjectId,
  type RuntimeRequestId,
  type ThreadId,
} from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { STUDIO_PROJECT_KINDS } from "@t3tools/shared/studioProjects";

import { useEnvironmentSettings } from "~/hooks/useSettings";
import { m } from "~/i18n/messages";
import { newMessageId, newThreadId } from "~/lib/utils";
import { resolveProjectDefaultProviderModelSelection } from "~/providerInstances";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { waitForProject } from "~/state/entities";
import { projectEnvironment } from "~/state/projects";
import { environmentServerConfigsAtom } from "~/state/server";
import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";
import { useOrchestrationCommand } from "~/state/use-orchestration-command";
import { toastManager } from "../../ui/toast";
import { copyIntoReferences } from "../attachToReferences";
import { newProjectBrief } from "../newProjectBrief";
import { provisionalProjectName } from "../startProject";
import { useSaveStudioProject } from "../useStudioProjects";
import { type DesignOption, nextKeys, optionsMessage } from "./canvasOptions";
import { type CanvasBoard, useCanvasStore } from "./canvasStore";

const partKind = STUDIO_PROJECT_KINDS.find((kind) => kind.id === "part")!;

const failed = (title: string, error?: unknown) =>
  toastManager.add({
    type: "error",
    title,
    description: error instanceof Error ? error.message : undefined,
  });

/**
 * Asks for a set of design options from the board. The first set makes the board's project, as
 * Home's Start does (its pictures copied into References), and starts its chat with the message
 * there, so the canvas stays in front while the agent builds; a later set ("More like this") is
 * the next message in the same chat. Resolves to whether the message went.
 */
export function useCanvasMake(environmentId: EnvironmentId) {
  const createNew = useAtomCommand(projectEnvironment.createNew, { reportFailure: false });
  const save = useSaveStudioProject(environmentId);
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });
  const dismissQuestion = useAtomCommand(threadEnvironment.dismissUserInput, {
    reportFailure: false,
  });
  const units = useEnvironmentSettings(environmentId, (settings) => settings.newProjectUnits);
  const standard = useEnvironmentSettings(environmentId, (settings) => settings.newProjectStandard);
  const generalTolerance = useEnvironmentSettings(
    environmentId,
    (settings) => settings.newProjectGeneralTolerance,
  );
  const update = useCanvasStore((state) => state.update);

  const send = async (input: {
    readonly projectId: ProjectId;
    readonly threadId: ThreadId | null;
    readonly text: string;
    readonly title: string;
  }): Promise<ThreadId | null> => {
    const config = appAtomRegistry.get(environmentServerConfigsAtom).get(environmentId);
    const serverSettings = config?.settings ?? DEFAULT_SERVER_SETTINGS;
    const settings = resolveProjectSettings(serverSettings, input.projectId).settings;
    const modelSelection =
      settings.defaultModelSelection ??
      resolveProjectDefaultProviderModelSelection(
        config?.providers ?? [],
        serverSettings,
        input.projectId,
      );
    if (modelSelection === null) {
      failed(
        "No AI agent is signed in",
        new Error("Sign in to an agent from Settings, then try again."),
      );
      return null;
    }
    const runtimeMode = settings.defaultRuntimeMode;
    const createdAt = new Date().toISOString();
    const threadId = input.threadId ?? newThreadId();
    const turn = await startTurn({
      environmentId,
      input: {
        threadId,
        message: { messageId: newMessageId(), role: "user", text: input.text, attachments: [] },
        modelSelection,
        titleSeed: deriveThreadTitleSeed({ text: input.text, attachments: [] }, m),
        runtimeMode,
        interactionMode: "default",
        ...(input.threadId === null
          ? {
              bootstrap: {
                createThread: {
                  projectId: input.projectId,
                  title: input.title,
                  modelSelection,
                  runtimeMode,
                  interactionMode: "default",
                  branch: null,
                  worktreePath: null,
                  createdAt,
                },
              },
            }
          : {}),
        createdAt,
      },
    });
    if (turn._tag === "Failure") {
      failed("Could not ask for design options", squashAtomCommandFailure(turn));
      return null;
    }
    return threadId;
  };

  const makeFirst = async (board: CanvasBoard): Promise<boolean> => {
    const description = board.description.trim();
    if (description === "" && board.pictures.length === 0) return false;
    const name =
      description === ""
        ? (board.pictures[0]?.name.replace(/\.[^.]+$/, "") ?? "Canvas")
        : provisionalProjectName(description);
    const created = await createNew({ environmentId, input: { name } });
    if (created._tag !== "Success") {
      failed("Could not create the project", squashAtomCommandFailure(created));
      return false;
    }
    const folder = created.value.workspaceRoot;
    const projectId = created.value.projectId;
    const saved = await save(null, {
      name,
      template: partKind.id,
      brief: newProjectBrief({
        kind: partKind,
        units: units ?? "mm",
        material: "",
        purpose: "",
        standard,
        generalTolerance,
      }),
      folders: [folder],
      createdAt: new Date().toISOString(),
    });
    if (saved === null) return false;
    const references = await copyIntoReferences(
      folder,
      board.pictures.flatMap((picture) => picture.path ?? []),
    );
    await waitForProject(scopeProjectRef(environmentId, projectId)).catch(() => null);
    update(board.id, () => ({ name, folder, projectId }));
    const text = optionsMessage({ description, references, keys: nextKeys([]), from: null });
    const threadId = await send({ projectId, threadId: null, text, title: name });
    if (threadId === null) return false;
    update(board.id, () => ({ threadId }));
    return true;
  };

  /**
   * Four more options grown from `from`, asked in the board's chat. The question the last set
   * ended on (`questions`) is closed first: this is its answer, and the chat holds a new message
   * while it is open.
   */
  const makeMore = async (
    board: CanvasBoard,
    from: DesignOption,
    taken: ReadonlyArray<string>,
    questions: ReadonlyArray<RuntimeRequestId>,
  ): Promise<boolean> => {
    if (board.projectId === null) return false;
    for (const requestId of questions) {
      if (board.threadId === null) break;
      const closed = await dismissQuestion({
        environmentId,
        input: { threadId: board.threadId as ThreadId, requestId },
      });
      if (closed._tag === "Failure") {
        failed("Could not close the chat's open question", squashAtomCommandFailure(closed));
        return false;
      }
    }
    const text = optionsMessage({ description: "", references: [], keys: nextKeys(taken), from });
    const threadId = await send({
      projectId: board.projectId as ProjectId,
      threadId: board.threadId as ThreadId | null,
      text,
      title: board.name,
    });
    return threadId !== null;
  };

  return { makeFirst, makeMore };
}
