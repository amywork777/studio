import { toastManager } from "../ui/toast";
import { BRIEF_REFERENCES } from "./briefFolder";
import { plainError } from "./importIntoProject";
import { referencePaths } from "./startProject";
import { readStudioImport } from "./studioImportBridge";

/**
 * Attach in a project: a PRD or a data sheet goes in References for every chat; a picture goes
 * with its message and a copy in References too, so a drawing check can show where on a sketch it
 * read each size. One way, as Import: a copy, never over a file there.
 */
export function splitForReferences<File extends { readonly type: string }>(
  files: ReadonlyArray<File>,
  pathOf: (file: File) => string | null,
  /** The Brief's own Attach: its sketches and photos are references only. */
  pictures: "chat" | "references" = "chat",
): {
  /** Files with a path on this computer, to copy in; `inChat` ones go with the message as well. */
  readonly copied: ReadonlyArray<{
    readonly file: File;
    readonly path: string;
    readonly inChat: boolean;
  }>;
  /** Files with no path, which the agent files from the chat. */
  readonly filedByAgent: ReadonlyArray<File>;
  readonly chat: ReadonlyArray<File>;
} {
  const copied: Array<{ readonly file: File; readonly path: string; readonly inChat: boolean }> =
    [];
  const filedByAgent: File[] = [];
  const chat: File[] = [];
  for (const file of files) {
    const path = pathOf(file);
    const inChat = pictures === "chat" && file.type.startsWith("image/");
    if (inChat) chat.push(file);
    if (path !== null) copied.push({ file, path, inChat });
    else if (!inChat) filedByAgent.push(file);
  }
  return { copied, filedByAgent, chat };
}

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
