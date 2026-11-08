import { toastManager } from "../ui/toast";
import { BRIEF_REFERENCES } from "./briefFolder";
import { plainError } from "./importIntoProject";
import { referencePaths } from "./startProject";
import { readStudioImport } from "./studioImportBridge";

/**
 * What Attach does in a project: a PRD or a data sheet is the project's, so it goes in its
 * References, where every chat can read it. A picture belongs to its message and stays in the chat.
 * It is one way, as Import is: a copy, never over a file there, and the original is not touched.
 */
export function splitForReferences<File extends { readonly type: string }>(
  files: ReadonlyArray<File>,
  pathOf: (file: File) => string | null,
  /** The Brief's own Attach: its sketches and photos are references too. */
  pictures: "chat" | "references" = "chat",
): {
  /** Files with a path on this computer, to copy in. */
  readonly copied: ReadonlyArray<{ readonly file: File; readonly path: string }>;
  /** Files with no path, which the agent files from the chat. */
  readonly filedByAgent: ReadonlyArray<File>;
  readonly chat: ReadonlyArray<File>;
} {
  const copied: Array<{ readonly file: File; readonly path: string }> = [];
  const filedByAgent: File[] = [];
  const chat: File[] = [];
  for (const file of files) {
    if (pictures === "chat" && file.type.startsWith("image/")) {
      chat.push(file);
      continue;
    }
    const path = pathOf(file);
    if (path === null) filedByAgent.push(file);
    else copied.push({ file, path });
  }
  return { copied, filedByAgent, chat };
}

/** What asks the agent to file what could not be copied in: the project takes text writes only. */
export const FILE_ATTACHED_REFERENCES = `File the attached references under ${BRIEF_REFERENCES}/.`;

/**
 * Copies files and folders into a project folder's References (`brief/references`), as Import
 * into a project copies, never over a file there, and resolves to the copies' paths in the
 * folder. Outside the desktop app nothing is copied; a failed copy says so, and the work goes on.
 */
export async function copyIntoReferences(
  folder: string,
  paths: ReadonlyArray<string>,
): Promise<ReadonlyArray<string>> {
  const bridge = readStudioImport();
  if (bridge === null || paths.length === 0) return [];
  try {
    const into = `${folder.replace(/[\\/]+$/, "")}/${BRIEF_REFERENCES}`;
    return referencePaths(await bridge.copy(paths, into));
  } catch (error) {
    toastManager.add({
      type: "error",
      title: "Could not copy your files into the project",
      description: plainError(error),
    });
    return [];
  }
}
