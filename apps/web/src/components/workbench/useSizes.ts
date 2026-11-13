import { useEffect, useState } from "react";

import { type ProjectSizes, readSizes } from "./sizes";
import type { CadPost } from "./useVersions";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const failure = (reply: unknown) =>
  isRecord(reply) && typeof reply.error === "string"
    ? reply.error
    : "Studio's CAD service did not answer.";

/** One project folder's named sizes, or why they could not be read. */
export type FolderSizes = {
  readonly folder: string;
  readonly sizes: ProjectSizes | null;
  readonly error: string | null;
};

/**
 * Each project folder's named sizes (`cadgen/edit/sizes.py`), in the project's order, read again
 * whenever the thread's agent changes files or a size is changed here (`reads`). A part's imports
 * resolve beside it, so each folder's sizes are its own. The last lists stay shown while they are
 * read.
 */
export function useProjectSizes(input: {
  readonly post: CadPost | null;
  readonly folders: ReadonlyArray<string>;
  readonly mutationId: string | null;
  readonly reads: number;
}): ReadonlyArray<FolderSizes> | null {
  const { post, mutationId, reads } = input;
  const key = input.folders.filter((folder) => folder !== "").join("\n");
  const [state, setState] = useState<{
    readonly key: string;
    readonly read: ReadonlyArray<FolderSizes>;
  } | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads each folder's sizes from the CAD service again on every file change or size edit
  useEffect(() => {
    if (post === null || key === "") return;
    let cancelled = false;
    void Promise.all(
      key.split("\n").map((folder) =>
        post("/api/v1/local/sizes", { folder }).then((reply): FolderSizes => {
          const read = readSizes(reply);
          return "error" in read
            ? { folder, sizes: null, error: read.error }
            : { folder, sizes: read, error: null };
        }),
      ),
    ).then((read) => {
      if (!cancelled) setState({ key, read });
    });
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `mutationId` is the agent changing files, `reads` a size changed here: the sizes are read again.
  }, [key, mutationId, post, reads]);
  return state !== null && state.key === key ? state.read : null;
}

/**
 * One size changed where it is written (`cadgen/edit/sizes.py` `set_size`), then the parts that
 * use its file built again. Resolves to those parts, or the CAD service's reason.
 */
export async function changeSize(
  post: CadPost,
  input: {
    readonly folder: string;
    readonly file: string;
    readonly name: string;
    readonly line: number;
    readonly old: string;
    readonly text: string;
  },
): Promise<{ readonly parts: ReadonlyArray<string> } | { readonly error: string }> {
  const reply = await post("/api/v1/local/sizes/set", input);
  if (isRecord(reply) && reply.ok === true) {
    return {
      parts: Array.isArray(reply.parts)
        ? reply.parts.filter((part): part is string => typeof part === "string")
        : [],
    };
  }
  return { error: failure(reply) };
}

/** A shared size added to `sizes.py` beside the parts. Resolves to its file, or the reason. */
export async function addSharedSize(
  post: CadPost,
  input: {
    readonly folder: string;
    readonly name: string;
    readonly text: string;
    readonly note: string;
  },
): Promise<{ readonly file: string } | { readonly error: string }> {
  const reply = await post("/api/v1/local/sizes/add", input);
  return isRecord(reply) && reply.ok === true && typeof reply.file === "string"
    ? { file: reply.file }
    : { error: failure(reply) };
}
