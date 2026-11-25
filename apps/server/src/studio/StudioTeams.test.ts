import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as GitHubCredentials from "@t3tools/source-control-github/server/GitHubCredentials";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { HttpClient, HttpClientResponse } from "effect/http";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ProcessRunner from "../processRunner.ts";
import * as SourceControlRepositoryService from "../sourceControl/SourceControlRepositoryService.ts";
import * as StudioSync from "./StudioSync.ts";
import * as StudioTeams from "./StudioTeams.ts";

const HUB = "https://hub.test";
const TEAM = "team-1";
const AMY = "amy@bracket.co";
const DANA = "dana@bracket.co";
const VIC = "vic@bracket.co";
const ROLES: Record<string, "admin" | "editor" | "viewer"> = {
  [AMY]: "admin",
  [DANA]: "editor",
  [VIC]: "viewer",
};

interface HubProject {
  id: string;
  name: string;
  version: number;
  head: string | null;
  bundle: string | null;
  holder: string | null;
  checkIns: Array<{
    version: number;
    by_email: string;
    note: string | null;
    at: string;
    released_rev: string | null;
    released_at: string | null;
  }>;
}

type HubComment = {
  id: string;
  project: string;
  version: number;
  by_email: string;
  body: string;
  at: string;
  anchor: { file: string; point?: number[] } | null;
  reply_to: string | null;
  resolved_in: number | null;
  agent_sees: boolean;
  fix_by: string | null;
  fix_at: string | null;
};

/**
 * The team hub's HTTP surface as `infra/teams` serves it (PostgREST functions and tables, Storage),
 * kept in memory, with the same refusals its SQL functions raise. Each person's calls carry their
 * own bearer token, `token:<email>`.
 */
const makeHub = () => {
  const projects = new Map<string, HubProject>();
  const files = new Map<string, Uint8Array>();
  const reviews: Array<{
    id: string;
    project: string;
    version: number;
    requested_email: string;
    created_at: string;
    team_review_people: Array<{
      email: string;
      decision: "approved" | "changes" | null;
      decided_at: string | null;
    }>;
    team_review_comments: Array<HubComment>;
  }> = [];
  /** Comments on a Version nobody asked to review. */
  const loose: Array<HubComment> = [];
  const allComments = () => [...reviews.flatMap((r) => r.team_review_comments), ...loose];
  const versionFiles: Array<{ project: string; version: number; path: string; object: string }> =
    [];
  const owners = new Map<string, string>();
  const limit = { bytes: 1024 ** 3 };
  const teamBytes = () => [...files.values()].reduce((sum, each) => sum + each.byteLength, 0);
  let clock = 0;
  const now = () => `2026-11-23T12:00:${String((clock += 1)).padStart(2, "0")}Z`;
  let shared = 0;
  const refuse = (message: string, details: string | null = null) => ({
    status: 400,
    body: JSON.stringify({ code: "P0001", message, details }),
  });
  const ok = (value: unknown) => ({ status: 200, body: JSON.stringify(value) });
  const row = (p: HubProject) => ({
    id: p.id,
    team_id: TEAM,
    name: p.name,
    version: p.version,
    head: p.head,
    checked_out_email: p.holder,
    updated_at: "2026-11-23T10:00:00Z",
    teams: { name: "Bracket Co" },
  });

  const handle = (
    method: string,
    url: URL,
    who: string,
    bytes: Uint8Array,
  ): { status: number; body: string | Uint8Array } => {
    // Like Supabase: a refresh token it does not know is a 400, not a 401.
    if (url.pathname === "/auth/v1/token") {
      return {
        status: 400,
        body: JSON.stringify({
          error_code: "refresh_token_not_found",
          msg: "Invalid Refresh Token",
        }),
      };
    }
    const role = ROLES[who];
    if (role === undefined) return { status: 401, body: "{}" };
    const json = () =>
      JSON.parse(new TextDecoder().decode(bytes)) as {
        readonly p_name: string;
        readonly p_project: string;
        readonly p_base: number;
        readonly p_head: string;
        readonly p_bundle: string;
        readonly p_note: string;
        readonly p_keep: boolean;
        readonly p_version: number;
        readonly p_reviewers: ReadonlyArray<string>;
        readonly p_review: string;
        readonly p_body: string;
        readonly p_decision: "approved" | "changes";
        readonly p_reply_to?: string;
        readonly p_comment: string;
        readonly p_files: ReadonlyArray<{ path: string; object: string; size: number }>;
      };
    const route = url.pathname;
    if (route.startsWith("/storage/v1/object/authenticated/projects/")) {
      const name = route.slice("/storage/v1/object/authenticated/projects/".length);
      // Viewers read only a Version's recorded review files, never a bundle.
      if (role === "viewer" && !versionFiles.some((each) => each.object === name)) {
        return { status: 400, body: "{}" };
      }
      const file = files.get(name);
      return file === undefined ? { status: 404, body: "{}" } : { status: 200, body: file };
    }
    if (route === "/storage/v1/object/projects" && method === "DELETE") {
      const { prefixes } = JSON.parse(new TextDecoder().decode(bytes)) as {
        readonly prefixes: ReadonlyArray<string>;
      };
      const current = new Set([...projects.values()].map((p) => p.bundle));
      const gone = prefixes.filter(
        (name) =>
          role === "admin" ||
          (role === "editor" && (owners.get(name) === who || !current.has(name))),
      );
      for (const name of gone) files.delete(name);
      return ok(gone.map((name) => ({ name })));
    }
    if (route.startsWith("/storage/v1/object/projects/")) {
      if (role === "viewer") return { status: 403, body: "{}" };
      const name = route.slice("/storage/v1/object/projects/".length);
      files.set(name, bytes);
      owners.set(name, who);
      return ok({ Key: route });
    }
    if (route === "/rest/v1/team_projects") {
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      return ok([...projects.values()].filter((p) => id === undefined || p.id === id).map(row));
    }
    if (route === "/rest/v1/team_project_versions") {
      const id = url.searchParams.get("project_id")?.replace(/^eq\./, "");
      return ok((projects.get(id ?? "")?.checkIns ?? []).toReversed());
    }
    if (route === "/rest/v1/team_review_comments") {
      const param = (name: string) => url.searchParams.get(name) ?? "";
      const ids = param("id")
        .replace(/^in\.\(|\)$/g, "")
        .split(",");
      return ok(
        allComments().filter(
          (c) =>
            c.project === param("project_id").replace(/^eq\./, "") &&
            (param("id") === "" || ids.includes(c.id)) &&
            (param("fix_at") === "" || (c.fix_at !== null && c.agent_sees)) &&
            (param("resolved_in") === "" || c.resolved_in === null),
        ),
      );
    }
    if (route === "/rest/v1/team_reviews") {
      const id = url.searchParams.get("project_id")?.replace(/^eq\./, "");
      return ok(reviews.filter((r) => r.project === id).toSorted((a, b) => b.version - a.version));
    }
    const fn = route.replace("/rest/v1/rpc/", "");
    const args = json();
    const editor = role === "admin" || role === "editor";
    switch (fn) {
      case "my_teams":
        return ok([
          {
            id: TEAM,
            name: "Bracket Co",
            seats: 3,
            role,
            members: Object.entries(ROLES).map(([email, r]) => ({ email, role: r })),
            invites: [],
            storageUsed: teamBytes(),
            storageLimit: limit.bytes,
          },
        ]);
      case "project_bundle": {
        const p = projects.get(args.p_project);
        if (p === undefined) return refuse("not-found");
        return editor ? ok(p.bundle) : refuse("not-allowed");
      }
      case "team_objects":
        if (role !== "admin") return refuse("not-allowed");
        return ok(
          [...files.keys()].filter((name) =>
            name.startsWith(
              args.p_project === undefined ? `${TEAM}/` : `${TEAM}/${args.p_project}/`,
            ),
          ),
        );
      case "delete_project": {
        if (role !== "admin") return refuse("not-allowed");
        if ([...files.keys()].some((name) => name.startsWith(`${TEAM}/${args.p_project}/`))) {
          return refuse("files-left");
        }
        projects.delete(args.p_project);
        return ok(null);
      }
      case "accept_invites":
        return ok(0);
      case "share_project": {
        if (!editor) return refuse("not-allowed");
        const id = `p-${(shared += 1)}`;
        projects.set(id, {
          id,
          name: args.p_name,
          version: 0,
          head: null,
          bundle: null,
          holder: who,
          checkIns: [],
        });
        return ok(id);
      }
      case "check_out": {
        const p = projects.get(args.p_project);
        if (p === undefined) return refuse("not-found");
        if (!editor) return refuse("not-allowed");
        if (p.holder !== null && p.holder !== who) return refuse("checked-out", p.holder);
        p.holder = who;
        return ok(null);
      }
      case "release_project": {
        const p = projects.get(args.p_project);
        if (p === undefined) return refuse("not-found");
        if (p.holder !== who && role !== "admin") return refuse("not-allowed");
        p.holder = null;
        return ok(null);
      }
      case "check_in": {
        const p = projects.get(args.p_project);
        if (p === undefined) return refuse("not-found");
        if (!editor) return refuse("not-allowed");
        if (p.holder !== who) return refuse("checked-out", p.holder);
        if (p.version !== args.p_base) return refuse("changed-elsewhere", String(p.version));
        if (teamBytes() > limit.bytes) return refuse("storage-full", String(limit.bytes));
        p.version += 1;
        p.head = args.p_head;
        p.bundle = args.p_bundle;
        p.holder = args.p_keep ? who : null;
        p.checkIns.push({
          version: p.version,
          by_email: who,
          note: args.p_note === "" ? null : args.p_note,
          at: now(),
          released_rev: null,
          released_at: null,
        });
        return ok(p.version);
      }
      case "request_review": {
        const p = projects.get(args.p_project);
        if (p === undefined) return refuse("not-found");
        if (!editor) return refuse("not-allowed");
        if (p.version !== args.p_version) return refuse("changed-elsewhere");
        const wanted = args.p_reviewers.map((e) => e.toLowerCase()).filter((e) => e !== who);
        if (wanted.length === 0) return refuse("no-reviewers");
        if (wanted.some((e) => ROLES[e] === undefined)) return refuse("not-on-team");
        if (reviews.some((r) => r.project === p.id && r.version === p.version)) {
          return refuse("already-in-review");
        }
        const id = `r-${reviews.length + 1}`;
        reviews.push({
          id,
          project: p.id,
          version: p.version,
          requested_email: who,
          created_at: now(),
          team_review_people: wanted.map((email) => ({ email, decision: null, decided_at: null })),
          team_review_comments: [],
        });
        return ok(id);
      }
      case "comment_review":
      case "comment_version": {
        const r =
          fn === "comment_review"
            ? reviews.find((each) => each.id === args.p_review)
            : reviews.find(
                (each) => each.project === args.p_project && each.version === args.p_version,
              );
        if (fn === "comment_review" && r === undefined) return refuse("not-allowed");
        const id = `00000000-0000-4000-8000-${String(allComments().length + 1).padStart(12, "0")}`;
        (r?.team_review_comments ?? loose).push({
          id,
          project: r?.project ?? args.p_project,
          version: r?.version ?? args.p_version,
          by_email: who,
          body: args.p_body,
          at: now(),
          anchor: null,
          reply_to: args.p_reply_to ?? null,
          resolved_in: null,
          agent_sees: editor,
          fix_by: null,
          fix_at: null,
        });
        return ok(id);
      }
      case "decide_review": {
        const r = reviews.find((each) => each.id === args.p_review);
        const person = r?.team_review_people.find((each) => each.email === who);
        if (person === undefined) return refuse("not-a-reviewer");
        person.decision = args.p_decision;
        person.decided_at = now();
        return ok(null);
      }
      case "resolve_comment": {
        if (!editor) return refuse("not-allowed");
        const comment = allComments().find((each) => each.id === args.p_comment);
        if (comment === undefined) return refuse("not-found");
        comment.resolved_in = args.p_version;
        return ok(null);
      }
      case "record_version_files": {
        if (!editor) return refuse("not-allowed");
        for (const file of args.p_files) {
          versionFiles.push({
            project: args.p_project,
            version: args.p_version,
            path: file.path,
            object: file.object,
          });
        }
        return ok(args.p_files.length);
      }
      case "release_version": {
        const p = projects.get(args.p_project);
        const r = reviews.find(
          (each) => each.project === args.p_project && each.version === args.p_version,
        );
        if (p === undefined) return refuse("not-found");
        if (role !== "admin") return refuse("not-allowed");
        if (r === undefined || r.team_review_people.some((each) => each.decision !== "approved")) {
          return refuse("not-approved");
        }
        const rev = String.fromCharCode(
          65 + p.checkIns.filter((c) => c.released_rev !== null).length,
        );
        const entry = p.checkIns.find((c) => c.version === args.p_version);
        if (entry !== undefined) {
          entry.released_rev = rev;
          entry.released_at = now();
        }
        return ok(rev);
      }
      default:
        return { status: 404, body: "{}" };
    }
  };

  /** The HTTP client a Studio talks to the hub with; the bearer token says who is calling. */
  const client = () =>
    HttpClient.make((request) =>
      Effect.sync(() => {
        const bytes = request.body._tag === "Uint8Array" ? request.body.body : new Uint8Array();
        const auth = request.headers["authorization"] ?? "";
        const reply = handle(
          request.method,
          new URL(request.url),
          auth.replace(/^Bearer token:/, ""),
          bytes,
        );
        return HttpClientResponse.fromWeb(
          request,
          new Response(
            typeof reply.body === "string"
              ? reply.body
              : new Blob([reply.body as Uint8Array<ArrayBuffer>]),
            { status: reply.status },
          ),
        );
      }),
    );

  return { projects, versionFiles, files, limit, client, comments: allComments };
};

type Hub = ReturnType<typeof makeHub>;
type Teams = StudioTeams.StudioTeams["Service"];

/** One person's Studio: their own sign-in and projects folder, the shared hub and real git. */
const studioFor = (hub: Hub, who: string, expiresAt = 4_000_000_000) => {
  const secrets = new Map<string, Uint8Array>([
    [
      "studio-teams-session",
      new TextEncoder().encode(
        JSON.stringify({
          accessToken: `token:${who}`,
          refreshToken: "refresh",
          expiresAt,
          email: who,
        }),
      ),
    ],
  ]);
  return StudioTeams.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(HttpClient.HttpClient, hub.client()),
        Layer.mock(ServerSecretStore.ServerSecretStore)({
          get: (name) => Effect.succeed(Option.fromNullishOr(secrets.get(name))),
          set: (name, value) => Effect.sync(() => void secrets.set(name, value)),
          remove: (name) => Effect.sync(() => void secrets.delete(name)),
        }),
        ProcessRunner.layer,
        StudioSync.layer.pipe(
          Layer.provide(ProcessRunner.layer),
          Layer.provide(Layer.mock(GitHubCredentials.GitHubCredentials)({})),
          Layer.provide(
            Layer.mock(SourceControlRepositoryService.SourceControlRepositoryService)({}),
          ),
        ),
        ConfigProvider.layer(
          ConfigProvider.fromEnv({ env: { STUDIO_TEAMS_URL: HUB, STUDIO_TEAMS_KEY: "public" } }),
        ),
      ),
    ),
  );
};

const withTeam = <A, E>(
  body: (input: {
    readonly amy: Teams;
    readonly dana: Teams;
    readonly vic: Teams;
    readonly hub: Hub;
    readonly root: string;
    readonly work: string;
    readonly git: (cwd: string, ...args: ReadonlyArray<string>) => Effect.Effect<string>;
    readonly write: (cwd: string, file: string, text: string) => Effect.Effect<void>;
    readonly read: (cwd: string, file: string) => Effect.Effect<string>;
    /** A Viewer's folder for a team project: Viewers never get one through Studio. */
    readonly viewerFolder: (projectId: string) => Effect.Effect<string>;
  }) => Effect.Effect<A, E, NodeServices.NodeServices>,
) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-studio-teams-" });
    const runner = yield* Effect.provide(ProcessRunner.ProcessRunner, ProcessRunner.layer);
    const git = (cwd: string, ...args: ReadonlyArray<string>) =>
      runner
        .run({
          command: "git",
          args: ["-C", cwd, "-c", "user.name=Test", "-c", "user.email=test@test.com", ...args],
        })
        .pipe(
          Effect.flatMap((result) =>
            result.code === 0
              ? Effect.succeed(result.stdout.trim())
              : Effect.die(new Error(`git ${args.join(" ")}: ${result.stderr}`)),
          ),
          Effect.orDie,
        );
    const write = (cwd: string, file: string, text: string) =>
      fileSystem.writeFileString(path.join(cwd, file), text).pipe(Effect.orDie);
    const read = (cwd: string, file: string) =>
      fileSystem.readFileString(path.join(cwd, file)).pipe(Effect.orDie);
    const work = path.join(root, "amy", "bracket");
    yield* fileSystem.makeDirectory(work, { recursive: true }).pipe(Effect.orDie);
    yield* git(work, "init", "--quiet", "--initial-branch=main");
    yield* write(work, "part.py", "wall = 3\n");
    yield* git(work, "add", "--all");
    yield* git(work, "commit", "--quiet", "-m", "Start");

    const hub = makeHub();
    const teamsOf = (who: string) => Effect.provide(StudioTeams.StudioTeams, studioFor(hub, who));
    const amy = yield* teamsOf(AMY);
    const dana = yield* teamsOf(DANA);
    const vic = yield* teamsOf(VIC);
    const viewerFolder = (projectId: string) =>
      Effect.gen(function* () {
        const folder = path.join(root, "vic", "review");
        yield* fileSystem.makeDirectory(folder, { recursive: true }).pipe(Effect.orDie);
        yield* git(folder, "init", "--quiet");
        yield* git(folder, "config", "studio.team.project", projectId);
        return folder;
      });
    return yield* body({ amy, dana, vic, hub, root, work, git, write, read, viewerFolder });
  });

it.layer(NodeServices.layer)("StudioTeams", (it) => {
  it.effect("a project shared by one person is got, checked out and checked in by another", () =>
    withTeam(({ amy, dana, root, work, write, read, git }) =>
      Effect.gen(function* () {
        const shared = yield* amy.share({ cwd: work, teamId: TEAM, name: "Bracket" });
        assert.strictEqual(shared?.project.version, 1);
        assert.strictEqual(shared?.project.checkedOutBy, null);

        const got = yield* dana.get({ projectId: shared!.project.id, root: `${root}/dana` });
        assert.strictEqual(yield* read(got.folder, "part.py"), "wall = 3\n");

        const out = yield* dana.checkOut({ cwd: got.folder });
        assert.isTrue(out?.mine);
        yield* write(got.folder, "part.py", "wall = 4\n");
        const back = yield* dana.checkIn({ cwd: got.folder, note: "Thicker wall", keep: false });
        assert.strictEqual(back?.project.version, 2);
        assert.strictEqual(back?.checkIns[0]?.note, "Thicker wall");
        assert.strictEqual(back?.checkIns[0]?.by, DANA);
        // The check-in is Dana's commit, so history says who made the Version.
        assert.strictEqual(
          yield* git(got.folder, "log", "-1", "--format=%ae %s"),
          `${DANA} Thicker wall`,
        );

        const behind = yield* amy.folderStatus({ cwd: work });
        assert.strictEqual(behind?.localVersion, 1);
        assert.strictEqual(behind?.project.version, 2);
        const latest = yield* amy.getLatest({ cwd: work });
        assert.strictEqual(latest?.localVersion, 2);
        assert.isFalse(latest?.changesHere);
        assert.strictEqual(yield* read(work, "part.py"), "wall = 4\n");
      }),
    ),
  );

  it.effect("only the person holding the check-out can check in", () =>
    withTeam(({ amy, dana, root, work }) =>
      Effect.gen(function* () {
        const shared = yield* amy.share({ cwd: work, teamId: TEAM, name: "Bracket" });
        const got = yield* dana.get({ projectId: shared!.project.id, root: `${root}/dana` });
        yield* dana.checkOut({ cwd: got.folder });
        const refused = yield* amy.checkOut({ cwd: work }).pipe(Effect.flip);
        assert.strictEqual(refused.reason, "checked-out");
        assert.strictEqual(refused.by, DANA);
        const notHers = yield* amy.checkIn({ cwd: work, note: "", keep: false }).pipe(Effect.flip);
        assert.strictEqual(notHers.reason, "checked-out");
        // An Admin takes it back, and then may check it out.
        yield* amy.release({ cwd: work });
        const mine = yield* amy.checkOut({ cwd: work });
        assert.isTrue(mine?.mine);
      }),
    ),
  );

  it.effect("Get latest keeps work that is not checked in", () =>
    withTeam(({ amy, dana, root, work, write, read }) =>
      Effect.gen(function* () {
        const shared = yield* amy.share({ cwd: work, teamId: TEAM, name: "Bracket" });
        const got = yield* dana.get({ projectId: shared!.project.id, root: `${root}/dana` });
        yield* dana.checkOut({ cwd: got.folder });
        yield* write(got.folder, "part.py", "wall = 5\n");
        yield* dana.checkIn({ cwd: got.folder, note: "", keep: false });

        yield* write(work, "part.py", "wall = 9\n");
        const refused = yield* amy.getLatest({ cwd: work }).pipe(Effect.flip);
        assert.strictEqual(refused.reason, "changes-here");
        assert.strictEqual(yield* read(work, "part.py"), "wall = 9\n");
        const status = yield* amy.folderStatus({ cwd: work });
        assert.isTrue(status?.changesHere);
      }),
    ),
  );

  it.effect("a folder whose team project is gone can be shared again", () =>
    withTeam(({ amy, hub, work }) =>
      Effect.gen(function* () {
        const first = yield* amy.share({ cwd: work, teamId: TEAM, name: "Bracket" });
        const twice = yield* amy
          .share({ cwd: work, teamId: TEAM, name: "Bracket" })
          .pipe(Effect.flip);
        assert.strictEqual(twice.reason, "not-allowed");

        hub.projects.delete(first!.project.id);
        const gone = yield* amy.folderStatus({ cwd: work }).pipe(Effect.flip);
        assert.strictEqual(gone.reason, "not-found");
        const again = yield* amy.share({ cwd: work, teamId: TEAM, name: "Bracket" });
        assert.notStrictEqual(again?.project.id, first?.project.id);
        assert.strictEqual(again?.localVersion, 1);
      }),
    ),
  );

  it.effect("a sign-in the hub no longer knows signs the person out", () =>
    Effect.gen(function* () {
      const stale = yield* Effect.provide(StudioTeams.StudioTeams, studioFor(makeHub(), AMY, 1));
      const status = yield* stale.status;
      assert.deepStrictEqual(status, {
        available: true,
        account: null,
        teams: [],
        reviewPage: null,
      });
      const again = yield* stale.status;
      assert.strictEqual(again.account, null);
    }),
  );

  it.effect("a Version is reviewed, approved by everyone asked, and released as Rev A", () =>
    withTeam(({ amy, dana, vic, root, work, write, viewerFolder }) =>
      Effect.gen(function* () {
        const shared = yield* amy.share({ cwd: work, teamId: TEAM, name: "Bracket" });
        const got = yield* dana.get({ projectId: shared!.project.id, root: `${root}/dana` });
        const seen = { folder: yield* viewerFolder(shared!.project.id) };
        yield* dana.checkOut({ cwd: got.folder });
        yield* write(got.folder, "part.py", "wall = 5\n");
        const asked = yield* dana.checkIn({
          cwd: got.folder,
          note: "Thicker wall",
          keep: false,
          reviewers: [AMY, VIC],
        });
        assert.strictEqual(asked?.review?.status, "review");
        assert.deepStrictEqual(
          asked?.review?.people.map((p) => p.email),
          [AMY, VIC],
        );

        const commented = yield* vic.reviewComment({ cwd: seen.folder, body: "Holes too tight" });
        assert.strictEqual(commented?.review?.comments[0]?.by, VIC);
        const early = yield* amy.releaseVersion({ cwd: work }).pipe(Effect.flip);
        assert.strictEqual(
          early.message,
          "Every reviewer has to approve it before it is released.",
        );

        yield* amy.reviewDecide({ cwd: work, decision: "approved" });
        const changes = yield* vic.reviewDecide({ cwd: seen.folder, decision: "changes" });
        assert.strictEqual(changes?.review?.status, "changes");
        const approved = yield* vic.reviewDecide({ cwd: seen.folder, decision: "approved" });
        assert.strictEqual(approved?.review?.status, "approved");

        const notAdmin = yield* dana.releaseVersion({ cwd: got.folder }).pipe(Effect.flip);
        assert.strictEqual(notAdmin.reason, "not-allowed");
        const released = yield* amy.releaseVersion({ cwd: work });
        assert.strictEqual(released?.review?.status, "released");
        assert.strictEqual(released?.review?.releasedRev, "A");
        assert.strictEqual(released?.checkIns[0]?.releasedRev, "A");
      }),
    ),
  );

  it.effect("a new Version answers the last review's comments and sends its model along", () =>
    withTeam(({ amy, dana, vic, hub, root, work, write, git, viewerFolder }) =>
      Effect.gen(function* () {
        yield* write(work, "part.stl", "solid part\n");
        yield* git(work, "add", "--all");
        yield* git(work, "commit", "--quiet", "-m", "Model");
        const shared = yield* amy.share({ cwd: work, teamId: TEAM, name: "Bracket" });
        const got = yield* dana.get({ projectId: shared!.project.id, root: `${root}/dana` });
        const seen = { folder: yield* viewerFolder(shared!.project.id) };
        yield* dana.checkOut({ cwd: got.folder });
        yield* write(got.folder, "part.py", "wall = 5\n");
        yield* dana.checkIn({ cwd: got.folder, note: "Wall", keep: false, reviewers: [VIC] });
        assert.deepStrictEqual(
          hub.versionFiles.map((file) => `${file.version}:${file.path}`),
          ["1:part.stl", "2:part.stl"],
        );
        assert.isTrue([...hub.files.keys()].some((key) => key.endsWith("/v2/part.stl")));

        const asked = yield* vic.reviewComment({ cwd: seen.folder, body: "Fillet the corner" });
        const comment = asked!.review!.comments[0]!;
        assert.isFalse(comment.agentSees);
        yield* vic.reviewDecide({ cwd: seen.folder, decision: "changes" });
        // In the hub, someone presses Fix this on it: it comes to the desktop as the fix queue.
        const queued = hub.comments().find((each) => each.id === comment.id)!;
        Object.assign(queued, { agent_sees: true, fix_by: AMY, fix_at: "2026-11-23T12:30:00Z" });
        const waiting = yield* dana.folderStatus({ cwd: got.folder });
        assert.deepStrictEqual(
          waiting!.fixQueue.map((each) => [each.id, each.body, each.queuedBy]),
          [[comment.id, "Fillet the corner", AMY]],
        );

        yield* dana.checkOut({ cwd: got.folder });
        yield* write(got.folder, "part.py", "wall = 5\nfillet = 2\n");
        const fixed = yield* dana.checkIn({
          cwd: got.folder,
          note: "Review fixes: fillet",
          keep: false,
          reviewers: [VIC],
          answers: [{ comment: comment.id, reply: "Done: 2 mm fillet" }],
        });
        assert.strictEqual(fixed?.project.version, 3);
        assert.strictEqual(fixed?.review?.status, "review");
        assert.deepStrictEqual(fixed?.fixQueue, []);
        const answered = fixed!.previousReview!.comments;
        assert.strictEqual(answered[0]?.resolvedIn, 3);
        assert.strictEqual(answered[1]?.replyTo, comment.id);
        assert.strictEqual(answered[1]?.by, DANA);
        assert.deepStrictEqual(
          fixed!.activity.slice(0, 4).map((event) => event.kind),
          ["comment", "review-asked", "check-in", "changes"],
        );
      }),
    ),
  );

  it.effect("a Viewer gets no copy of the project's scripts or history", () =>
    withTeam(({ amy, vic, hub, root, work, viewerFolder }) =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const shared = yield* amy.share({ cwd: work, teamId: TEAM, name: "Bracket" });
        const refused = yield* vic
          .get({ projectId: shared!.project.id, root: `${root}/vic` })
          .pipe(Effect.flip);
        assert.strictEqual(refused.reason, "not-allowed");
        assert.include(refused.message, "review page");
        assert.isFalse(yield* fileSystem.exists(`${root}/vic`));
        // Even a folder linked to the project by hand gets nothing from the hub.
        const linked = yield* viewerFolder(shared!.project.id);
        hub.projects.get(shared!.project.id)!.version = 2;
        const behind = yield* vic.getLatest({ cwd: linked }).pipe(Effect.flip);
        assert.strictEqual(behind.reason, "not-allowed");
        const status = yield* vic.folderStatus({ cwd: linked });
        assert.strictEqual(status?.role, "viewer");
        const out = yield* vic.checkOut({ cwd: linked }).pipe(Effect.flip);
        assert.strictEqual(out.reason, "not-allowed");
      }),
    ),
  );

  it.effect("a check-in replaces the last bundle, and one the hub refuses is not left behind", () =>
    withTeam(({ amy, dana, hub, root, work, write }) =>
      Effect.gen(function* () {
        const shared = yield* amy.share({ cwd: work, teamId: TEAM, name: "Bracket" });
        const bundles = () => [...hub.files.keys()].filter((name) => name.endsWith(".bundle"));
        const first = bundles();
        assert.strictEqual(first.length, 1);
        const got = yield* dana.get({ projectId: shared!.project.id, root: `${root}/dana` });
        yield* dana.checkOut({ cwd: got.folder });
        yield* write(got.folder, "part.py", "wall = 4\n");
        yield* dana.checkIn({ cwd: got.folder, note: "", keep: true });
        // Amy uploaded Version 1's bundle; Dana's Version 2 carries all of it and replaces it.
        const second = bundles();
        assert.strictEqual(second.length, 1);
        assert.notStrictEqual(second[0], first[0]);
        assert.strictEqual(second[0], hub.projects.get(shared!.project.id)!.bundle);

        hub.limit.bytes = 1;
        yield* write(got.folder, "part.py", "wall = 5\n");
        const full = yield* dana
          .checkIn({ cwd: got.folder, note: "", keep: false })
          .pipe(Effect.flip);
        assert.strictEqual(full.reason, "storage-full");
        assert.include(full.message, "bigger plan");
        assert.deepStrictEqual(bundles(), second);
        assert.strictEqual(hub.projects.get(shared!.project.id)!.version, 2);
      }),
    ),
  );

  it.effect("an Admin deletes a team project with its files; nobody else can", () =>
    withTeam(({ amy, dana, hub, root, work }) =>
      Effect.gen(function* () {
        const shared = yield* amy.share({ cwd: work, teamId: TEAM, name: "Bracket" });
        const id = shared!.project.id;
        const got = yield* dana.get({ projectId: id, root: `${root}/dana` });
        const refused = yield* dana.deleteProject({ projectId: id }).pipe(Effect.flip);
        assert.strictEqual(refused.reason, "not-allowed");
        assert.isTrue(hub.projects.has(id));

        const left = yield* amy.deleteProject({ projectId: id });
        assert.deepStrictEqual(left.projects, []);
        assert.isFalse(hub.projects.has(id));
        assert.deepStrictEqual([...hub.files.keys()], []);
        // Copies on computers stay, and say the project left the team.
        const gone = yield* dana.folderStatus({ cwd: got.folder }).pipe(Effect.flip);
        assert.strictEqual(gone.reason, "not-found");
      }),
    ),
  );

  it.effect("the only Admin of a team with people cannot delete their account", () =>
    withTeam(({ amy }) =>
      Effect.gen(function* () {
        const refused = yield* amy.deleteAccount.pipe(Effect.flip);
        assert.strictEqual(refused.reason, "last-admin");
        assert.include(refused.message, "Bracket Co");
      }),
    ),
  );
});
