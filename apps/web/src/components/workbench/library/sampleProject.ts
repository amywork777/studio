/**
 * How an example Studio ships (`studio-sample/<id>/`) is copied into a project of yours
 * (`useExample`): its files, then its README, never its marker; and one copy at a time, so a
 * second copy is named past the first.
 */

import { type BuiltPart, buildThenSwap } from "../newPart";

/** The servo bracket: the example the Library's examples are in, unless one names another. */
export const SAMPLE_ID = "servo-bracket";

/** The file at the top of an example that says what it is; a copy is a project, so it stays out. */
export const SAMPLE_MARKER = "studio-sample.json";

/**
 * Copies an example into a new project's folder: its top-level files and folders but the marker,
 * then its README in place of the one the folder starts with. A step that fails throws, and none
 * after it runs, so the copy is not reported made.
 */
export async function copySample(steps: {
  /** The example's top-level entries the folder lacks (`copiedEntries`). */
  readonly entries: ReadonlyArray<string>;
  /** Copies entries of the example into the folder. */
  readonly copy: (entries: ReadonlyArray<string>) => Promise<unknown>;
  /** Writes the example's README over the folder's own; null when the example has none. */
  readonly writeReadme: (() => Promise<void>) | null;
}) {
  await steps.copy(steps.entries.filter((entry) => entry !== SAMPLE_MARKER));
  await steps.writeReadme?.();
}

/** Whether an example's file is a model's script, which a copy opens by the document it builds. */
export function isModelScript(file: string): boolean {
  return file.toLowerCase().endsWith(".py");
}

/**
 * Copies an example into a new project and opens it on its file. A model script has never been
 * built in the copy, so it opens on the Overview until the build lands (`buildThenSwap`).
 * Resolves to whether the copy was made, once what it opens is open.
 */
export async function copyThenOpen<Ref>(steps: {
  /** The file the copy opens on, inside it, with "/". */
  readonly file: string;
  /** The copy's name, for what a failed build says. */
  readonly name: string;
  readonly create: (input: {
    readonly onFolder: (folder: string) => Promise<void>;
    readonly show: (ref: Ref) => void;
  }) => Promise<boolean>;
  /** Copies the example into the new project's folder. */
  readonly copyInto: (folder: string) => Promise<void>;
  readonly openFile: (ref: Ref, file: string) => void;
  /** Opens the project's Overview beside the chat. */
  readonly openProject: (ref: Ref) => void;
  readonly build: (ref: Ref, script: string) => Promise<BuiltPart>;
  readonly openPart: (ref: Ref, id: string) => void;
  /** The copy is made and its model is being built. */
  readonly building: () => void;
  /**
   * Dates the checks the copy came with to now. They were run on this very part, but a copy's
   * files are dated by the copy and its models first build after, which would read as the part
   * having changed since (`checkOutOfDate`). Runs once a build lands, Build again's too.
   */
  readonly redateChecks: (folder: string) => Promise<void>;
  readonly failed: (title: string, error: unknown, retry?: () => void) => void;
}): Promise<boolean> {
  const model = isModelScript(steps.file);
  const made: { folder: string | null; chat: { readonly ref: Ref } | null } = {
    folder: null,
    chat: null,
  };
  const created = await steps.create({
    onFolder: async (folder) => {
      made.folder = folder;
      await steps.copyInto(folder);
    },
    show: (ref) => {
      made.chat = { ref };
      if (model) steps.openProject(ref);
      else steps.openFile(ref, steps.file);
    },
  });
  if (!created || !model || made.folder === null || made.chat === null) return created;
  steps.building();
  const folder = made.folder;
  await buildThenSwap({
    ref: made.chat.ref,
    script: `${folder.replace(/[\\/]+$/, "")}/${steps.file}`,
    failedTitle: `Made ${steps.name}, but its part did not build`,
    build: steps.build,
    openPart: (ref, id) => {
      steps.openPart(ref, id);
      void steps.redateChecks(folder);
    },
    failed: steps.failed,
  });
  return true;
}

/**
 * Runs `work` once the work already under way for `key` has finished, so of two copies of an
 * example the second reads the project the first made and takes the next name.
 */
export function inTurn<T>(
  underWay: Map<string, Promise<unknown>>,
  key: string,
  work: () => Promise<T>,
) {
  const next = (underWay.get(key) ?? Promise.resolve()).then(work);
  // What the next one waits for: this one finished, whether it worked or not.
  const settled = next.then(
    () => undefined,
    () => undefined,
  );
  underWay.set(key, settled);
  void settled.then(() => {
    if (underWay.get(key) === settled) underWay.delete(key);
  });
  return next;
}
