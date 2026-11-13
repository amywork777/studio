/**
 * Studio projects as files: `<root>/<id>/project.json` and a README, the root `$STUDIO_PROJECTS_DIR`
 * or `~/studio-projects`. Each folder is its own git repository where git exists, each save a commit
 * stamped with this app's text-to-cad (`.studio/engine.json`); git never fails a save. Trash moves
 * only `project.json` to `<root>/.trash/<id>/`, so the folder, history and id stay put.
 */
import {
  StudioProject,
  StudioProjectsError,
  type StudioProjectsListResult,
  type StudioProjectsSaveInput,
  type StudioProjectsSaveResult,
  type StudioTrashedProject,
} from "@t3tools/contracts";
import { expandHomePath } from "@t3tools/provider-core/server/pathExpansion";
import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { newProjectFolderName } from "@t3tools/shared/path";
import { fromJsonStringPretty, fromLenientJson } from "@t3tools/shared/schemaJson";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import * as ProcessRunner from "../processRunner.ts";
import {
  blankedFiltersEnv,
  FOLDER_FILTERS_ARGS,
  FOLDER_SAFE_GIT_ARGS,
} from "../vcs/gitFolderSafety.ts";

const PROJECT_FILE = "project.json";
const README_FILE = "README.md";
/** With forward slashes, as git takes it on Windows too. */
const ENGINE_FILE = ".studio/engine.json";
const TRASH_FOLDER = ".trash";
const MAX_ID_LENGTH = 60;

/**
 * A project as `project.json` holds it: folders under the home directory as
 * `~/...`, so the file reads the same on a teammate's machine, each with its
 * git remote where known.
 */
const StudioProjectFile = Schema.Struct({
  studio: Schema.Literal(1),
  name: StudioProject.fields.name,
  template: StudioProject.fields.template,
  brief: StudioProject.fields.brief,
  folders: Schema.Array(
    Schema.Struct({ path: Schema.String, remote: Schema.optionalKey(Schema.String) }),
  ),
  createdAt: StudioProject.fields.createdAt,
});
type StudioProjectFile = typeof StudioProjectFile.Type;

/** A project's file as Trash holds it: the file whole, with when it went to Trash. */
const TrashedProjectFile = Schema.Struct({
  ...StudioProjectFile.fields,
  trashedAt: Schema.String,
});

// Lenient on read, since people edit these by hand; 2-space JSON on write.
const decodeProjectFile = Schema.decodeEffect(fromLenientJson(StudioProjectFile));
const encodeProjectFile = Schema.encodeEffect(fromJsonStringPretty(StudioProjectFile));
const decodeTrashedFile = Schema.decodeEffect(fromLenientJson(TrashedProjectFile));
const encodeTrashedFile = Schema.encodeEffect(fromJsonStringPretty(TrashedProjectFile));

/** `.studio/engine.json`: the text-to-cad this project was last worked on with. */
const encodeEngineFile = Schema.encodeEffect(
  fromJsonStringPretty(Schema.Struct({ textToCad: Schema.String })),
);

export class StudioProjects extends Context.Service<
  StudioProjects,
  {
    /**
     * Every project in the root folder by id, its folder's name, and those in
     * Trash. A folder with no `project.json` (one whose project is in Trash or
     * was deleted forever) is left out, and one whose file is not a project is
     * left out with a warning. A missing root has none.
     */
    readonly list: Effect.Effect<StudioProjectsListResult, StudioProjectsError>;
    /**
     * Writes one project and its README and commits them; `id: null` makes a new folder. A save to a
     * trashed project is refused (`in-trash`) so it never comes back beside its Trash record. Saves run
     * one at a time.
     */
    readonly save: (
      input: StudioProjectsSaveInput,
    ) => Effect.Effect<StudioProjectsSaveResult, StudioProjectsError>;
    /**
     * Moves a project to Trash: its file goes to `<root>/.trash/<id>/` with when, and leaves the
     * project's folder (committed there as a removal). Fails `invalid-id` for no such project.
     */
    readonly trash: (id: string) => Effect.Effect<StudioProjectsSaveResult, StudioProjectsError>;
    /**
     * Brings a project back from Trash under the same id, as it was. Fails `invalid-id` when it is
     * not in Trash, or a project already has that id.
     */
    readonly restore: (id: string) => Effect.Effect<StudioProjectsSaveResult, StudioProjectsError>;
    /**
     * Deletes a project's record in Trash forever. Only Trash's record: its folders on disk, and
     * its own folder's history, stay. Fails `invalid-id` when it is not in Trash.
     */
    readonly purge: (id: string) => Effect.Effect<StudioProjectsSaveResult, StudioProjectsError>;
  }
>()("t3/studio/StudioProjects") {}

/** An id is one folder name as written: no separators, not hidden, no edge spaces. */
const isProjectId = (id: string) =>
  id.length > 0 && id.trim() === id && !id.startsWith(".") && !/[\\/]/.test(id);

/** A new project's id: its name as a slug of a-z, 0-9 and dashes. */
const projectSlug = (name: string) =>
  newProjectFolderName(name).slice(0, MAX_ID_LENGTH).replace(/-+$/, "") || "project";

/** A remote without the user and password an https remote can carry, since the file is shared. */
function shareableRemote(remote: string): string {
  if (!/^https?:\/\//i.test(remote) || !URL.canParse(remote)) return remote;
  const url = new URL(remote);
  if (url.username === "" && url.password === "") return remote;
  url.username = "";
  url.password = "";
  return url.href;
}

function projectReadme(file: StudioProjectFile): string {
  const purpose = file.brief.purpose.trim();
  const folders = file.folders.map(
    (folder) => `- \`${folder.path}\`${folder.remote === undefined ? "" : ` (${folder.remote})`}`,
  );
  return [
    `# ${file.name}`,
    "",
    ...(purpose === "" ? [] : [purpose, ""]),
    "## Folders",
    "",
    ...(folders.length === 0 ? ["None yet."] : folders),
    "",
    "Studio keeps this file and `project.json` up to date; push this repository to share the project.",
    "",
  ].join("\n");
}

// Git's own message runs several lines; this is the one failure worth naming.
const commitHint = (stderr: string) =>
  /identity unknown|tell me who you are|no (name|email) was given/i.test(stderr)
    ? { hint: "Git has no name or email on this machine; set user.name and user.email." }
    : {};

const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const processRunner = yield* ProcessRunner.ProcessRunner;
  const home = yield* HostProcess.HomeDirectory;
  const environment = yield* HostProcess.Environment;
  const configuredRoot = environment.STUDIO_PROJECTS_DIR?.trim();
  // The app's own (`studioAppBundle.ts`); nothing is stamped where it names none.
  const textToCad = environment.STUDIO_TEXT_TO_CAD_VERSION?.trim() || null;
  const root = path.resolve(
    configuredRoot ? expandHomePath(configuredRoot, home) : path.join(home, "studio-projects"),
  );
  const saveLock = yield* Semaphore.make(1);

  // `-C` rather than a spawn cwd: a missing folder is then git's error, not a
  // spawn failure that looks like git is missing.
  const runGit = (
    folder: string,
    args: ReadonlyArray<string>,
    timeout: Duration.Input = "10 seconds",
    env?: NodeJS.ProcessEnv,
  ) =>
    processRunner.run({
      command: "git",
      args: ["-C", folder, ...FOLDER_SAFE_GIT_ARGS, ...args],
      timeout,
      timeoutBehavior: "timedOutResult",
      ...(env === undefined ? {} : { env }),
    });

  /** Git's trimmed output, or undefined when it fails or prints nothing. */
  const gitOutput = (folder: string, args: ReadonlyArray<string>) =>
    runGit(folder, args, "5 seconds").pipe(
      Effect.map((result) => (result.code === 0 ? result.stdout.trim() : "")),
      Effect.orElseSucceed(() => ""),
      Effect.map((output) => (output === "" ? undefined : output)),
    );

  // Probed once: whether this machine has git, so project folders become repositories.
  const gitAvailable = yield* Effect.cached(
    processRunner
      .run({
        command: "git",
        args: ["--version"],
        timeout: "5 seconds",
        timeoutBehavior: "timedOutResult",
      })
      .pipe(
        Effect.map((result) => result.code === 0),
        Effect.orElseSucceed(() => false),
      ),
  );

  /** One git step in a project folder; false, logged, when it fails, so the caller stops. */
  const gitStep = (folder: string, args: ReadonlyArray<string>, env?: NodeJS.ProcessEnv) =>
    runGit(folder, args, "30 seconds", env).pipe(
      Effect.flatMap((result) =>
        result.code === 0
          ? Effect.succeed(true)
          : Effect.logWarning("Saved the Studio project without committing it.", {
              folder,
              step: args[0],
              exitCode: result.code,
              timedOut: result.timedOut,
              ...commitHint(result.stderr),
            }).pipe(Effect.as(false)),
      ),
      Effect.catch((cause) =>
        Effect.logWarning("Saved the Studio project without committing it.", {
          folder,
          step: args[0],
          cause,
        }).pipe(Effect.as(false)),
      ),
    );

  /** Commits `files` in a project folder, making it a repository first. Never fails. */
  const commit = Effect.fnUntraced(function* (
    folder: string,
    files: ReadonlyArray<string>,
    message: string,
  ) {
    if (!(yield* gitAvailable)) return;
    const isRepository = yield* fileSystem
      .exists(path.join(folder, ".git"))
      .pipe(Effect.orElseSucceed(() => false));
    if (!isRepository) {
      const branch =
        (yield* gitOutput(folder, ["config", "--get", "init.defaultBranch"])) ?? "main";
      if (!(yield* gitStep(folder, ["init", "--quiet", `--initial-branch=${branch}`]))) return;
    }
    // A project's folder can hold a `.git` that came with it (`gitFolderSafety.ts`).
    const filters = blankedFiltersEnv((yield* gitOutput(folder, FOLDER_FILTERS_ARGS)) ?? "");
    if (!(yield* gitStep(folder, ["add", "--all", "--", ...files], filters))) return;
    // Only these files, so anything else the user staged stays theirs to commit.
    yield* gitStep(folder, ["commit", "--quiet", "--message", message, "--", ...files], filters);
  });

  /** A file's text, None when it does not exist. */
  const readText = (file: string) =>
    fileSystem.readFileString(file).pipe(
      Effect.asSome,
      Effect.catchTags({
        PlatformError: (error) =>
          error.reason._tag === "NotFound"
            ? Effect.succeed(Option.none<string>())
            : Effect.fail(error),
      }),
    );

  const trashFolder = path.join(root, TRASH_FOLDER);

  /** A file decoded; None when it does not exist, or (logged) when it is not a project. */
  const readDecoded = <A>(
    file: string,
    decode: (raw: string) => Effect.Effect<A, Schema.SchemaError>,
  ) =>
    readText(file).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeed(Option.none<A>()),
          onSome: (raw) => decode(raw).pipe(Effect.asSome),
        }),
      ),
      Effect.catch((cause) =>
        Effect.logWarning("Skipping a Studio project whose project.json is not a project.", {
          file,
          cause,
        }).pipe(Effect.as(Option.none<A>())),
      ),
    );

  /** A project folder's file; None when it has none, or (logged) when it is not a project. */
  const readProjectFile = (id: string) =>
    readDecoded(path.join(root, id, PROJECT_FILE), decodeProjectFile);

  /** A trashed project's file, the same way. */
  const readTrashedFile = (id: string) =>
    readDecoded(path.join(trashFolder, id, PROJECT_FILE), decodeTrashedFile);

  /** Folders under the home directory as `~/...`, with forward slashes. */
  const collapseHome = (folder: string) => {
    if (!path.isAbsolute(folder)) return folder;
    const relative = path.relative(home, folder);
    if (relative === "") return "~";
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      return folder;
    }
    return `~/${relative.split(path.sep).join("/")}`;
  };

  const toProject = (file: StudioProjectFile): StudioProject => {
    const folders = file.folders.map((entry) => expandHomePath(entry.path, home));
    const remotes = Object.fromEntries(
      file.folders.flatMap((entry, index) =>
        entry.remote === undefined ? [] : [[folders[index], entry.remote] as const],
      ),
    );
    return {
      name: file.name,
      template: file.template,
      brief: file.brief,
      folders,
      ...(Object.keys(remotes).length === 0 ? {} : { remotes }),
      createdAt: file.createdAt,
    };
  };

  const isDirectory = (folder: string) =>
    fileSystem.stat(folder).pipe(
      Effect.map((info) => info.type === "Directory"),
      Effect.orElseSucceed(() => false),
    );

  /** The project ids in a folder of project folders, sorted; none when it is missing. */
  const projectIdsIn = (folder: string) =>
    fileSystem.readDirectory(folder).pipe(
      Effect.catchTags({
        PlatformError: (cause) =>
          cause.reason._tag === "NotFound"
            ? Effect.succeed<ReadonlyArray<string>>([])
            : Effect.fail(new StudioProjectsError({ failure: "read", folder: root, cause })),
      }),
      Effect.map((names) => [...names].filter(isProjectId).sort()),
    );

  /** Each folder's file in `folder` that is a project, by id. */
  const readAll = <A>(folder: string, read: (id: string) => Effect.Effect<Option.Option<A>>) =>
    projectIdsIn(folder).pipe(
      Effect.flatMap((ids) =>
        Effect.forEach(
          ids,
          (id) =>
            isDirectory(path.join(folder, id)).pipe(
              Effect.flatMap((directory) =>
                directory ? read(id) : Effect.succeed(Option.none<A>()),
              ),
              Effect.map(Option.map((file) => [id, file] as const)),
            ),
          { concurrency: 8 },
        ),
      ),
      Effect.map((found) => found.flatMap(Option.toArray)),
    );

  const list: StudioProjects["Service"]["list"] = Effect.gen(function* () {
    const [found, inTrashFolder] = yield* Effect.all([
      readAll(root, readProjectFile),
      readAll(trashFolder, readTrashedFile),
    ]);
    return {
      folder: root,
      git: yield* gitAvailable,
      projects: Object.fromEntries(found.map(([id, file]) => [id, toProject(file)])),
      trashed: Object.fromEntries(
        inTrashFolder.map(([id, { trashedAt, ...file }]): [string, StudioTrashedProject] => [
          id,
          { ...toProject(file), trashedAt },
        ]),
      ),
    };
  }).pipe(Effect.withSpan("StudioProjects.list"));

  /** Whether a project with this id is in Trash. */
  const isTrashed = (id: string) =>
    fileSystem
      .exists(path.join(trashFolder, id, PROJECT_FILE))
      .pipe(
        Effect.mapError(
          (cause) => new StudioProjectsError({ failure: "write", folder: root, id, cause }),
        ),
      );

  /**
   * The first of `<slug>`, `<slug>-2`, `<slug>-3`, ... that no folder in the root or in Trash has,
   * so a Restore always finds its id free.
   */
  const freshId = Effect.fnUntraced(function* (name: string) {
    const slug = projectSlug(name);
    for (let attempt = 1; ; attempt++) {
      const id = attempt === 1 ? slug : `${slug}-${attempt}`;
      const taken = yield* Effect.all([
        fileSystem.exists(path.join(root, id)),
        fileSystem.exists(path.join(trashFolder, id)),
      ]).pipe(
        Effect.map(([inRoot, inTrash]) => inRoot || inTrash),
        Effect.mapError(
          (cause) => new StudioProjectsError({ failure: "write", folder: root, id, cause }),
        ),
      );
      if (!taken) return id;
    }
  });

  /** A folder's `origin`, read fresh, else the one the project already had. */
  const remoteOf = Effect.fnUntraced(function* (project: StudioProject, folder: string) {
    const fresh = (yield* gitAvailable)
      ? yield* gitOutput(folder, ["remote", "get-url", "origin"])
      : undefined;
    return fresh ?? project.remotes?.[folder];
  });

  const write = Effect.fnUntraced(function* (id: string, project: StudioProject) {
    const folder = path.join(root, id);
    const failed = (cause: unknown) =>
      new StudioProjectsError({ failure: "write", folder: root, id, cause });
    const remotes = yield* Effect.forEach(project.folders, (entry) => remoteOf(project, entry), {
      concurrency: 4,
    });
    const file: StudioProjectFile = {
      studio: 1,
      name: project.name,
      template: project.template,
      brief: project.brief,
      folders: project.folders.map((entry, index) => {
        const remote = remotes[index];
        return {
          path: collapseHome(entry),
          ...(remote === undefined ? {} : { remote: shareableRemote(remote) }),
        };
      }),
      createdAt: project.createdAt,
    };
    const json = `${yield* encodeProjectFile(file).pipe(Effect.mapError(failed))}\n`;
    const readme = projectReadme(file);
    const engine =
      textToCad === null
        ? null
        : `${yield* encodeEngineFile({ textToCad }).pipe(Effect.mapError(failed))}\n`;

    const projectPath = path.join(folder, PROJECT_FILE);
    const readmePath = path.join(folder, README_FILE);
    const enginePath = path.join(folder, ...ENGINE_FILE.split("/"));
    const [previous, previousReadme, previousEngine] = yield* Effect.all([
      readText(projectPath),
      readText(readmePath),
      readText(enginePath),
    ]).pipe(Effect.mapError(failed));
    if (
      Option.getOrUndefined(previous) === json &&
      Option.getOrUndefined(previousReadme) === readme &&
      (engine === null || Option.getOrUndefined(previousEngine) === engine)
    )
      return;

    yield* fileSystem
      .makeDirectory(path.dirname(enginePath), { recursive: true })
      .pipe(Effect.mapError(failed));
    for (const [filePath, contents] of [
      [projectPath, json],
      [readmePath, readme],
      ...(engine === null ? [] : [[enginePath, engine] as const]),
    ] as const) {
      yield* writeFileStringAtomically({ filePath, contents }).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provideService(Path.Path, path),
        Effect.mapError(failed),
      );
    }
    yield* commit(
      folder,
      [PROJECT_FILE, README_FILE, ...(engine === null ? [] : [ENGINE_FILE])],
      `${Option.isNone(previous) ? "Add" : "Update"} ${project.name}`,
    );
  });

  /** Writes a file whole, its folder made first. */
  const writeWhole = (filePath: string, contents: string) =>
    fileSystem
      .makeDirectory(path.dirname(filePath), { recursive: true })
      .pipe(
        Effect.andThen(
          writeFileStringAtomically({ filePath, contents }).pipe(
            Effect.provideService(FileSystem.FileSystem, fileSystem),
            Effect.provideService(Path.Path, path),
          ),
        ),
      );

  /** A file's removal; false when it was not there. */
  const removeFile = (filePath: string) =>
    fileSystem.remove(filePath).pipe(
      Effect.as(true),
      Effect.catchTags({
        PlatformError: (cause) =>
          cause.reason._tag === "NotFound" ? Effect.succeed(false) : Effect.fail(cause),
      }),
    );

  /** Trash's record of a project gone, and its folder there once empty. */
  const removeTrashed = (id: string) =>
    removeFile(path.join(trashFolder, id, PROJECT_FILE)).pipe(
      // Anything else someone put there stays, and so does the folder holding it.
      Effect.tap(() => {
        const folder = path.join(trashFolder, id);
        return fileSystem.readDirectory(folder).pipe(
          Effect.flatMap((left) =>
            left.length === 0 ? fileSystem.remove(folder, { recursive: true }) : Effect.void,
          ),
          Effect.ignore,
        );
      }),
    );

  // Decoding keeps only the fields Studio knows, as `save` does: a field added to project.json by
  // hand does not survive a trip through Trash.
  const moveToTrash = Effect.fnUntraced(function* (id: string) {
    const failed = (cause: unknown) =>
      new StudioProjectsError({ failure: "write", folder: root, id, cause });
    const file = yield* readProjectFile(id);
    if (Option.isNone(file)) {
      return yield* new StudioProjectsError({ failure: "invalid-id", folder: root, id });
    }
    const trashedAt = DateTime.formatIso(yield* DateTime.now);
    const json = yield* encodeTrashedFile({ ...file.value, trashedAt }).pipe(
      Effect.mapError(failed),
    );
    yield* writeWhole(path.join(trashFolder, id, PROJECT_FILE), `${json}\n`).pipe(
      Effect.mapError(failed),
    );
    // Never in both places: when the project's own file cannot go, neither does it go to Trash.
    yield* removeFile(path.join(root, id, PROJECT_FILE)).pipe(
      Effect.catch((cause) =>
        removeTrashed(id).pipe(Effect.ignore, Effect.andThen(Effect.fail(failed(cause)))),
      ),
    );
    yield* commit(path.join(root, id), [PROJECT_FILE], `Move ${file.value.name} to Trash`);
  });

  const restoreFromTrash = Effect.fnUntraced(function* (id: string) {
    const failed = (cause: unknown) =>
      new StudioProjectsError({ failure: "write", folder: root, id, cause });
    const trashed = yield* readTrashedFile(id);
    const projectPath = path.join(root, id, PROJECT_FILE);
    const taken = yield* fileSystem.exists(projectPath).pipe(Effect.mapError(failed));
    if (Option.isNone(trashed) || taken) {
      return yield* new StudioProjectsError({ failure: "invalid-id", folder: root, id });
    }
    const { trashedAt: _trashedAt, ...file } = trashed.value;
    const json = yield* encodeProjectFile(file).pipe(Effect.mapError(failed));
    yield* writeWhole(projectPath, `${json}\n`).pipe(Effect.mapError(failed));
    // Never in both places: when Trash's record cannot go, the project stays in Trash.
    yield* removeTrashed(id).pipe(
      Effect.catch((cause) =>
        removeFile(projectPath).pipe(Effect.ignore, Effect.andThen(Effect.fail(failed(cause)))),
      ),
    );
    yield* commit(path.join(root, id), [PROJECT_FILE], `Restore ${file.name}`);
  });

  const purgeFromTrash = Effect.fnUntraced(function* (id: string) {
    const removed = yield* removeTrashed(id).pipe(
      Effect.mapError(
        (cause) => new StudioProjectsError({ failure: "remove", folder: root, id, cause }),
      ),
    );
    if (!removed) {
      return yield* new StudioProjectsError({ failure: "invalid-id", folder: root, id });
    }
  });

  /** One Trash step on a project by id, one at a time with saves, then the list as it is now. */
  const trashStep =
    (name: string, step: (id: string) => Effect.Effect<void, StudioProjectsError>) =>
    (id: string) =>
      saveLock
        .withPermits(1)(
          Effect.gen(function* () {
            if (!isProjectId(id)) {
              return yield* new StudioProjectsError({ failure: "invalid-id", folder: root, id });
            }
            yield* step(id);
            return { ...(yield* list), id };
          }),
        )
        .pipe(Effect.withSpan(`StudioProjects.${name}`));

  const save: StudioProjects["Service"]["save"] = (input) =>
    saveLock
      .withPermits(1)(
        Effect.gen(function* () {
          const id = input.id ?? (yield* freshId(input.project.name));
          if (!isProjectId(id)) {
            return yield* new StudioProjectsError({ failure: "invalid-id", folder: root, id });
          }
          if (input.id !== null && (yield* isTrashed(id))) {
            return yield* new StudioProjectsError({ failure: "in-trash", folder: root, id });
          }
          yield* write(id, input.project);
          return { ...(yield* list), id };
        }),
      )
      .pipe(Effect.withSpan("StudioProjects.save"));

  return StudioProjects.of({
    list,
    save,
    trash: trashStep("trash", moveToTrash),
    restore: trashStep("restore", restoreFromTrash),
    purge: trashStep("purge", purgeFromTrash),
  });
});

export const layer = Layer.effect(StudioProjects, make);
