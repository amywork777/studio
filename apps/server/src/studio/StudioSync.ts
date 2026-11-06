/**
 * StudioSync - sends a project's work folder to its private online copy with every Version, and
 * brings one back. A plain push of `main` carries almost nothing: a Version is a checkpoint, and a
 * checkpoint's parent is `HEAD`, so checkpoints sit beside `main`, under refs a clone never asks
 * for. A send pushes all three sets by refspec, with the token in a header for that one process.
 *
 * Checkpoint refs are forced, since T3 can delete a stale one and reuse its ordinal, and each
 * chat's refs belong to one computer. `main` and kept refs never are: when they moved online the
 * send says so. Nothing is pruned, so a Version deleted here stays in the online copy.
 *
 * @module StudioSync
 */
import {
  SourceControlProviderKind,
  StudioSyncError,
  type StudioSyncSendInput,
  type StudioSyncSendResult,
  type StudioSyncStatusInput,
  type StudioSyncStatusResult,
} from "@t3tools/contracts";
import * as GitHubApi from "@t3tools/source-control-github/server/GitHubApi";
import { githubGitEnv } from "@t3tools/source-control-github/server/githubGitAuth";
import * as Context from "effect/Context";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { CHECKPOINT_REFS_PREFIX } from "../orchestration-v2/CheckpointService.ts";
import * as ProcessRunner from "../processRunner.ts";
import * as SourceControlRepositoryService from "../sourceControl/SourceControlRepositoryService.ts";

const MAIN_REF = "refs/heads/main";
/** Where the CAD service keeps what was on disk when a Version was restored (`versions.py`). */
const KEPT_REFS_PREFIX = "refs/studio/kept";
const REMOTE = "origin";
/** Which online copy Studio made for a folder, in that folder's own git config. */
const MADE_FOR_KEY = "studio.repository";
const GITHUB_PROVIDER = SourceControlProviderKind.make("github");

/** GitHub refuses a whole push that holds one file over this. */
const MAX_FILE_BYTES = 100 * 1024 * 1024;
/** Long lists of files and objects, well past git's own 8 MB default here. */
const MAX_LIST_BYTES = 64 * 1024 * 1024;
/** A first send can be hundreds of MB on a home connection, with no progress to watch. */
const TRANSFER_TIMEOUT = "2 hours";

/**
 * What never leaves the computer: each line as `.gitignore` holds it, and the same files as a
 * pathspec, since ignoring a file git already tracks does not stop it going.
 */
const NEVER_SENT = [
  { ignore: "tmp/", tracked: ":(glob)**/tmp/**" },
  { ignore: ".studio/compare/", tracked: ":(glob).studio/compare/**" },
  { ignore: "__pycache__/", tracked: ":(glob)**/__pycache__/**" },
  { ignore: ".env*", tracked: ":(glob)**/.env*" },
] as const;

/** A person's commit name for a machine with none, like the checkpoint commits have. */
const FALLBACK_IDENTITY = [
  "-c",
  "user.name=Studio",
  "-c",
  "user.email=t3code@users.noreply.github.com",
];

export class StudioSync extends Context.Service<
  StudioSync,
  {
    /**
     * Adds the missing ignores, refuses a file over the limit before anything leaves, makes the
     * online copy if the folder has none, commits working changes, then sends `main`, the
     * checkpoints and the kept refs. Sending again with nothing new changes nothing.
     */
    readonly send: (
      input: StudioSyncSendInput,
    ) => Effect.Effect<StudioSyncSendResult, StudioSyncError>;
    /**
     * Whether the online copy holds this folder's work and every Version. Compares local refs with
     * `ls-remote`, so a Version only the online copy has does not count against it, and being out
     * of reach reads as not synced rather than failing.
     */
    readonly status: (input: StudioSyncStatusInput) => Effect.Effect<StudioSyncStatusResult>;
    /** Clones `remote` into `folder`, a new folder, and fetches the refs a clone leaves behind. */
    readonly receive: (input: {
      readonly remote: string;
      readonly folder: string;
    }) => Effect.Effect<void, StudioSyncError>;
  }
>()("t3/studio/StudioSync") {}

/** A `.gitignore` line without its anchor or trailing slash, so `/tmp` counts as `tmp/`. */
const ignoreKey = (line: string) => line.trim().replace(/^\//, "").replace(/\/$/, "");

/** Whether a remote URL, https or ssh, points at `owner/name`. */
const remoteIs = (remote: string, repository: string) => {
  const url = remote
    .replace(/\/$/, "")
    .replace(/\.git$/i, "")
    .toLowerCase();
  const wanted = repository.toLowerCase();
  return url.endsWith(`/${wanted}`) || url.endsWith(`:${wanted}`);
};

/** The host a token is good for: https only, as ssh remotes bring their own keys. */
const httpsHost = (remote: string) => {
  if (!URL.canParse(remote)) return undefined;
  const url = new URL(remote);
  return url.protocol === "https:" ? url.hostname : undefined;
};

/** `sha ref` or `sha<tab>ref` lines as a map of ref to sha. */
const parseRefs = (output: string) =>
  new Map(
    output.split("\n").flatMap((line) => {
      const [sha, ref] = line.trim().split(/\s+/);
      return sha === undefined || ref === undefined ? [] : [[ref, sha] as const];
    }),
  );

const make = (maxFileBytes: number) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const processRunner = yield* ProcessRunner.ProcessRunner;
    const github = yield* GitHubApi.GitHubApi;
    const repositories = yield* SourceControlRepositoryService.SourceControlRepositoryService;

    const SENT_REFS = [`${CHECKPOINT_REFS_PREFIX}/*`, `${KEPT_REFS_PREFIX}/*`];

    // `-C` rather than a spawn cwd: a missing folder is then git's error, not a spawn failure
    // that looks like git is missing. LC_ALL so a refused push reads the same in any language.
    const runGit = (
      cwd: string,
      args: ReadonlyArray<string>,
      options: {
        readonly env?: Readonly<Record<string, string>>;
        readonly stdin?: string;
        readonly timeout?: Duration.Input;
      } = {},
    ) =>
      processRunner.run({
        command: "git",
        args: ["-C", cwd, ...args],
        env: { LC_ALL: "C", ...options.env },
        timeout: options.timeout ?? "60 seconds",
        timeoutBehavior: "timedOutResult",
        maxOutputBytes: MAX_LIST_BYTES,
        ...(options.stdin === undefined ? {} : { stdin: options.stdin }),
      });

    /** Git's stdout, or `failure` when it does not finish cleanly. */
    const gitOrFail = (
      cwd: string,
      args: ReadonlyArray<string>,
      failure: "prepare" | "receive",
      options?: Parameters<typeof runGit>[2],
    ) =>
      runGit(cwd, args, options).pipe(
        Effect.mapError((cause) => new StudioSyncError({ failure, cwd, cause })),
        Effect.flatMap((result) =>
          result.code === 0
            ? Effect.succeed(result.stdout)
            : Effect.fail(
                new StudioSyncError({
                  failure,
                  cwd,
                  ...(result.code === null ? {} : { exitCode: result.code }),
                }),
              ),
        ),
      );

    /** Git's trimmed output, or undefined when it fails or prints nothing. */
    const gitValue = (cwd: string, args: ReadonlyArray<string>) =>
      runGit(cwd, args).pipe(
        Effect.map((result) => (result.code === 0 ? result.stdout.trim() : "")),
        Effect.orElseSucceed(() => ""),
        Effect.map((output) => (output === "" ? undefined : output)),
      );

    /**
     * The folder's own history, not a parent folder's: `git -C` would walk up into any repository
     * the folder happens to sit in.
     */
    const hasHistory = (cwd: string) =>
      fileSystem.exists(path.join(cwd, ".git")).pipe(Effect.orElseSucceed(() => false));

    const originOf = (cwd: string) => gitValue(cwd, ["config", "--get", `remote.${REMOTE}.url`]);
    const headOf = (cwd: string) => gitValue(cwd, ["rev-parse", "--verify", "--quiet", "HEAD"]);

    /** The environment for one git process that talks to `remote`. */
    const remoteEnv = (remote: string, cwd: string) => {
      const host = httpsHost(remote);
      if (host === undefined) return Effect.succeed({ GIT_TERMINAL_PROMPT: "0" });
      return github.credential(host).pipe(
        Effect.map(({ token }) => githubGitEnv(remote, token)),
        Effect.mapError((cause) => new StudioSyncError({ failure: "sign-in", cwd, cause })),
      );
    };

    /** Adds what `NEVER_SENT` needs to `.gitignore`, keeping every line already there. */
    const addIgnores = Effect.fnUntraced(function* (cwd: string) {
      const file = path.join(cwd, ".gitignore");
      const prepareFailed = (cause: unknown) =>
        new StudioSyncError({ failure: "prepare", cwd, cause });
      const existing = yield* fileSystem.readFileString(file).pipe(
        Effect.catchTags({
          PlatformError: (cause) =>
            cause.reason._tag === "NotFound"
              ? Effect.succeed("")
              : Effect.fail(prepareFailed(cause)),
        }),
      );
      const present = new Set(existing.split(/\r?\n/).map(ignoreKey));
      const missing = NEVER_SENT.map((entry) => entry.ignore).filter(
        (line) => !present.has(ignoreKey(line)),
      );
      if (missing.length === 0) return;
      const separator = existing === "" || existing.endsWith("\n") ? "" : "\n";
      yield* fileSystem
        .writeFileString(file, `${existing}${separator}${missing.join("\n")}\n`)
        .pipe(Effect.mapError(prepareFailed));
    });

    /** Stops tracking what `NEVER_SENT` names. The files stay on disk. */
    const untrackNeverSent = (cwd: string) =>
      gitOrFail(
        cwd,
        [
          "rm",
          "-r",
          "--cached",
          "--quiet",
          "--ignore-unmatch",
          "--",
          ...NEVER_SENT.map((entry) => entry.tracked),
        ],
        "prepare",
      );

    /** Fails on the largest file a commit would add that is over the limit. */
    const checkWorkingFiles = Effect.fnUntraced(function* (cwd: string) {
      const listed = yield* gitOrFail(
        cwd,
        ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        "prepare",
      );
      const sizes = yield* Effect.forEach(
        listed.split("\0").filter((file) => file !== ""),
        (file) =>
          fileSystem.stat(path.join(cwd, ...file.split("/"))).pipe(
            Effect.map((info) => ({
              file,
              bytes: info.type === "File" ? Number(info.size) : 0,
            })),
            // Listed but deleted since: the commit records that, so it has no size to check.
            Effect.orElseSucceed(() => ({ file, bytes: 0 })),
          ),
        { concurrency: 16 },
      );
      const largest = sizes.reduce((a, b) => (b.bytes > a.bytes ? b : a), { file: "", bytes: 0 });
      if (largest.bytes > maxFileBytes) {
        return yield* new StudioSyncError({
          failure: "too-large",
          cwd,
          file: largest.file,
          bytes: largest.bytes,
          limitBytes: maxFileBytes,
        });
      }
    });

    /**
     * Fails on the largest file in anything already recorded. Versions go whole, and one file over
     * the limit in any of them blocks the send, so the files on disk are not enough to check.
     */
    const checkVersions = Effect.fnUntraced(function* (cwd: string) {
      if ((yield* headOf(cwd)) === undefined) return;
      const objects = yield* gitOrFail(
        cwd,
        ["rev-list", "--objects", "HEAD", ...SENT_REFS.map((ref) => `--glob=${ref}`)],
        "prepare",
      );
      const sizes = yield* gitOrFail(
        cwd,
        ["cat-file", "--batch-check=%(objecttype) %(objectsize) %(rest)"],
        "prepare",
        { stdin: objects },
      );
      let largest = { file: "", bytes: 0 };
      for (const line of sizes.split("\n")) {
        const [type, size, ...file] = line.split(" ");
        const bytes = Number(size);
        if (type === "blob" && bytes > largest.bytes) largest = { file: file.join(" "), bytes };
      }
      if (largest.bytes > maxFileBytes) {
        return yield* new StudioSyncError({
          failure: "too-large-version",
          cwd,
          file: largest.file,
          bytes: largest.bytes,
          limitBytes: maxFileBytes,
        });
      }
    });

    /** The folder's online copy, made and recorded when it has none. */
    const ensureOrigin = Effect.fnUntraced(function* (input: StudioSyncSendInput) {
      const { cwd, repository } = input;
      const origin = yield* originOf(cwd);
      if (origin !== undefined) return origin;
      const made = yield* repositories
        .createRepository({
          cwd,
          provider: GITHUB_PROVIDER,
          repository,
          visibility: "private",
          remoteName: REMOTE,
          protocol: "https",
        })
        .pipe(
          Effect.mapError((cause) => new StudioSyncError({ failure: "make-copy", cwd, cause })),
        );
      return made.remoteUrl;
    });

    /** Records every working change on the current line; nothing changed makes no commit. */
    const commitWork = Effect.fnUntraced(function* (cwd: string) {
      yield* gitOrFail(cwd, ["add", "--all"], "prepare", { timeout: "10 minutes" });
      const staged = yield* runGit(cwd, ["diff", "--cached", "--quiet"]).pipe(
        Effect.mapError((cause) => new StudioSyncError({ failure: "prepare", cwd, cause })),
      );
      if (staged.code === 0) return;
      const identified = (yield* gitValue(cwd, ["config", "user.email"])) !== undefined;
      yield* gitOrFail(
        cwd,
        [
          // A signing prompt has nobody to answer it here.
          "-c",
          "commit.gpgsign=false",
          ...(identified ? [] : FALLBACK_IDENTITY),
          "commit",
          "--quiet",
          "--message",
          "Backed up from Studio",
        ],
        "prepare",
      );
    });

    /** Pushes all three ref sets, reporting whether anything moved. */
    const push = Effect.fnUntraced(function* (cwd: string, env: Readonly<Record<string, string>>) {
      const result = yield* runGit(
        cwd,
        [
          "push",
          "--porcelain",
          REMOTE,
          `HEAD:${MAIN_REF}`,
          `+${CHECKPOINT_REFS_PREFIX}/*:${CHECKPOINT_REFS_PREFIX}/*`,
          `${KEPT_REFS_PREFIX}/*:${KEPT_REFS_PREFIX}/*`,
        ],
        { env, timeout: TRANSFER_TIMEOUT },
      ).pipe(Effect.mapError((cause) => new StudioSyncError({ failure: "send", cwd, cause })));
      const refs = result.stdout.split("\n").filter((line) => /^[ *+=!-]\t/.test(line));
      if (result.code === 0) return refs.some((line) => !line.startsWith("="));
      if (refs.some((line) => line.startsWith("!\t") && line.includes("[rejected]"))) {
        return yield* new StudioSyncError({ failure: "changed-elsewhere", cwd });
      }
      const refused = /authentication failed|could not read username|terminal prompts disabled/i;
      return yield* new StudioSyncError({
        failure: refused.test(result.stderr) ? "sign-in" : "send",
        cwd,
        ...(result.code === null ? {} : { exitCode: result.code }),
      });
    });

    const send: StudioSync["Service"]["send"] = Effect.fn("StudioSync.send")(function* (input) {
      const { cwd, repository } = input;
      if (!(yield* hasHistory(cwd))) {
        return yield* new StudioSyncError({ failure: "no-history", cwd });
      }
      // A folder with an online copy of its own is left to it, whatever the client asked.
      const existing = yield* originOf(cwd);
      if (existing !== undefined && !remoteIs(existing, repository)) {
        return yield* new StudioSyncError({ failure: "other-copy", cwd });
      }
      yield* addIgnores(cwd);
      yield* untrackNeverSent(cwd);
      yield* checkWorkingFiles(cwd);
      yield* checkVersions(cwd);
      const origin = yield* ensureOrigin(input);
      // Recorded before the transfer: a first send that fails leaves the folder with a remote,
      // and without this the next try would take it for a repository of someone else's.
      yield* gitOrFail(cwd, ["config", MADE_FOR_KEY, repository], "prepare");
      const env = yield* remoteEnv(origin, cwd);
      yield* commitWork(cwd);
      if ((yield* headOf(cwd)) === undefined) {
        return yield* new StudioSyncError({ failure: "no-history", cwd });
      }
      return { repository, sent: yield* push(cwd, env) };
    });

    const isSynced = Effect.fnUntraced(function* (cwd: string, origin: string) {
      const head = yield* headOf(cwd);
      if (head === undefined) return false;
      const changes = yield* gitOrFail(
        cwd,
        ["status", "--porcelain", "--ignore-submodules=dirty"],
        "prepare",
      );
      if (changes.trim() !== "") return false;
      const local = parseRefs(
        yield* gitOrFail(
          cwd,
          [
            "for-each-ref",
            "--format=%(objectname) %(refname)",
            CHECKPOINT_REFS_PREFIX,
            KEPT_REFS_PREFIX,
          ],
          "prepare",
        ),
      );
      const online = parseRefs(
        yield* gitOrFail(cwd, ["ls-remote", REMOTE, MAIN_REF, ...SENT_REFS], "prepare", {
          env: yield* remoteEnv(origin, cwd),
          timeout: "20 seconds",
        }),
      );
      return (
        online.get(MAIN_REF) === head && [...local].every(([ref, sha]) => online.get(ref) === sha)
      );
    });

    const status: StudioSync["Service"]["status"] = Effect.fn("StudioSync.status")(
      function* (input) {
        const { cwd } = input;
        if (!(yield* hasHistory(cwd))) return { repository: null, synced: false };
        const repository = (yield* gitValue(cwd, ["config", "--get", MADE_FOR_KEY])) ?? null;
        const origin = yield* originOf(cwd);
        if (origin === undefined) return { repository, synced: false };
        const synced = yield* isSynced(cwd, origin).pipe(Effect.orElseSucceed(() => false));
        return { repository, synced };
      },
    );

    const receive: StudioSync["Service"]["receive"] = Effect.fn("StudioSync.receive")(
      function* (input) {
        const { remote, folder } = input;
        const parent = path.dirname(folder);
        yield* fileSystem
          .makeDirectory(parent, { recursive: true })
          .pipe(
            Effect.mapError(
              (cause) => new StudioSyncError({ failure: "receive", cwd: folder, cause }),
            ),
          );
        const env = yield* remoteEnv(remote, folder);
        yield* gitOrFail(parent, ["clone", "--quiet", remote, folder], "receive", {
          env,
          timeout: TRANSFER_TIMEOUT,
        });
        yield* gitOrFail(
          folder,
          [
            "fetch",
            "--quiet",
            "--no-tags",
            REMOTE,
            `+${CHECKPOINT_REFS_PREFIX}/*:${CHECKPOINT_REFS_PREFIX}/*`,
            `${KEPT_REFS_PREFIX}/*:${KEPT_REFS_PREFIX}/*`,
          ],
          "receive",
          { env, timeout: TRANSFER_TIMEOUT },
        );
      },
    );

    return StudioSync.of({ send, status, receive });
  });

/** The service with its own limit on one file, for a test that needs no big fixture. */
export const layerWithFileLimit = (maxFileBytes: number) =>
  Layer.effect(StudioSync, make(maxFileBytes));

export const layer = layerWithFileLimit(MAX_FILE_BYTES);
