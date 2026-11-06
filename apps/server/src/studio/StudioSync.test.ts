import * as NodeURL from "node:url";

import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as GitHubApi from "@t3tools/source-control-github/server/GitHubApi";
import * as Effect from "effect/Effect";
import * as Base64 from "effect/encoding/Base64";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Redacted from "effect/Redacted";

import * as ProcessRunner from "../processRunner.ts";
import * as SourceControlRepositoryService from "../sourceControl/SourceControlRepositoryService.ts";
import * as StudioSync from "./StudioSync.ts";

const CHECKPOINTS = "refs/t3/orchestration-v2/checkpoints";
const KEPT = "refs/studio/kept";
const REPOSITORY = "amy/roomba";
const ONLINE = `https://github.com/${REPOSITORY}`;
const TOKEN = "studio-sync-test-token";
const GIT_KEYS = [
  "EMAIL",
  "GIT_AUTHOR_NAME",
  "GIT_AUTHOR_EMAIL",
  "GIT_COMMITTER_NAME",
  "GIT_COMMITTER_EMAIL",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_NOSYSTEM",
] as const;

type Git = (cwd: string, ...args: ReadonlyArray<string>) => Effect.Effect<string>;

interface Fixture {
  readonly work: string;
  readonly copy: string;
  readonly root: string;
  readonly git: Git;
  /** Writes a file in the work folder, making its folders. */
  readonly write: (file: string, text: string) => Effect.Effect<void>;
  /** Records a Version the way a turn does: a commit beside `main`, under a hidden ref. */
  readonly version: (ref: string, file: string, text: string) => Effect.Effect<string>;
  /** Everything Versions read from a repository, as `sha ref` lines. */
  readonly refs: (cwd: string) => Effect.Effect<string>;
  /** Every git process the service ran. */
  readonly calls: Array<ProcessRunner.ProcessRunInput>;
  /** The repositories the service asked to have made. */
  readonly made: Array<string>;
}

/**
 * Runs `body` against the service with a real work folder and a real bare repository as its online
 * copy. The folder's `origin` will read as an https URL and git rewrites it to the bare repository,
 * so the path a real send takes, token and all, runs with no network. Git sees only a config of the
 * test's own, with a test identity unless `gitIdentity` is false.
 */
const withProject = <A, E>(
  body: (
    fixture: Fixture,
  ) => Effect.Effect<A, E, StudioSync.StudioSync | NodeServices.NodeServices>,
  options: { readonly fileLimit?: number; readonly gitIdentity?: boolean } = {},
) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-studio-sync-" });
    const globalConfig = path.join(root, "gitconfig");
    const gitIdentity = options.gitIdentity ?? true;
    yield* fileSystem.writeFileString(
      globalConfig,
      gitIdentity
        ? "[user]\n\tname = Test\n\temail = test@test.com\n"
        : "[user]\n\tuseConfigOnly = true\n",
    );
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const saved = GIT_KEYS.map((key) => [key, process.env[key]] as const);
        for (const key of GIT_KEYS) delete process.env[key];
        Object.assign(process.env, { GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: "1" });
        return saved;
      }),
      (saved) =>
        Effect.sync(() => {
          for (const [key, value] of saved) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
          }
        }),
    );

    const runner = yield* Effect.provide(ProcessRunner.ProcessRunner, ProcessRunner.layer);
    const git: Git = (cwd, ...args) =>
      runner.run({ command: "git", args: ["-C", cwd, ...args] }).pipe(
        Effect.flatMap((result) =>
          result.code === 0
            ? Effect.succeed(result.stdout.trim())
            : Effect.die(new Error(`git ${args.join(" ")}: ${result.stderr}`)),
        ),
        Effect.orDie,
      );

    const work = path.join(root, "work");
    const copy = path.join(root, "copy.git");
    yield* fileSystem.makeDirectory(work);
    yield* git(root, "init", "--quiet", "--bare", "--initial-branch=main", copy);
    yield* git(work, "init", "--quiet", "--initial-branch=main");
    yield* git(work, "config", `url.${NodeURL.pathToFileURL(copy).href}.insteadOf`, ONLINE);

    const write = (file: string, text: string) => {
      const target = path.join(work, file);
      return fileSystem
        .makeDirectory(path.dirname(target), { recursive: true })
        .pipe(Effect.andThen(fileSystem.writeFileString(target, text)), Effect.orDie);
    };
    const version = (ref: string, file: string, text: string) =>
      Effect.gen(function* () {
        yield* write(file, text);
        yield* git(work, "add", "--all");
        const tree = yield* git(work, "write-tree");
        const commit = yield* git(work, "commit-tree", tree, "-p", "HEAD", "-m", ref);
        yield* git(work, "update-ref", ref, commit);
        yield* git(work, "reset", "--quiet", "--hard", "HEAD");
        return commit;
      });
    const refs = (cwd: string) =>
      git(
        cwd,
        "for-each-ref",
        "--format=%(objectname) %(refname)",
        "refs/heads/main",
        CHECKPOINTS,
        KEPT,
      );

    yield* write("part.py", "width = 10\n");
    yield* write("part.step", "ISO-10303-21;\n");
    yield* git(work, "add", "--all");
    yield* git(
      work,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@test.com",
      "commit",
      "--quiet",
      "-m",
      "Start",
    );

    const calls: Array<ProcessRunner.ProcessRunInput> = [];
    const made: Array<string> = [];
    const recording = Layer.succeed(
      ProcessRunner.ProcessRunner,
      ProcessRunner.ProcessRunner.of({
        run: (input) =>
          Effect.suspend(() => {
            calls.push(input);
            return runner.run(input);
          }),
      }),
    );
    const repositories = Layer.mock(SourceControlRepositoryService.SourceControlRepositoryService)({
      createRepository: (input) => {
        made.push(input.repository);
        return git(input.cwd, "remote", "add", "origin", ONLINE).pipe(
          Effect.as({
            repository: {
              provider: input.provider,
              nameWithOwner: input.repository,
              url: ONLINE,
              sshUrl: "",
            },
            remoteName: "origin",
            remoteUrl: ONLINE,
          }),
        );
      },
    });
    const gitHub = Layer.mock(GitHubApi.GitHubApi)({
      credential: () => Effect.succeed({ token: Redacted.make(TOKEN), fingerprint: "test" }),
    });

    return yield* body({ work, copy, root, git, write, version, refs, calls, made }).pipe(
      Effect.provide(
        (options.fileLimit === undefined
          ? StudioSync.layer
          : StudioSync.layerWithFileLimit(options.fileLimit)
        ).pipe(Layer.provide(recording), Layer.provide(repositories), Layer.provide(gitHub)),
      ),
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

const send = (cwd: string) =>
  StudioSync.StudioSync.pipe(Effect.flatMap((sync) => sync.send({ cwd, repository: REPOSITORY })));

const synced = (cwd: string) =>
  StudioSync.StudioSync.pipe(
    Effect.flatMap((sync) => sync.status({ cwd })),
    Effect.map((status) => status.synced),
  );

/** The failure a send stopped with. */
const refused = (cwd: string) => send(cwd).pipe(Effect.flip);

const roots = (fixture: Fixture, tree: string) =>
  fixture
    .git(fixture.copy, "ls-tree", "--name-only", tree)
    .pipe(Effect.map((out) => out.split("\n")));

it.effect("sends main, every Version and kept ref, and receive brings them back identical", () =>
  withProject((fixture) =>
    Effect.gen(function* () {
      const { work, copy, root, git, version, refs, made } = fixture;
      yield* version(`${CHECKPOINTS}/c2NvcGU/ordinal/1`, "part.py", "width = 11\n");
      yield* version(`${CHECKPOINTS}/c2NvcGU/ordinal/2`, "part.py", "width = 12\n");
      yield* version(`${KEPT}/1`, "part.py", "width = 13\n");

      const result = yield* send(work);
      assert.deepEqual(result, { repository: REPOSITORY, sent: true });
      assert.deepEqual(made, [REPOSITORY]);
      assert.strictEqual(yield* refs(copy), yield* refs(work));

      // A plain clone gets only main, which is why a send names the other refs.
      const plain = `${root}/plain`;
      yield* git(root, "clone", "--quiet", copy, plain);
      assert.strictEqual((yield* refs(plain)).split("\n").length, 1);

      const brought = `${root}/nested/brought`;
      const sync = yield* StudioSync.StudioSync;
      yield* sync.receive({ remote: NodeURL.pathToFileURL(copy).href, folder: brought });
      assert.strictEqual(yield* refs(brought), yield* refs(work));
      assert.strictEqual(
        yield* git(brought, "show", `${CHECKPOINTS}/c2NvcGU/ordinal/1:part.py`),
        "width = 11",
      );
      assert.strictEqual(yield* git(brought, "show", `${KEPT}/1:part.py`), "width = 13");
    }),
  ),
);

it.effect("says Synced only while the online copy holds everything here", () =>
  withProject((fixture) =>
    Effect.gen(function* () {
      const { work, copy, git, write, version } = fixture;
      assert.isFalse(yield* synced(work));

      yield* send(work);
      assert.isTrue(yield* synced(work));

      yield* write("part.py", "width = 20\n");
      assert.isFalse(yield* synced(work));
      yield* send(work);
      assert.isTrue(yield* synced(work));

      yield* version(`${CHECKPOINTS}/c2NvcGU/ordinal/9`, "part.py", "width = 21\n");
      assert.isFalse(yield* synced(work));
      yield* send(work);
      assert.isTrue(yield* synced(work));

      // A Version only the online copy holds takes nothing from here.
      yield* git(work, "update-ref", "-d", `${CHECKPOINTS}/c2NvcGU/ordinal/9`);
      assert.isTrue(yield* synced(work));

      // Out of reach reads as not synced, it does not fail.
      yield* git(
        work,
        "config",
        "--unset-all",
        `url.${NodeURL.pathToFileURL(copy).href}.insteadOf`,
      );
      yield* git(work, "remote", "set-url", "origin", `${copy}-gone`);
      assert.isFalse(yield* synced(work));
    }),
  ),
);

it.effect("names a file over the limit and sends nothing", () =>
  withProject(
    (fixture) =>
      Effect.gen(function* () {
        const { work, copy, write, git, made } = fixture;
        yield* write("frames/render.png", "x".repeat(65));

        const error = yield* refused(work);
        assert.strictEqual(error.failure, "too-large");
        assert.strictEqual(error.file, "frames/render.png");
        assert.include(error.message, "frames/render.png");
        assert.deepEqual(made, []);
        assert.strictEqual(yield* git(copy, "for-each-ref"), "");
      }),
    { fileLimit: 64 },
  ),
);

it.effect("names a file over the limit that only an earlier Version holds", () =>
  withProject(
    (fixture) =>
      Effect.gen(function* () {
        const { work, copy, version, git, made } = fixture;
        const ref = `${CHECKPOINTS}/c2NvcGU/ordinal/1`;
        yield* version(ref, "old.bin", "x".repeat(65));
        yield* git(work, "rm", "--quiet", "--ignore-unmatch", "old.bin");
        assert.strictEqual(yield* git(work, "status", "--porcelain"), "");

        const error = yield* refused(work);
        assert.strictEqual(error.failure, "too-large-version");
        assert.strictEqual(error.file, "old.bin");
        assert.deepEqual(made, []);
        assert.strictEqual(yield* git(copy, "for-each-ref"), "");
      }),
    { fileLimit: 64 },
  ),
);

it.effect("does not count a file over the limit that is never sent", () =>
  withProject(
    (fixture) =>
      Effect.gen(function* () {
        const { work, write } = fixture;
        yield* write("tmp/render.bin", "x".repeat(65));
        assert.isTrue((yield* send(work)).sent);
      }),
    { fileLimit: 64 },
  ),
);

it.effect("adds the ignores a project lacks and sends none of what they cover", () =>
  withProject((fixture) =>
    Effect.gen(function* () {
      const { work, write, git } = fixture;
      yield* write("tmp/frame.png", "generated\n");
      yield* write(".env.local", "SECRET=1\n");
      yield* write("cad/__pycache__/part.pyc", "bytecode\n");
      yield* write(".studio/compare/a.glb", "viewer\n");
      yield* write(".studio/authors.jsonl", "{}\n");

      yield* send(work);

      const sent = (yield* git(fixture.copy, "ls-tree", "-r", "--name-only", "main")).split("\n");
      assert.includeMembers(sent, [".gitignore", ".studio/authors.jsonl", "part.py"]);
      for (const file of sent)
        assert.notMatch(file, /^tmp\/|^\.env|__pycache__|^\.studio\/compare/);
      // On disk, all of it stays.
      assert.strictEqual(
        yield* git(work, "ls-files", "--others"),
        [".env.local", ".studio/compare/a.glb", "cad/__pycache__/part.pyc", "tmp/frame.png"].join(
          "\n",
        ),
      );
    }),
  ),
);

it.effect("keeps an existing .gitignore and adds only what it lacks", () =>
  withProject((fixture) =>
    Effect.gen(function* () {
      const { work, copy, write, git } = fixture;
      yield* write(".gitignore", "*.log\n/tmp\n__pycache__");

      yield* send(work);

      assert.strictEqual(
        yield* git(copy, "show", "main:.gitignore"),
        "*.log\n/tmp\n__pycache__\n.studio/compare/\n.env*",
      );
    }),
  ),
);

it.effect("stops sending a file git already tracked once it is ignored", () =>
  withProject((fixture) =>
    Effect.gen(function* () {
      const { work, write, git } = fixture;
      yield* write("tmp/old.png", "generated\n");
      yield* git(work, "add", "--all");
      yield* git(work, "commit", "--quiet", "-m", "Tracked");

      yield* send(work);

      assert.notInclude(yield* roots(fixture, "main"), "tmp");
      assert.strictEqual(yield* git(work, "ls-files", "--others"), "tmp/old.png");
    }),
  ),
);

it.effect("does nothing on a second send", () =>
  withProject((fixture) =>
    Effect.gen(function* () {
      const { work, copy, version, git, refs } = fixture;
      yield* version(`${CHECKPOINTS}/c2NvcGU/ordinal/1`, "part.py", "width = 11\n");
      yield* send(work);
      const head = yield* git(work, "rev-parse", "HEAD");
      const sent = yield* refs(copy);

      assert.isFalse((yield* send(work)).sent);
      assert.strictEqual(yield* git(work, "rev-parse", "HEAD"), head);
      assert.strictEqual(yield* refs(copy), sent);
    }),
  ),
);

it.effect("sends a replaced checkpoint but never forces a kept ref", () =>
  withProject((fixture) =>
    Effect.gen(function* () {
      const { work, copy, git, version } = fixture;
      const checkpoint = `${CHECKPOINTS}/c2NvcGU/ordinal/1`;
      const kept = `${KEPT}/1`;
      yield* version(checkpoint, "part.py", "width = 11\n");
      const firstKept = yield* version(kept, "part.py", "width = 12\n");
      yield* send(work);

      // Both replaced by a sibling, which is not a fast-forward of what the online copy holds.
      const replaced = yield* version(checkpoint, "part.py", "width = 21\n");
      yield* version(kept, "part.py", "width = 22\n");

      const error = yield* refused(work);
      assert.strictEqual(error.failure, "changed-elsewhere");
      assert.strictEqual(yield* git(copy, "rev-parse", checkpoint), replaced);
      assert.strictEqual(yield* git(copy, "rev-parse", kept), firstKept);
    }),
  ),
);

it.effect("never forces main over work from somewhere else", () =>
  withProject((fixture) =>
    Effect.gen(function* () {
      const { work, copy, root, git, write } = fixture;
      yield* send(work);
      const other = `${root}/other`;
      yield* git(root, "clone", "--quiet", copy, other);
      yield* git(other, "commit", "--quiet", "--allow-empty", "-m", "From another computer");
      yield* git(other, "push", "--quiet", "origin", "main");
      const online = yield* git(copy, "rev-parse", "main");

      yield* write("part.py", "width = 30\n");
      const error = yield* refused(work);
      assert.strictEqual(error.failure, "changed-elsewhere");
      assert.strictEqual(yield* git(copy, "rev-parse", "main"), online);
      assert.isFalse(yield* synced(work));
    }),
  ),
);

it.effect("keeps the token out of every argument and out of the folder's config", () =>
  withProject((fixture) =>
    Effect.gen(function* () {
      const { work, calls, write } = fixture;
      const header = Base64.encode(`x-access-token:${TOKEN}`);
      yield* send(work);
      yield* write("part.py", "width = 40\n");
      yield* send(work);
      yield* synced(work);

      for (const call of calls) {
        const args = call.args.join(" ");
        assert.notInclude(args, TOKEN);
        assert.notInclude(args, header);
      }
      const remoteCalls = calls.filter((call) => call.env?.GIT_CONFIG_VALUE_0 !== undefined);
      assert.includeMembers(
        remoteCalls.map((call) => call.args[2]),
        ["push", "ls-remote"],
      );
      for (const call of remoteCalls) {
        assert.strictEqual(call.env?.GIT_CONFIG_KEY_0, `http.${ONLINE}.extraheader`);
        assert.include(call.env?.GIT_CONFIG_VALUE_0, header);
      }
      // Only the transfers carry it.
      for (const call of calls) {
        if (call.args[2] === "commit") assert.isUndefined(call.env?.GIT_CONFIG_VALUE_0);
      }

      const fileSystem = yield* FileSystem.FileSystem;
      const config = yield* fileSystem.readFileString(`${work}/.git/config`);
      assert.notInclude(config, TOKEN);
      assert.notInclude(config, header);
    }),
  ),
);

it.effect("leaves a folder that goes somewhere else alone", () =>
  withProject((fixture) =>
    Effect.gen(function* () {
      const { work, copy, git, made } = fixture;
      yield* git(work, "remote", "add", "origin", "https://github.com/someone/their-code");
      const head = yield* git(work, "rev-parse", "HEAD");

      assert.strictEqual((yield* refused(work)).failure, "other-copy");
      assert.deepEqual(made, []);
      assert.strictEqual(yield* git(work, "rev-parse", "HEAD"), head);
      assert.strictEqual(yield* git(copy, "for-each-ref"), "");
    }),
  ),
);

it.effect("goes on sending after a first send that stopped partway", () =>
  withProject((fixture) =>
    Effect.gen(function* () {
      const { work, copy, git, made, refs } = fixture;
      const url = `url.${NodeURL.pathToFileURL(copy).href}.insteadOf`;
      yield* git(work, "config", "--unset-all", url);
      yield* git(
        work,
        "config",
        `url.${NodeURL.pathToFileURL(`${copy}-gone`).href}.insteadOf`,
        ONLINE,
      );

      assert.strictEqual((yield* refused(work)).failure, "send");
      const sync = yield* StudioSync.StudioSync;
      assert.deepEqual(yield* sync.status({ cwd: work }), {
        repository: REPOSITORY,
        synced: false,
      });

      yield* git(
        work,
        "config",
        "--remove-section",
        `url.${NodeURL.pathToFileURL(`${copy}-gone`).href}`,
      );
      yield* git(work, "config", url, ONLINE);
      assert.isTrue((yield* send(work)).sent);
      assert.deepEqual(made, [REPOSITORY]);
      assert.strictEqual(yield* refs(copy), yield* refs(work));
    }),
  ),
);

it.effect("sends from a machine with no git identity", () =>
  withProject(
    (fixture) =>
      Effect.gen(function* () {
        const { work, copy, write, git } = fixture;
        yield* write("part.py", "width = 50\n");
        yield* send(work);
        assert.strictEqual(yield* git(copy, "log", "-1", "--format=%an", "main"), "Studio");
      }),
    { gitIdentity: false },
  ),
);

it.effect("sends a folder with no commits yet", () =>
  withProject((fixture) =>
    Effect.gen(function* () {
      const { root, copy, git } = fixture;
      const fresh = `${root}/fresh`;
      const fileSystem = yield* FileSystem.FileSystem;
      yield* fileSystem.makeDirectory(fresh).pipe(Effect.orDie);
      yield* git(fresh, "init", "--quiet", "--initial-branch=main");
      yield* git(fresh, "config", `url.${NodeURL.pathToFileURL(copy).href}.insteadOf`, ONLINE);
      yield* fileSystem.writeFileString(`${fresh}/part.py`, "width = 60\n").pipe(Effect.orDie);

      assert.isTrue((yield* send(fresh)).sent);
      assert.strictEqual(yield* git(copy, "show", "main:part.py"), "width = 60");
    }),
  ),
);

it.effect("refuses a folder with no history of its own, inside another's or not", () =>
  withProject((fixture) =>
    Effect.gen(function* () {
      const { work, copy, git } = fixture;
      const inner = `${work}/imported`;
      const fileSystem = yield* FileSystem.FileSystem;
      yield* fileSystem.makeDirectory(inner).pipe(Effect.orDie);

      assert.strictEqual((yield* refused(inner)).failure, "no-history");
      assert.strictEqual(yield* git(copy, "for-each-ref"), "");
    }),
  ),
);
