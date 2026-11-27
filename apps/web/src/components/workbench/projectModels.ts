import { humanName } from "./partNames";
import { classifyProjectFile, inReferenceFolder, type ProjectFile } from "./projectFiles";

/**
 * A cadgen 0.8 model of a project's folder: a part script's `@model`, as the engine's registry
 * records it once it has been built (`GET /api/v1/local/models?root=`, `cad_server/viewer/folder_models.py`). A model
 * has no file of its own (its script writes none), so the workbench lists it by its document id,
 * which is what opens it, pictures it and runs its jobs.
 */
export interface ProjectModel {
  /** Its document id. */
  readonly id: string;
  /** Its function's name, as the engine names the document. */
  readonly name: string;
  /** Its script, relative to the folder, with forward slashes. */
  readonly script: string;
  /** "Part" or "Assembly" as its last build counted its parts; "Part" before that is known. */
  readonly kind: "Part" | "Assembly";
  /** When the engine last built it (seconds), as its picture's version; null before it says. */
  readonly updated: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A folder's models as `/api/v1/local/models` answers them: every model of the engine's registry whose
 * script is in the folder, the rollback bar's bodies and models whose script is gone left out
 * there. Empty for anything else.
 */
export function readFolderModels(reply: unknown): ProjectModel[] {
  const list = isRecord(reply) && Array.isArray(reply.models) ? reply.models : [];
  return list.flatMap((model): ProjectModel[] => {
    if (!isRecord(model) || typeof model.id !== "string" || typeof model.script !== "string") {
      return [];
    }
    return [
      {
        id: model.id,
        name: typeof model.name === "string" && model.name !== "" ? model.name : model.id,
        script: model.script.replaceAll("\\", "/"),
        kind: model.kind === "assembly" ? "Assembly" : "Part",
        updated: typeof model.updated === "number" ? String(model.updated) : null,
      },
    ];
  });
}

/**
 * The newest first: by when the engine last built each (`version`), an assembly ahead of the parts
 * built with it. A file the engine keeps no time for comes after, in the order it was in.
 */
export function byLatest(a: ProjectFile, b: ProjectFile): number {
  const built = Number(b.version ?? 0) - Number(a.version ?? 0);
  if (built !== 0 || a.version === undefined) return built;
  return Number(b.kind === "Assembly") - Number(a.kind === "Assembly");
}

/**
 * A model as the project lists a part: by its document id (`path`), named as the engine names it,
 * filed in its script's folder under the script's name, so the checks run on it (named after its
 * script, as cadgen names a model's outputs) find it. One in a folder of bought parts is a reference part.
 */
export function modelProjectFile(model: ProjectModel): ProjectFile {
  const segments = model.script.split("/");
  const name = segments.at(-1) ?? model.script;
  const folder = segments.slice(0, -1).join("/");
  return {
    path: model.id,
    name,
    title: humanName(model.name),
    folder,
    group: inReferenceFolder(folder) ? "Reference parts" : "CAD",
    kind: model.kind,
    document: model.id,
    script: model.script,
    model: model.name,
    ...(model.updated === null ? {} : { version: model.updated }),
  };
}

/**
 * A folder's files as the project lists them (`classifyProjectFile`), in their order, each model's
 * script standing as its model (`modelProjectFile`), and any model whose script is not among
 * `paths` after them: the one rule every list of a project's parts reads its models by.
 */
export function folderFiles(
  paths: ReadonlyArray<string>,
  models: ReadonlyArray<ProjectModel> | undefined,
): ProjectFile[] {
  const byScript = new Map<string, ProjectModel[]>();
  for (const model of models ?? []) {
    byScript.set(model.script, [...(byScript.get(model.script) ?? []), model]);
  }
  const placed = new Set<string>();
  const files = paths.flatMap((path): ProjectFile[] => {
    const script = path.replaceAll("\\", "/").replace(/^(?:\.\/)+/, "");
    const made = byScript.get(script);
    if (made !== undefined) {
      placed.add(script);
      return made.map(modelProjectFile);
    }
    const file = classifyProjectFile(path);
    return file === null ? [] : [file];
  });
  for (const [script, made] of byScript) {
    if (!placed.has(script)) files.push(...made.map(modelProjectFile));
  }
  return files;
}

/** The picture version of each model among `files`, by its id: what its picture is cached by. */
export function pictureVersions(files: ReadonlyArray<ProjectFile>): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const file of files) {
    if (file.document !== undefined && file.version !== undefined) {
      versions[file.document] = file.version;
    }
  }
  return versions;
}
