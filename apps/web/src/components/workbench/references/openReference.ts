import { isAbsolutePath, workspaceRelativeFilePath } from "@t3tools/shared/path";

import { normalPath } from "../sameFile";
import type { SourceTarget } from "./answerSources";
import { useViewerFocusStore } from "./viewerFocus";

/**
 * Where a reference under an answer opens (`AnswerReferences`): a part at the feature its lines
 * make, a document at its line or its section, a page as a link in the chat opens.
 */
export type ReferenceOpening =
  | { readonly kind: "file"; readonly path: string; readonly line: number | null }
  | { readonly kind: "part"; readonly step: string; readonly script: string; readonly line: number }
  | { readonly kind: "link"; readonly url: string };

const SCRIPT = /\.py$/i;
const MODEL = /\.(?:step|stp)$/i;

/**
 * What the app says of a link, and of a file, that would not open (`ThreadTerminalDrawer`,
 * `ChatMarkdown`).
 */
const LINK_FAILED = "Unable to open link";
const FILE_FAILED = "Unable to open file";

/** A cited path in the thread's folder as it lists it: relative to it; any other path as written. */
function inFolder(path: string, root: string | null): string {
  if (!isAbsolutePath(path)) return normalPath(path);
  const relative = workspaceRelativeFilePath(path, root);
  return relative === null || relative === "." ? path : relative;
}

/** The model a part script makes: a `.step` or `.stp` of its name beside it in the folder. */
function partModel(script: string, files: ReadonlyArray<string>): string | null {
  if (!SCRIPT.test(script)) return null;
  const stem = script.replace(SCRIPT, "");
  return (
    files.find((file) => MODEL.test(file) && normalPath(file).replace(MODEL, "") === stem) ?? null
  );
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The 1-based line of a document's first heading that reads `heading`, as written; null for none. */
function headingLine(text: string, heading: string): number | null {
  const pattern = new RegExp(`^#+\\s+${escaped(heading)}\\s*$`);
  const index = text.split("\n").findIndex((line) => pattern.test(line));
  return index < 0 ? null : index + 1;
}

/**
 * A `.py` with a model of its name beside it opens as that part. `files` is null while the folder
 * is still listed, and then a script opens as a plain file. A full path inside `root` is taken as
 * the folder lists it.
 */
export async function referenceOpening(
  target: SourceTarget,
  input: {
    readonly root: string | null;
    readonly files: ReadonlyArray<string> | null;
    readonly read: (path: string) => Promise<string | null>;
  },
): Promise<ReferenceOpening | null> {
  switch (target.kind) {
    case "own":
      return null;
    case "url":
      return { kind: "link", url: target.url };
    case "file": {
      const path = inFolder(target.path, input.root);
      const first = target.lines?.[0] ?? null;
      const step = input.files === null ? null : partModel(path, input.files);
      if (step !== null) return { kind: "part", step, script: path, line: first ?? 1 };
      if (target.heading === null) return { kind: "file", path, line: first };
      const text = await input.read(path).catch(() => null);
      return { kind: "file", path, line: text === null ? null : headingLine(text, target.heading) };
    }
  }
}

/**
 * The CAD view is asked to select the cited feature only where one shows the part; a plain file
 * has no features. Simple view shows none either, so there the script opens in front at the cited
 * lines, the part one tab away.
 */
export async function openReference(
  opening: ReferenceOpening,
  beside: {
    readonly openFile: (path: string, line?: number) => boolean;
    readonly openLink: (url: string) => Promise<void>;
    readonly threadKey: string;
    readonly simpleView: boolean;
  },
): Promise<void> {
  switch (opening.kind) {
    case "file":
      beside.openFile(opening.path, opening.line ?? undefined);
      return;
    case "link":
      await beside.openLink(opening.url);
      return;
    case "part": {
      const inView = beside.openFile(opening.step);
      if (beside.simpleView) {
        beside.openFile(opening.script, opening.line);
        return;
      }
      if (!inView) return;
      useViewerFocusStore.getState().focus(beside.threadKey, opening.step, {
        path: opening.script,
        line: opening.line,
      });
    }
  }
}

/**
 * A press on a reference: where it opens (`referenceOpening`), opened there (`openReference`). A
 * press that fails says so as the app says it of a link or a file that would not open (`failed`,
 * its words and why), and never leaves its failure unheard.
 */
export async function pressReference(
  target: SourceTarget,
  beside: Parameters<typeof referenceOpening>[1] &
    Parameters<typeof openReference>[1] & {
      readonly failed: (title: string, cause: unknown) => void;
    },
): Promise<void> {
  try {
    const opening = await referenceOpening(target, beside);
    if (opening !== null) await openReference(opening, beside);
  } catch (cause) {
    beside.failed(target.kind === "url" ? LINK_FAILED : FILE_FAILED, cause);
  }
}
