import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import type { StudioProject } from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { EMPTY_STUDIO_BRIEF } from "@t3tools/shared/studioProjects";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import type * as Scope from "effect/Scope";

import * as ProcessRunner from "../processRunner.ts";
import * as StudioProjects from "./StudioProjects.ts";

const GIT_KEYS = [
  "EMAIL",
  "GIT_AUTHOR_NAME",
  "GIT_AUTHOR_EMAIL",
  "GIT_COMMITTER_NAME",
  "GIT_COMMITTER_EMAIL",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_NOSYSTEM",
] as const;

/** Sets git's variables to `values` for a test, and answers how to put them back. */
const replaceGitEnv = (values: Readonly<Record<string, string>>) => {
  const saved = GIT_KEYS.map((key) => [key, process.env[key]] as const);
  for (const key of GIT_KEYS) delete process.env[key];
  Object.assign(process.env, values);
  return () => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
};

/**
 * Runs `body` against the service with its home directory in a fresh temp
 * folder and `environment` as its process environment. Git reads only a
 * global config of the test's own, with a test identity unless `gitIdentity`
 * is false, so the developer's settings stay out.
 */
const withStudio = <A, E>(
  body: (
    home: string,
  ) => Effect.Effect<A, E, StudioProjects.StudioProjects | NodeServices.NodeServices | Scope.Scope>,
  options: { readonly environment?: NodeJS.ProcessEnv; readonly gitIdentity?: boolean } = {},
) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const home = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-studio-home-" });
    const globalConfig = yield* fileSystem.makeTempFileScoped({ prefix: "t3-gitconfig-" });
    const gitIdentity = options.gitIdentity ?? true;
    // Without an identity, git must not guess one from the host name either.
    if (!gitIdentity) {
      yield* fileSystem.writeFileString(globalConfig, "[user]\n\tuseConfigOnly = true\n");
    }
    yield* Effect.acquireRelease(
      Effect.sync(() =>
        replaceGitEnv({
          GIT_CONFIG_GLOBAL: globalConfig,
          GIT_CONFIG_NOSYSTEM: "1",
          ...(gitIdentity
            ? {
                GIT_AUTHOR_NAME: "Test",
                GIT_AUTHOR_EMAIL: "test@test.com",
                GIT_COMMITTER_NAME: "Test",
                GIT_COMMITTER_EMAIL: "test@test.com",
              }
            : {}),
        }),
      ),
      (restore) => Effect.sync(restore),
    );
    return yield* body(home).pipe(
      Effect.provide(
        StudioProjects.layer.pipe(
          Layer.provide(ProcessRunner.layer),
          Layer.provide(Layer.succeed(HostProcess.HomeDirectory, home)),
          Layer.provide(Layer.succeed(HostProcess.Environment, options.environment ?? {})),
        ),
      ),
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

const git = (cwd: string, args: ReadonlyArray<string>) =>
  ProcessRunner.ProcessRunner.pipe(
    Effect.flatMap((runner) => runner.run({ command: "git", args: ["-C", cwd, ...args] })),
    Effect.map((result) => result.stdout.trim()),
    Effect.provide(ProcessRunner.layer),
  );

/** A project with one folder under `home` and one outside it. */
const roverArm = (home: string, path: Path.Path): StudioProject => ({
  name: "Rover arm",
  template: "robot",
  brief: { ...EMPTY_STUDIO_BRIEF, purpose: "A three-joint arm for the rover deck." },
  folders: [path.join(home, "code", "rover-cad"), "/opt/shared/rover-board"],
  createdAt: "2026-10-14T00:00:00.000Z",
});

it.effect("has no projects, and makes no folder, while the folder is missing", () =>
  withStudio((home) =>
    Effect.gen(function* () {
      const studio = yield* StudioProjects.StudioProjects;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const listed = yield* studio.list;
      assert.equal(listed.folder, path.join(home, "studio-projects"));
      assert.deepEqual(listed.projects, {});
      assert.isFalse(yield* fileSystem.exists(listed.folder));
    }),
  ),
);

it.effect("saves a project as a folder of its own: a readable file, a README and a commit", () =>
  withStudio((home) =>
    Effect.gen(function* () {
      const studio = yield* StudioProjects.StudioProjects;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cad = path.join(home, "code", "rover-cad");
      yield* fileSystem.makeDirectory(cad, { recursive: true });
      const hasGit = (yield* studio.list).git;
      if (hasGit) {
        yield* git(cad, ["init", "--quiet"]);
        // A token in a remote URL must not reach a file meant to be pushed.
        yield* git(cad, [
          "remote",
          "add",
          "origin",
          "https://me:secret@github.com/x/rover-cad.git",
        ]);
      }

      const saved = yield* studio.save({ id: null, project: roverArm(home, path) });
      const folder = path.join(saved.folder, "rover-arm");
      assert.equal(saved.id, "rover-arm");

      const raw = yield* fileSystem.readFileString(path.join(folder, "project.json"));
      assert.isTrue(raw.startsWith('{\n  "studio": 1,\n  "name": "Rover arm",'));
      assert.isTrue(raw.endsWith("}\n"));
      assert.deepEqual(JSON.parse(raw).folders, [
        hasGit
          ? { path: "~/code/rover-cad", remote: "https://github.com/x/rover-cad.git" }
          : { path: "~/code/rover-cad" },
        { path: "/opt/shared/rover-board" },
      ]);
      const readme = yield* fileSystem.readFileString(path.join(folder, "README.md"));
      assert.include(readme, "# Rover arm\n\nA three-joint arm for the rover deck.");
      assert.include(readme, "- `/opt/shared/rover-board`\n");
      assert.include(readme, "push this repository to share the project");
      if (!hasGit) return;

      assert.include(readme, "- `~/code/rover-cad` (https://github.com/x/rover-cad.git)");
      assert.equal(yield* git(folder, ["log", "--format=%s"]), "Add Rover arm");
      // The root holds the project repositories; it is not one itself.
      assert.isFalse(yield* fileSystem.exists(path.join(saved.folder, ".git")));

      yield* studio.save({
        id: "rover-arm",
        project: { ...roverArm(home, path), name: "Rover arm v2" },
      });
      assert.equal(
        yield* git(folder, ["log", "--format=%s"]),
        "Update Rover arm v2\nAdd Rover arm",
      );
      assert.include(
        yield* fileSystem.readFileString(path.join(folder, "README.md")),
        "# Rover arm v2",
      );
      assert.equal(yield* git(folder, ["status", "--porcelain"]), "");
    }),
  ),
);

it.effect("stamps the text-to-cad the app includes, so each Version records it", () => {
  const engineFile = (home: string, path: Path.Path) =>
    path.join(home, "studio-projects", "rover-arm", ".studio", "engine.json");
  return withStudio(
    (home) =>
      Effect.gen(function* () {
        const studio = yield* StudioProjects.StudioProjects;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const project = roverArm(home, path);
        const saved = yield* studio.save({ id: null, project });
        assert.deepEqual(JSON.parse(yield* fileSystem.readFileString(engineFile(home, path))), {
          textToCad: "0.10.3",
        });
        if (!saved.git) return;
        const folder = path.join(saved.folder, "rover-arm");
        assert.equal(yield* git(folder, ["status", "--porcelain"]), "");
        assert.include(yield* git(folder, ["ls-files"]), ".studio/engine.json");

        // The same engine and the same project: no new Version.
        yield* studio.save({ id: "rover-arm", project });
        assert.equal(yield* git(folder, ["log", "--format=%s"]), "Add Rover arm");
      }),
    { environment: { STUDIO_TEXT_TO_CAD_VERSION: "0.10.3" } },
  );
});

it.effect("moves the stamp on the next save with a newer text-to-cad, and only then", () => {
  return withStudio(
    (home) =>
      Effect.gen(function* () {
        const studio = yield* StudioProjects.StudioProjects;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const project = roverArm(home, path);
        const saved = yield* studio.save({ id: null, project });
        const stamp = path.join(saved.folder, "rover-arm", ".studio", "engine.json");
        yield* fileSystem.writeFileString(stamp, '{\n  "textToCad": "0.10.3"\n}\n');

        yield* studio.list;
        assert.include(yield* fileSystem.readFileString(stamp), "0.10.3");

        yield* studio.save({ id: "rover-arm", project });
        assert.include(yield* fileSystem.readFileString(stamp), "0.11.0");
      }),
    { environment: { STUDIO_TEXT_TO_CAD_VERSION: "0.11.0" } },
  );
});

it.effect("stamps nothing where the app names no text-to-cad", () =>
  withStudio((home) =>
    Effect.gen(function* () {
      const studio = yield* StudioProjects.StudioProjects;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const saved = yield* studio.save({ id: null, project: roverArm(home, path) });
      assert.isFalse(
        yield* fileSystem.exists(path.join(saved.folder, "rover-arm", ".studio", "engine.json")),
      );
    }),
  ),
);

it.effect("saves a project without running what its folder's git settings name", () =>
  withStudio((home) =>
    Effect.gen(function* () {
      const studio = yield* StudioProjects.StudioProjects;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const saved = yield* studio.save({ id: null, project: roverArm(home, path) });
      if (!(yield* studio.list).git) return;
      const folder = path.join(saved.folder, "rover-arm");
      const marker = path.join(home, "ran");
      const program = path.join(home, "program.sh");
      yield* fileSystem.writeFileString(program, `#!/bin/sh\ntouch "${marker}"\ncat\n`);
      yield* fileSystem.chmod(program, 0o755);
      yield* git(folder, ["config", "core.fsmonitor", program]);
      yield* git(folder, ["config", "filter.supplier.clean", program]);
      yield* git(folder, ["config", "filter.supplier.required", "true"]);
      yield* fileSystem.copyFile(program, path.join(folder, ".git", "hooks", "pre-commit"));
      yield* fileSystem.writeFileString(path.join(folder, ".gitattributes"), "* filter=supplier\n");

      yield* studio.save({
        id: "rover-arm",
        project: { ...roverArm(home, path), name: "Rover arm v2" },
      });

      assert.equal(yield* git(folder, ["log", "-1", "--format=%s"]), "Update Rover arm v2");
      assert.isFalse(yield* fileSystem.exists(marker));
    }),
  ),
);

it.effect("names a new project's folder from its name, never reusing one that exists", () =>
  withStudio((home) =>
    Effect.gen(function* () {
      const studio = yield* StudioProjects.StudioProjects;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      // A folder that is no project still claims its name.
      yield* fileSystem.makeDirectory(path.join(home, "studio-projects", "bench"), {
        recursive: true,
      });
      const idFor = (name: string) =>
        studio
          .save({ id: null, project: { ...roverArm(home, path), name } })
          .pipe(Effect.map((result) => result.id));

      assert.equal(yield* idFor("Rover Arm!"), "rover-arm");
      assert.equal(yield* idFor("rover arm"), "rover-arm-2");
      assert.equal(yield* idFor("Bench"), "bench-2");
      assert.equal(yield* idFor("!!!"), "project");
      const long = yield* idFor(`${"Long name ".repeat(10)}end`);
      assert.isAtMost(long.length, 60);
      assert.match(long, /^long-name-long-name-[a-z0-9-]*[a-z0-9]$/);

      const escape = yield* studio
        .save({ id: "../escape", project: roverArm(home, path) })
        .pipe(Effect.flip);
      assert.equal(escape.failure, "invalid-id");
    }),
  ),
);

it.effect("lists what it saved, with folders under home written as ~ and read back whole", () =>
  withStudio(
    (home) =>
      Effect.gen(function* () {
        const studio = yield* StudioProjects.StudioProjects;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const project: StudioProject = {
          ...roverArm(home, path),
          remotes: { "/opt/shared/rover-board": "git@github.com:x/rover-board.git" },
        };
        const saved = yield* studio.save({ id: null, project });
        assert.equal(saved.folder, path.join(home, "shared", "studio"));
        assert.include(
          yield* fileSystem.readFileString(path.join(saved.folder, saved.id, "project.json")),
          '"path": "~/code/rover-cad"',
        );
        // A folder this machine cannot ask keeps the remote it came with.
        assert.deepEqual((yield* studio.list).projects, { [saved.id]: project });
      }),
    { environment: { STUDIO_PROJECTS_DIR: "~/shared/studio" } },
  ),
);

it.effect("refuses a save to a project in Trash, which stays there whole", () =>
  withStudio((home) =>
    Effect.gen(function* () {
      const studio = yield* StudioProjects.StudioProjects;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const project = roverArm(home, path);
      const saved = yield* studio.save({ id: null, project });
      yield* studio.trash(saved.id);

      // As a second window's rename, sent after the move, would.
      const refused = yield* studio
        .save({ id: saved.id, project: { ...project, name: "Rover arm v2" } })
        .pipe(Effect.flip);

      assert.equal(refused.failure, "in-trash");
      assert.isFalse(yield* fileSystem.exists(path.join(saved.folder, saved.id, "project.json")));
      const listed = yield* studio.list;
      assert.deepEqual(listed.projects, {});
      assert.equal(listed.trashed?.[saved.id]?.name, "Rover arm");
    }),
  ),
);

it.effect("never gives a new project the id of one in Trash", () =>
  withStudio((home) =>
    Effect.gen(function* () {
      const studio = yield* StudioProjects.StudioProjects;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const project = roverArm(home, path);
      const saved = yield* studio.save({ id: null, project });
      yield* studio.trash(saved.id);
      // Its own folder deleted by hand: only Trash still holds the id.
      yield* fileSystem.remove(path.join(saved.folder, saved.id), { recursive: true });

      const fresh = yield* studio.save({ id: null, project });

      assert.equal(fresh.id, "rover-arm-2");
      const restored = yield* studio.restore(saved.id);
      assert.deepEqual(Object.keys(restored.projects).sort(), ["rover-arm", "rover-arm-2"]);
    }),
  ),
);

it.effect("skips a project folder whose file is not a project, keeping the rest", () =>
  withStudio((home) =>
    Effect.gen(function* () {
      const studio = yield* StudioProjects.StudioProjects;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const saved = yield* studio.save({ id: null, project: roverArm(home, path) });
      const write = (relative: string, contents: string) =>
        Effect.gen(function* () {
          const file = path.join(saved.folder, relative);
          yield* fileSystem.makeDirectory(path.dirname(file), { recursive: true });
          yield* fileSystem.writeFileString(file, contents);
        });
      yield* write("broken/project.json", "{ not json");
      yield* write("half/project.json", '{ "studio": 1, "name": "Half" }');
      yield* write("notes.txt", "not a folder");

      assert.deepEqual(Object.keys((yield* studio.list).projects), [saved.id]);
    }),
  ),
);

it.effect("still saves a project when git cannot commit it", () =>
  withStudio(
    (home) =>
      Effect.gen(function* () {
        const studio = yield* StudioProjects.StudioProjects;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const saved = yield* studio.save({ id: null, project: roverArm(home, path) });
        const folder = path.join(saved.folder, saved.id);

        assert.deepEqual(Object.keys(saved.projects), [saved.id]);
        assert.isTrue(yield* fileSystem.exists(path.join(folder, "README.md")));
        if (!saved.git) return;
        assert.isTrue(yield* fileSystem.exists(path.join(folder, ".git")));
        assert.equal(yield* git(folder, ["log", "--format=%s"]), "");
      }),
    { gitIdentity: false },
  ),
);

it.effect("moves a project to Trash and lists it there, with when, until it is restored", () =>
  withStudio((home) =>
    Effect.gen(function* () {
      const studio = yield* StudioProjects.StudioProjects;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const project = roverArm(home, path);
      const saved = yield* studio.save({ id: null, project });
      const folder = path.join(saved.folder, saved.id);

      const trashed = yield* studio.trash(saved.id);

      assert.equal(trashed.id, saved.id);
      assert.deepEqual(trashed.projects, {});
      assert.deepEqual(Object.keys(trashed.trashed ?? {}), [saved.id]);
      const { trashedAt, ...inTrash } = trashed.trashed?.[saved.id] ?? { trashedAt: "" };
      assert.deepEqual(inTrash, project);
      assert.isFalse(Number.isNaN(Date.parse(trashedAt)));
      assert.isTrue(
        yield* fileSystem.exists(path.join(saved.folder, ".trash", saved.id, "project.json")),
      );
      assert.isFalse(yield* fileSystem.exists(path.join(folder, "project.json")));
      assert.deepEqual({ ...(yield* studio.list), id: saved.id }, trashed);

      const restored = yield* studio.restore(saved.id);

      // Back under the same id, whole, and out of Trash.
      assert.deepEqual(restored.projects, { [saved.id]: project });
      assert.deepEqual(restored.trashed, {});
      assert.isFalse(yield* fileSystem.exists(path.join(saved.folder, ".trash", saved.id)));
      if (!restored.git) return;
      assert.equal(
        yield* git(folder, ["log", "--format=%s"]),
        "Restore Rover arm\nMove Rover arm to Trash\nAdd Rover arm",
      );
      assert.equal(yield* git(folder, ["status", "--porcelain"]), "");
    }),
  ),
);

it.effect("trashes and restores a project whose folder is not a repository", () =>
  withStudio((home) =>
    Effect.gen(function* () {
      const studio = yield* StudioProjects.StudioProjects;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      // Written by hand, as a projects folder made before git (or without it) holds them.
      const folder = path.join(home, "studio-projects", "bench");
      yield* fileSystem.makeDirectory(folder, { recursive: true });
      yield* fileSystem.writeFileString(
        path.join(folder, "project.json"),
        JSON.stringify({
          studio: 1,
          name: "Bench",
          template: null,
          brief: EMPTY_STUDIO_BRIEF,
          folders: [],
          createdAt: "2026-10-14T00:00:00.000Z",
        }),
      );

      assert.deepEqual(Object.keys((yield* studio.trash("bench")).trashed ?? {}), ["bench"]);
      const restored = yield* studio.restore("bench");
      assert.deepEqual(Object.keys(restored.projects), ["bench"]);
      assert.equal(restored.projects.bench?.name, "Bench");
    }),
  ),
);

it.effect("deletes a trashed project's record forever, leaving its work folder", () =>
  withStudio((home) =>
    Effect.gen(function* () {
      const studio = yield* StudioProjects.StudioProjects;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const project = roverArm(home, path);
      const work = project.folders[0]!;
      yield* fileSystem.makeDirectory(work, { recursive: true });
      yield* fileSystem.writeFileString(path.join(work, "arm.step"), "ISO-10303-21;");
      const saved = yield* studio.save({ id: null, project });
      yield* studio.trash(saved.id);

      const purged = yield* studio.purge(saved.id);

      assert.equal(purged.id, saved.id);
      assert.deepEqual(purged.projects, {});
      assert.deepEqual(purged.trashed, {});
      assert.isFalse(yield* fileSystem.exists(path.join(saved.folder, ".trash", saved.id)));
      assert.equal(yield* fileSystem.readFileString(path.join(work, "arm.step")), "ISO-10303-21;");
      // A project that is not in Trash is never purged.
      const live = yield* studio.save({ id: null, project: { ...project, name: "Bench" } });
      const refused = yield* studio.purge(live.id).pipe(Effect.flip);
      assert.equal(refused.failure, "invalid-id");
      assert.deepEqual(Object.keys((yield* studio.list).projects), [live.id]);
    }),
  ),
);

it.effect("refuses to trash or restore what is not there", () =>
  withStudio((home) =>
    Effect.gen(function* () {
      const studio = yield* StudioProjects.StudioProjects;
      const path = yield* Path.Path;
      assert.equal((yield* studio.trash("nothing").pipe(Effect.flip)).failure, "invalid-id");
      assert.equal((yield* studio.restore("nothing").pipe(Effect.flip)).failure, "invalid-id");
      assert.equal((yield* studio.trash("../escape").pipe(Effect.flip)).failure, "invalid-id");
      const saved = yield* studio.save({ id: null, project: roverArm(home, path) });
      // Not in Trash: restoring it changes nothing.
      assert.equal((yield* studio.restore(saved.id).pipe(Effect.flip)).failure, "invalid-id");
      assert.deepEqual(Object.keys((yield* studio.list).projects), [saved.id]);
    }),
  ),
);
