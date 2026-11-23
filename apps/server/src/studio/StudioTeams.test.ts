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
  checkIns: Array<{ version: number; by_email: string; note: string | null; at: string }>;
}

/**
 * The team hub's HTTP surface as `infra/teams` serves it (PostgREST functions and tables, Storage),
 * kept in memory, with the same refusals its SQL functions raise. Each person's calls carry their
 * own bearer token, `token:<email>`.
 */
const makeHub = () => {
  const projects = new Map<string, HubProject>();
  const files = new Map<string, Uint8Array>();
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
    bundle: p.bundle,
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
      };
    const route = url.pathname;
    if (route.startsWith("/storage/v1/object/authenticated/projects/")) {
      const file = files.get(route.slice("/storage/v1/object/authenticated/projects/".length));
      return file === undefined ? { status: 404, body: "{}" } : { status: 200, body: file };
    }
    if (route.startsWith("/storage/v1/object/projects/")) {
      if (role === "viewer") return { status: 403, body: "{}" };
      files.set(route.slice("/storage/v1/object/projects/".length), bytes);
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
          },
        ]);
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
        p.version += 1;
        p.head = args.p_head;
        p.bundle = args.p_bundle;
        p.holder = args.p_keep ? who : null;
        p.checkIns.push({
          version: p.version,
          by_email: who,
          note: args.p_note === "" ? null : args.p_note,
          at: "2026-11-23T10:00:00Z",
        });
        return ok(p.version);
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

  return { projects, client };
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
    return yield* body({ amy, dana, vic, hub, root, work, git, write, read });
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
      assert.deepStrictEqual(status, { available: true, account: null, teams: [] });
      const again = yield* stale.status;
      assert.strictEqual(again.account, null);
    }),
  );

  it.effect("a Viewer gets the project but cannot check it out", () =>
    withTeam(({ amy, vic, root, work }) =>
      Effect.gen(function* () {
        const shared = yield* amy.share({ cwd: work, teamId: TEAM, name: "Bracket" });
        const got = yield* vic.get({ projectId: shared!.project.id, root: `${root}/vic` });
        const refused = yield* vic.checkOut({ cwd: got.folder }).pipe(Effect.flip);
        assert.strictEqual(refused.reason, "not-allowed");
        const status = yield* vic.folderStatus({ cwd: got.folder });
        assert.strictEqual(status?.role, "viewer");
      }),
    ),
  );
});
