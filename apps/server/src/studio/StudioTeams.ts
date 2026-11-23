/**
 * Studio Teams on the team hub (`infra/teams`, a Supabase project): one person checks a project out,
 * then checks it in as one git bundle, which the hub's `check_in` takes only from the holder and on
 * top of the Version they started from. The sign-in stays on this server.
 */
import {
  STUDIO_BACKUP_BRIEF_FILE,
  StudioProjectBrief,
  type StudioTeam,
  type StudioTeamCheckIn,
  type StudioTeamProject,
  type StudioTeamsCheckInInput,
  type StudioTeamsCreateInput,
  StudioTeamsError,
  type StudioTeamsFolderInput,
  type StudioTeamsFolderStatusResult,
  type StudioTeamsGetInput,
  type StudioTeamsGetResult,
  type StudioTeamsInviteInput,
  type StudioTeamsProjectsResult,
  type StudioTeamsRemoveInput,
  type StudioTeamsShareInput,
  type StudioTeamsSignInCheckInput,
  type StudioTeamsSignInStartInput,
  type StudioTeamsStatusResult,
} from "@t3tools/contracts";
import { newProjectFolderName } from "@t3tools/shared/path";
import { fromLenientJson } from "@t3tools/shared/schemaJson";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as SecureRandom from "effect/crypto/SecureRandom";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest } from "effect/http";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import { CHECKPOINT_REFS_PREFIX } from "../orchestration-v2/CheckpointService.ts";
import * as ProcessRunner from "../processRunner.ts";
import * as StudioSync from "./StudioSync.ts";

const SESSION_SECRET = "studio-teams-session";
/** The project's place on its team, in the folder's own git config. */
const PROJECT_KEY = "studio.team.project";
const VERSION_KEY = "studio.team.version";
/** Where a check-in's history is named inside its bundle, and where a fetched one lands. */
const BUNDLE_HEAD = "refs/studio/team/head";
const LATEST = "refs/studio/team/latest";
const KEPT_REFS_PREFIX = "refs/studio/kept";
const BUCKET = "projects";
const REQUEST_TIMEOUT = "30 seconds";
const TRANSFER_TIMEOUT = "2 hours";
const MAX_FOLDER_ATTEMPTS = 100;
const SHOWN_CHECK_INS = 20;
/** Refresh a sign-in this long before it runs out. */
const REFRESH_MARGIN_SECONDS = 120;

const Session = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.String,
  expiresAt: Schema.Number,
  email: Schema.String,
});
type Session = typeof Session.Type;
const decodeSession = Schema.decodeUnknownOption(fromLenientJson(Session));

const AuthBody = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  expires_in: Schema.Number,
  user: Schema.Struct({ email: Schema.optional(Schema.String) }),
});

const ProjectRow = Schema.Struct({
  id: Schema.String,
  team_id: Schema.String,
  name: Schema.String,
  version: Schema.Number,
  head: Schema.NullOr(Schema.String),
  bundle: Schema.NullOr(Schema.String),
  checked_out_email: Schema.NullOr(Schema.String),
  updated_at: Schema.String,
  teams: Schema.Struct({ name: Schema.String }),
});
type ProjectRow = typeof ProjectRow.Type;
const PROJECT_COLUMNS =
  "id,team_id,name,version,head,bundle,checked_out_email,updated_at,teams(name)";

const CheckInRow = Schema.Struct({
  version: Schema.Number,
  by_email: Schema.String,
  note: Schema.NullOr(Schema.String),
  at: Schema.String,
});

const TeamsBody = Schema.Array(
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    seats: Schema.Number,
    role: Schema.Literals(["admin", "editor", "viewer"]),
    members: Schema.NullOr(
      Schema.Array(
        Schema.Struct({
          email: Schema.String,
          role: Schema.Literals(["admin", "editor", "viewer"]),
        }),
      ),
    ),
    invites: Schema.Array(
      Schema.Struct({ email: Schema.String, role: Schema.Literals(["admin", "editor", "viewer"]) }),
    ),
  }),
);

/** A refusal from one of the hub's functions: the reason is the exception's message. */
/** Supabase Auth's answers, given as a 400 rather than a 401, for a sign-in it no longer has. */
const SIGN_IN_GONE = new Set([
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_not_found",
  "session_expired",
  "user_not_found",
  "bad_jwt",
]);

const HubRefusal = Schema.Struct({
  message: Schema.optional(Schema.String),
  details: Schema.optional(Schema.NullOr(Schema.String)),
  error_code: Schema.optional(Schema.String),
  msg: Schema.optional(Schema.String),
});

const decodeBrief = Schema.decodeEffect(fromLenientJson(StudioProjectBrief));

const fail = (reason: StudioTeamsError["reason"], message: string, by?: string) =>
  new StudioTeamsError({ reason, message, ...(by === undefined ? {} : { by }) });

const unreachable = () => fail("hub", "The team hub could not be reached. Try again.");
const notChecked = (cwd: string) =>
  fail("local", `Studio could not read the project's history in ${cwd}.`);

/** The person's words for each refusal the hub's functions raise. */
const refusal = (message: string, details: string | null | undefined) => {
  switch (message) {
    case "checked-out":
      return fail(
        "checked-out",
        details ? `${details} has it checked out.` : "Check it out first.",
        details ?? undefined,
      );
    case "changed-elsewhere":
      return fail("changed-elsewhere", "A newer Version was checked in. Get latest first.");
    case "not-allowed":
      return fail("not-allowed", "Your role on this team does not allow that.");
    case "seats-full":
      return fail(
        "seats-full",
        `All ${details ?? ""} paid seats are taken. Invite them as a Viewer, or free a seat.`.replace(
          "All  paid",
          "All paid",
        ),
      );
    case "last-admin":
      return fail("last-admin", "A team needs at least one Admin.");
    case "not-found":
      return fail("not-found", "This project is no longer on the team.");
    default:
      return fail("hub", "The team hub refused that. Try again.");
  }
};

export class StudioTeams extends Context.Service<
  StudioTeams,
  {
    readonly status: Effect.Effect<StudioTeamsStatusResult, StudioTeamsError>;
    /** Emails a sign-in code. Anyone may sign in; a team is what they are invited to. */
    readonly signInStart: (
      input: StudioTeamsSignInStartInput,
    ) => Effect.Effect<void, StudioTeamsError>;
    /** Checks the code, keeps the sign-in here, and joins every team that invited this email. */
    readonly signInCheck: (
      input: StudioTeamsSignInCheckInput,
    ) => Effect.Effect<StudioTeamsStatusResult, StudioTeamsError>;
    readonly signOut: Effect.Effect<void, StudioTeamsError>;
    readonly create: (
      input: StudioTeamsCreateInput,
    ) => Effect.Effect<StudioTeamsStatusResult, StudioTeamsError>;
    readonly invite: (
      input: StudioTeamsInviteInput,
    ) => Effect.Effect<StudioTeamsStatusResult, StudioTeamsError>;
    readonly remove: (
      input: StudioTeamsRemoveInput,
    ) => Effect.Effect<StudioTeamsStatusResult, StudioTeamsError>;
    readonly projects: Effect.Effect<StudioTeamsProjectsResult, StudioTeamsError>;
    /** Makes the folder a team project and checks it in as Version 1. */
    readonly share: (
      input: StudioTeamsShareInput,
    ) => Effect.Effect<StudioTeamsFolderStatusResult, StudioTeamsError>;
    /** Brings a team project's latest Version into a new folder under `root`. */
    readonly get: (
      input: StudioTeamsGetInput & { readonly root: string },
    ) => Effect.Effect<StudioTeamsGetResult, StudioTeamsError>;
    readonly folderStatus: (
      input: StudioTeamsFolderInput,
    ) => Effect.Effect<StudioTeamsFolderStatusResult, StudioTeamsError>;
    /** Gets the latest Version first when this folder is behind and has nothing of its own. */
    readonly checkOut: (
      input: StudioTeamsFolderInput,
    ) => Effect.Effect<StudioTeamsFolderStatusResult, StudioTeamsError>;
    readonly checkIn: (
      input: StudioTeamsCheckInInput,
    ) => Effect.Effect<StudioTeamsFolderStatusResult, StudioTeamsError>;
    /** Brings the latest Version into this folder; refused while work here is not checked in. */
    readonly getLatest: (
      input: StudioTeamsFolderInput,
    ) => Effect.Effect<StudioTeamsFolderStatusResult, StudioTeamsError>;
    /** Lets a check-out go without checking in; the work stays in this folder. */
    readonly release: (
      input: StudioTeamsFolderInput,
    ) => Effect.Effect<StudioTeamsFolderStatusResult, StudioTeamsError>;
  }
>()("t3/studio/StudioTeams") {}

/** The hub this build talks to: `STUDIO_TEAMS_URL` and its public key, `STUDIO_TEAMS_KEY`. */
const hubConfig = Effect.all({
  url: Config.String("STUDIO_TEAMS_URL").pipe(Config.withDefault("")),
  key: Config.String("STUDIO_TEAMS_KEY").pipe(Config.withDefault("")),
}).pipe(
  Effect.map(({ url, key }) => ({ url: url.trim().replace(/\/+$/, ""), key: key.trim() })),
  Effect.orElseSucceed(() => ({ url: "", key: "" })),
);

const make = Effect.gen(function* () {
  const hub = yield* hubConfig;
  const httpClient = yield* HttpClient.HttpClient;
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const processRunner = yield* ProcessRunner.ProcessRunner;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const sync = yield* StudioSync.StudioSync;
  const random = yield* SecureRandom.SecureRandom;
  const available = hub.url !== "" && hub.key !== "";

  const readSession = secrets.get(SESSION_SECRET).pipe(
    Effect.map(Option.flatMap((bytes) => decodeSession(new TextDecoder().decode(bytes)))),
    Effect.orElseSucceed(() => Option.none<Session>()),
  );
  const saveSession = (session: Session) =>
    secrets
      .set(SESSION_SECRET, new TextEncoder().encode(JSON.stringify(session)))
      .pipe(
        Effect.mapError(() =>
          fail("local", "Signed in, but the sign-in could not be saved on this computer."),
        ),
      );
  const forgetSession = secrets.remove(SESSION_SECRET).pipe(Effect.ignore);

  type Call = {
    readonly method: "GET" | "POST";
    readonly path: string;
    readonly token?: string;
    readonly json?: unknown;
    readonly bytes?: Uint8Array;
    readonly timeout?: Duration.Input;
  };

  const send = Effect.fn("StudioTeams.send")(function* (call: Call) {
    if (!available) return yield* fail("unavailable", "This Studio has no team hub.");
    let request = HttpClientRequest.make(call.method)(`${hub.url}${call.path}`).pipe(
      HttpClientRequest.setHeader("apikey", hub.key),
    );
    if (call.token !== undefined) {
      request = HttpClientRequest.bearerToken(request, call.token);
    }
    if (call.json !== undefined) request = HttpClientRequest.bodyJsonUnsafe(request, call.json);
    if (call.bytes !== undefined) {
      request = HttpClientRequest.bodyUint8Array(request, call.bytes, "application/octet-stream");
    }
    const response = yield* httpClient
      .execute(request)
      .pipe(Effect.timeout(call.timeout ?? REQUEST_TIMEOUT), Effect.mapError(unreachable));
    return response;
  });

  /** The response body as JSON when the hub said yes, or the reason it refused. */
  const jsonOf = Effect.fn("StudioTeams.jsonOf")(function* <A, I>(
    call: Call,
    schema: Schema.Codec<A, I>,
  ) {
    const response = yield* send(call);
    const text = yield* response.text.pipe(Effect.mapError(unreachable));
    if (response.status === 401) {
      yield* forgetSession;
      return yield* fail("signed-out", "Sign in to your team again.");
    }
    if (response.status >= 400) {
      const body = Schema.decodeOption(fromLenientJson(HubRefusal))(text);
      const refused = Option.getOrUndefined(body);
      const code = refused?.error_code;
      if (code !== undefined && SIGN_IN_GONE.has(code)) {
        yield* forgetSession;
        return yield* fail("signed-out", "Sign in to your team again.");
      }
      if (code === "otp_expired" || code === "invalid_credentials") {
        return yield* fail("code", "That code is wrong or has run out. Ask for a new one.");
      }
      if (code === "over_email_send_rate_limit") {
        return yield* fail("hub", "A code was just sent. Wait a minute, then ask again.");
      }
      return yield* refusal(refused?.message ?? "", refused?.details);
    }
    return yield* Schema.decodeEffect(fromLenientJson(schema))(text === "" ? "null" : text).pipe(
      Effect.mapError(() => fail("hub", "The team hub answered in a way Studio did not expect.")),
    );
  });

  /** The sign-in, refreshed when it is close to running out. */
  const session = Effect.gen(function* () {
    if (!available) return yield* fail("unavailable", "This Studio has no team hub.");
    const current = yield* readSession;
    if (Option.isNone(current)) return yield* fail("signed-out", "Sign in to your team first.");
    const now = Math.floor((yield* Clock.currentTimeMillis) / 1000);
    if (current.value.expiresAt - REFRESH_MARGIN_SECONDS > now) return current.value;
    const body = yield* jsonOf(
      {
        method: "POST",
        path: "/auth/v1/token?grant_type=refresh_token",
        json: { refresh_token: current.value.refreshToken },
      },
      AuthBody,
    ).pipe(
      Effect.catchTags({
        StudioTeamsError: (error) =>
          error.reason === "hub" || error.reason === "unavailable"
            ? Effect.fail(error)
            : forgetSession.pipe(
                Effect.andThen(Effect.fail(fail("signed-out", "Sign in to your team again."))),
              ),
      }),
    );
    const next = {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: now + body.expires_in,
      email: current.value.email,
    };
    yield* saveSession(next);
    return next;
  });

  const rpc = <A, I>(fn: string, args: Record<string, unknown>, schema: Schema.Codec<A, I>) =>
    session.pipe(
      Effect.flatMap((s) =>
        jsonOf(
          { method: "POST", path: `/rest/v1/rpc/${fn}`, token: s.accessToken, json: args },
          schema,
        ),
      ),
    );

  const select = <A, I>(query: string, schema: Schema.Codec<A, I>) =>
    session.pipe(
      Effect.flatMap((s) =>
        jsonOf({ method: "GET", path: `/rest/v1/${query}`, token: s.accessToken }, schema),
      ),
    );

  const status: StudioTeams["Service"]["status"] = Effect.gen(function* () {
    if (!available) return { available: false, account: null, teams: [] };
    const current = yield* readSession;
    if (Option.isNone(current)) return { available: true, account: null, teams: [] };
    // An invite sent after this person signed in joins them here, not only at their next sign-in.
    const teams = yield* rpc("accept_invites", {}, Schema.Unknown).pipe(
      Effect.andThen(rpc("my_teams", {}, TeamsBody)),
      Effect.catchTags({
        StudioTeamsError: (error) =>
          error.reason === "signed-out" ? Effect.succeed(null) : Effect.fail(error),
      }),
    );
    if (teams === null) return { available: true, account: null, teams: [] };
    return {
      available: true,
      account: current.value.email,
      teams: teams.map((team): StudioTeam => ({
        ...team,
        members: team.members ?? [],
        invites: team.invites,
      })),
    };
  }).pipe(Effect.withSpan("StudioTeams.status"));

  const signInStart: StudioTeams["Service"]["signInStart"] = Effect.fn("StudioTeams.signInStart")(
    function* ({ email }) {
      yield* jsonOf(
        {
          method: "POST",
          path: "/auth/v1/otp",
          json: { email: email.toLowerCase(), create_user: true },
        },
        Schema.Unknown,
      );
    },
  );

  const signInCheck: StudioTeams["Service"]["signInCheck"] = Effect.fn("StudioTeams.signInCheck")(
    function* ({ email, code }) {
      const body = yield* jsonOf(
        {
          method: "POST",
          path: "/auth/v1/verify",
          json: { type: "email", email: email.toLowerCase(), token: code.replace(/\s+/g, "") },
        },
        AuthBody,
      ).pipe(
        Effect.catchTags({
          StudioTeamsError: (error) =>
            error.reason === "hub" && error.message.startsWith("The team hub refused")
              ? Effect.fail(fail("code", "That code is wrong or has run out. Ask for a new one."))
              : Effect.fail(error),
        }),
      );
      yield* saveSession({
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        expiresAt: Math.floor((yield* Clock.currentTimeMillis) / 1000) + body.expires_in,
        email: body.user.email ?? email.toLowerCase(),
      });
      return yield* status;
    },
  );

  const signOut: StudioTeams["Service"]["signOut"] = forgetSession.pipe(
    Effect.withSpan("StudioTeams.signOut"),
  );

  const create: StudioTeams["Service"]["create"] = Effect.fn("StudioTeams.create")(function* ({
    name,
  }) {
    yield* rpc("create_team", { p_name: name }, Schema.Unknown);
    return yield* status;
  });

  const invite: StudioTeams["Service"]["invite"] = Effect.fn("StudioTeams.invite")(
    function* (input) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
        return yield* fail("not-allowed", "That is not an email address.");
      }
      yield* rpc(
        "invite_member",
        { p_team: input.teamId, p_email: input.email, p_role: input.role },
        Schema.Unknown,
      );
      return yield* status;
    },
  );

  const remove: StudioTeams["Service"]["remove"] = Effect.fn("StudioTeams.remove")(
    function* (input) {
      yield* rpc("remove_member", { p_team: input.teamId, p_email: input.email }, Schema.Unknown);
      return yield* status;
    },
  );

  const projectOf = (row: ProjectRow): StudioTeamProject => ({
    id: row.id,
    teamId: row.team_id,
    teamName: row.teams.name,
    name: row.name,
    version: row.version,
    checkedOutBy: row.checked_out_email,
    updatedAt: row.updated_at,
  });

  const projects: StudioTeams["Service"]["projects"] = select(
    `team_projects?select=${PROJECT_COLUMNS}&order=updated_at.desc`,
    Schema.Array(ProjectRow),
  ).pipe(
    Effect.map((rows) => ({ projects: rows.map(projectOf) })),
    Effect.withSpan("StudioTeams.projects"),
  );

  const projectRow = (id: string) =>
    select(
      `team_projects?select=${PROJECT_COLUMNS}&id=eq.${encodeURIComponent(id)}`,
      Schema.Array(ProjectRow),
    ).pipe(
      Effect.flatMap((rows) =>
        rows[0] === undefined
          ? Effect.fail(fail("not-found", "This project is no longer on the team, or you are not."))
          : Effect.succeed(rows[0]),
      ),
    );

  const checkInsOf = (id: string) =>
    select(
      `team_project_versions?select=version,by_email,note,at&project_id=eq.${encodeURIComponent(id)}&order=version.desc&limit=${SHOWN_CHECK_INS}`,
      Schema.Array(CheckInRow),
    ).pipe(
      Effect.map((rows) =>
        rows.map((row): StudioTeamCheckIn => ({
          version: row.version,
          by: row.by_email,
          note: row.note,
          at: row.at,
        })),
      ),
    );

  const roleOn = (teamId: string) =>
    rpc("my_teams", {}, TeamsBody).pipe(
      Effect.map((teams) => teams.find((team) => team.id === teamId)?.role ?? "viewer"),
    );

  const runGit = (cwd: string, args: ReadonlyArray<string>, timeout?: Duration.Input) =>
    processRunner
      .run({
        command: "git",
        args: ["-C", cwd, ...args],
        env: { LC_ALL: "C", GIT_TERMINAL_PROMPT: "0" },
        timeout: timeout ?? "60 seconds",
        timeoutBehavior: "timedOutResult",
        maxOutputBytes: 16 * 1024 * 1024,
      })
      .pipe(Effect.mapError(() => notChecked(cwd)));

  const git = (cwd: string, args: ReadonlyArray<string>, timeout?: Duration.Input) =>
    runGit(cwd, args, timeout).pipe(
      Effect.flatMap((result) =>
        result.code === 0 ? Effect.succeed(result.stdout.trim()) : Effect.fail(notChecked(cwd)),
      ),
    );

  const gitValue = (cwd: string, args: ReadonlyArray<string>) =>
    runGit(cwd, args).pipe(
      Effect.map((result) => (result.code === 0 ? result.stdout.trim() : "")),
      Effect.map((output) => (output === "" ? undefined : output)),
    );

  const placeOf = (cwd: string) =>
    Effect.all({
      project: gitValue(cwd, ["config", "--get", PROJECT_KEY]),
      version: gitValue(cwd, ["config", "--get", VERSION_KEY]).pipe(
        Effect.map((value) => Number(value ?? "0") || 0),
      ),
    }).pipe(Effect.orElseSucceed(() => ({ project: undefined, version: 0 })));

  const headOf = (cwd: string) => gitValue(cwd, ["rev-parse", "--verify", "--quiet", "HEAD"]);

  const isDirty = (cwd: string) =>
    git(cwd, ["status", "--porcelain", "--ignore-submodules=dirty"]).pipe(
      Effect.map((out) => out !== ""),
    );

  /** Work here that the hub does not have: changed files, or a commit past its latest. */
  const changesHere = Effect.fn("StudioTeams.changesHere")(function* (
    cwd: string,
    row: ProjectRow,
    localVersion: number,
  ) {
    if (yield* isDirty(cwd)) return true;
    const head = yield* headOf(cwd);
    return head !== undefined && head !== row.head && localVersion === row.version;
  });

  /** One bundle of the folder's history: its current line, its checkpoints and kept Versions. */
  const bundleOf = Effect.fn("StudioTeams.bundleOf")(function* (cwd: string, into: string) {
    yield* git(cwd, ["update-ref", BUNDLE_HEAD, "HEAD"]);
    yield* git(
      cwd,
      [
        "bundle",
        "create",
        "--quiet",
        into,
        BUNDLE_HEAD,
        `--glob=${CHECKPOINT_REFS_PREFIX}/*`,
        `--glob=${KEPT_REFS_PREFIX}/*`,
      ],
      TRANSFER_TIMEOUT,
    );
    return yield* fileSystem.readFile(into).pipe(Effect.mapError(() => notChecked(cwd)));
  });

  /** Downloads a check-in's bundle and takes its refs into the folder, the latest at `LATEST`. */
  const fetchBundle = (cwd: string, bundle: string) =>
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* session;
        const response = yield* send({
          method: "GET",
          path: `/storage/v1/object/authenticated/${BUCKET}/${bundle}`,
          token: s.accessToken,
          timeout: TRANSFER_TIMEOUT,
        });
        if (response.status >= 400) {
          return yield* fail("hub", "The project's latest Version could not be downloaded.");
        }
        const bytes = yield* response.arrayBuffer.pipe(Effect.mapError(unreachable));
        const dir = yield* fileSystem
          .makeTempDirectoryScoped({ prefix: "studio-team-" })
          .pipe(Effect.mapError(() => notChecked(cwd)));
        const file = path.join(dir, "check-in.bundle");
        yield* fileSystem
          .writeFile(file, new Uint8Array(bytes))
          .pipe(Effect.mapError(() => notChecked(cwd)));
        yield* git(
          cwd,
          [
            "fetch",
            "--quiet",
            "--no-tags",
            file,
            `+${BUNDLE_HEAD}:${LATEST}`,
            `+${CHECKPOINT_REFS_PREFIX}/*:${CHECKPOINT_REFS_PREFIX}/*`,
            `+${KEPT_REFS_PREFIX}/*:${KEPT_REFS_PREFIX}/*`,
          ],
          TRANSFER_TIMEOUT,
        );
      }),
    );

  /** Moves the folder up to the hub's latest Version; refuses when it holds work of its own. */
  const bringLatest = Effect.fn("StudioTeams.bringLatest")(function* (
    cwd: string,
    row: ProjectRow,
  ) {
    if (row.bundle === null || row.head === null) return;
    if (yield* isDirty(cwd)) {
      return yield* fail(
        "changes-here",
        "This copy has changes that are not checked in. Check them in, or set them aside, first.",
      );
    }
    yield* fetchBundle(cwd, row.bundle);
    const head = yield* headOf(cwd);
    if (head !== row.head) {
      const behind =
        head === undefined ||
        (yield* runGit(cwd, ["merge-base", "--is-ancestor", "HEAD", LATEST])).code === 0;
      if (!behind) {
        return yield* fail(
          "changes-here",
          "This copy has Versions the team does not. Check them in first, or get the project again.",
        );
      }
      yield* git(cwd, ["reset", "--quiet", "--keep", LATEST]);
    }
    yield* git(cwd, ["config", VERSION_KEY, String(row.version)]);
  });

  const folderStatusOf = Effect.fn("StudioTeams.folderStatusOf")(function* (
    cwd: string,
    place: { project: string; version: number },
  ) {
    const s = yield* session;
    const row = yield* projectRow(place.project);
    const role = yield* roleOn(row.team_id);
    return {
      project: projectOf(row),
      role,
      localVersion: place.version,
      mine: row.checked_out_email !== null && row.checked_out_email === s.email,
      changesHere: yield* changesHere(cwd, row, place.version),
      checkIns: yield* checkInsOf(row.id),
    };
  });

  const folderStatus: StudioTeams["Service"]["folderStatus"] = Effect.fn(
    "StudioTeams.folderStatus",
  )(function* ({ cwd }) {
    const place = yield* placeOf(cwd);
    if (place.project === undefined) return null;
    return yield* folderStatusOf(cwd, { project: place.project, version: place.version }).pipe(
      Effect.catchTags({
        StudioTeamsError: (error) =>
          error.reason === "not-found"
            ? Effect.fail(
                fail(
                  "not-found",
                  "This project is no longer on its team, or you are not. Share with team puts it on a team again.",
                ),
              )
            : Effect.fail(error),
      }),
    );
  });

  const requirePlace = (cwd: string) =>
    placeOf(cwd).pipe(
      Effect.flatMap((place) =>
        place.project === undefined
          ? Effect.fail(fail("not-found", "This project is not shared with a team."))
          : Effect.succeed({ project: place.project, version: place.version }),
      ),
    );

  /** Records the work, sends its bundle and asks the hub to take it as the next Version. */
  const checkInFolder = (cwd: string, row: ProjectRow, base: number, note: string, keep: boolean) =>
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* session;
        const message = note.trim() === "" ? "Checked in from Studio" : note.trim();
        yield* sync
          .record({
            cwd,
            message,
            author: { name: s.email.split("@")[0] ?? s.email, email: s.email },
          })
          .pipe(
            Effect.mapError((error) =>
              error.failure === "too-large" || error.failure === "too-large-version"
                ? fail(
                    "local",
                    `${error.file ?? "A file"} is over the ${Math.round((error.limitBytes ?? 0) / 1048576)} MB a check-in can carry.`,
                  )
                : notChecked(cwd),
            ),
          );
        const head = yield* headOf(cwd);
        if (head === undefined) return yield* notChecked(cwd);
        const dir = yield* fileSystem
          .makeTempDirectoryScoped({ prefix: "studio-team-" })
          .pipe(Effect.mapError(() => notChecked(cwd)));
        const bytes = yield* bundleOf(cwd, path.join(dir, "check-in.bundle"));
        const unique = yield* random.uuidV4().pipe(Effect.mapError(() => notChecked(cwd)));
        const object = `${row.team_id}/${row.id}/${base + 1}-${unique}.bundle`;
        const uploaded = yield* send({
          method: "POST",
          path: `/storage/v1/object/${BUCKET}/${object}`,
          token: s.accessToken,
          bytes,
          timeout: TRANSFER_TIMEOUT,
        });
        if (uploaded.status === 403) {
          return yield* fail("not-allowed", "Your role on this team does not allow check-ins.");
        }
        if (uploaded.status >= 400) {
          return yield* fail("hub", "The check-in could not be uploaded. Try again.");
        }
        const version = yield* rpc(
          "check_in",
          {
            p_project: row.id,
            p_base: base,
            p_head: head,
            p_bundle: object,
            p_note: note,
            p_keep: keep,
          },
          Schema.Number,
        );
        yield* git(cwd, ["config", VERSION_KEY, String(version)]);
      }),
    );

  const share: StudioTeams["Service"]["share"] = Effect.fn("StudioTeams.share")(function* (input) {
    const { cwd } = input;
    const existing = yield* placeOf(cwd);
    if (existing.project !== undefined) {
      // A folder whose team project is gone, or whose person left the team, may be shared again.
      const stillShared = yield* projectRow(existing.project).pipe(
        Effect.as(true),
        Effect.catchTags({
          StudioTeamsError: (error) =>
            error.reason === "not-found" ? Effect.succeed(false) : Effect.fail(error),
        }),
      );
      if (stillShared) {
        return yield* fail("not-allowed", "This project is already shared with a team.");
      }
    }
    const id = yield* rpc(
      "share_project",
      { p_team: input.teamId, p_name: input.name },
      Schema.String,
    );
    yield* git(cwd, ["config", PROJECT_KEY, id]);
    yield* git(cwd, ["config", VERSION_KEY, "0"]);
    const row = yield* projectRow(id);
    yield* checkInFolder(cwd, row, 0, "Shared with the team", false);
    return yield* folderStatusOf(cwd, { project: id, version: 1 });
  });

  /** A new empty folder under `root`, with `-2`, `-3`, ... when the name is taken. */
  const claimFolder = Effect.fnUntraced(function* (root: string, name: string) {
    const failed = () => fail("local", `Studio could not make a folder in ${root}.`);
    yield* fileSystem.makeDirectory(root, { recursive: true }).pipe(Effect.mapError(failed));
    const base = newProjectFolderName(name);
    for (let attempt = 1; attempt <= MAX_FOLDER_ATTEMPTS; attempt += 1) {
      const folder = path.join(root, attempt === 1 ? base : `${base}-${attempt}`);
      const claimed = yield* fileSystem.makeDirectory(folder).pipe(
        Effect.as(true),
        Effect.catchTags({
          PlatformError: (cause) =>
            cause.reason._tag === "AlreadyExists" ? Effect.succeed(false) : Effect.fail(failed()),
        }),
      );
      if (claimed) return folder;
    }
    return yield* failed();
  });

  const get: StudioTeams["Service"]["get"] = Effect.fn("StudioTeams.get")(function* (input) {
    const row = yield* projectRow(input.projectId);
    if (row.bundle === null || row.head === null) {
      return yield* fail("not-found", "This project has nothing checked in yet.");
    }
    const folder = yield* claimFolder(input.root, row.name);
    const bring = Effect.gen(function* () {
      yield* git(folder, ["init", "--quiet", "--initial-branch=main"]);
      yield* fetchBundle(folder, row.bundle!);
      yield* git(folder, ["checkout", "--quiet", "-B", "main", LATEST]);
      yield* git(folder, ["config", PROJECT_KEY, row.id]);
      yield* git(folder, ["config", VERSION_KEY, String(row.version)]);
    });
    yield* bring.pipe(
      Effect.onError(() =>
        fileSystem.remove(folder, { recursive: true, force: true }).pipe(Effect.ignore),
      ),
    );
    const brief = yield* fileSystem
      .readFileString(path.join(folder, ...STUDIO_BACKUP_BRIEF_FILE.split("/")))
      .pipe(
        Effect.flatMap(decodeBrief),
        Effect.orElseSucceed(() => null),
      );
    return { folder, name: row.name, brief };
  });

  const checkOut: StudioTeams["Service"]["checkOut"] = Effect.fn("StudioTeams.checkOut")(
    function* ({ cwd }) {
      const place = yield* requirePlace(cwd);
      const row = yield* projectRow(place.project);
      if (row.version > place.version) yield* bringLatest(cwd, row);
      yield* rpc("check_out", { p_project: row.id }, Schema.Unknown);
      const now = yield* placeOf(cwd);
      return yield* folderStatusOf(cwd, { project: place.project, version: now.version });
    },
  );

  const checkIn: StudioTeams["Service"]["checkIn"] = Effect.fn("StudioTeams.checkIn")(
    function* (input) {
      const { cwd } = input;
      const place = yield* requirePlace(cwd);
      const row = yield* projectRow(place.project);
      const s = yield* session;
      if (row.checked_out_email !== s.email) {
        return yield* refusal("checked-out", row.checked_out_email);
      }
      if (row.version !== place.version) return yield* refusal("changed-elsewhere", null);
      yield* checkInFolder(cwd, row, place.version, input.note, input.keep);
      const now = yield* placeOf(cwd);
      return yield* folderStatusOf(cwd, { project: place.project, version: now.version });
    },
  );

  const getLatest: StudioTeams["Service"]["getLatest"] = Effect.fn("StudioTeams.getLatest")(
    function* ({ cwd }) {
      const place = yield* requirePlace(cwd);
      const row = yield* projectRow(place.project);
      if (row.version > place.version) yield* bringLatest(cwd, row);
      const now = yield* placeOf(cwd);
      return yield* folderStatusOf(cwd, { project: place.project, version: now.version });
    },
  );

  const release: StudioTeams["Service"]["release"] = Effect.fn("StudioTeams.release")(function* ({
    cwd,
  }) {
    const place = yield* requirePlace(cwd);
    yield* rpc("release_project", { p_project: place.project }, Schema.Unknown);
    return yield* folderStatusOf(cwd, place);
  });

  return StudioTeams.of({
    status,
    signInStart,
    signInCheck,
    signOut,
    create,
    invite,
    remove,
    projects,
    share,
    get,
    folderStatus,
    checkOut,
    checkIn,
    getLatest,
    release,
  });
});

// Its own random source for check-in file names: nothing above it provides one.
export const layer = Layer.effect(StudioTeams, make).pipe(
  Layer.provide(SecureRandom.layerWebCrypto),
);
