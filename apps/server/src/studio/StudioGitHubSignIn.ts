/**
 * StudioGitHubSignIn - Sign in with GitHub by device flow: GitHub gives a code, the person enters
 * it at github.com/login/device, and the token lands in the same saved `tokens["github.com"]` a
 * token pasted into Settings uses, so `GitHubCredentials` and everything behind it just work.
 *
 * The client id is public, and device flow takes no client secret. The token never reaches a
 * client: a check answers only how far along the person is.
 *
 * @module StudioGitHubSignIn
 */
import {
  StudioGitHubSignInError,
  type StudioGitHubSignInCheckInput,
  type StudioGitHubSignInCheckResult,
  type StudioGitHubSignInStartResult,
} from "@t3tools/contracts";
import { readSourceControlHostSettings } from "@t3tools/source-control-core/shared/definition";
import * as GitHubClient from "@t3tools/source-control-github/shared/definition";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import * as ServerSettings from "../serverSettings.ts";

/** Studio's OAuth App on github.com, with Enable Device Flow ticked. */
const CLIENT_ID = "Ov23liOssza6ODYjuIiI";
/** `repo`, since a backup is a private repository Studio makes and pushes to. */
const SCOPE = "repo";
const HOST = "github.com";
const DEVICE_CODE_URL = `https://${HOST}/login/device/code`;
const TOKEN_URL = `https://${HOST}/login/oauth/access_token`;
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const REQUEST_TIMEOUT = "20 seconds";

const DeviceCodeBody = Schema.Struct({
  device_code: Schema.String,
  user_code: Schema.String,
  verification_uri: Schema.String,
  expires_in: Schema.Number,
  interval: Schema.Number,
});

/** GitHub answers 200 either way: a token, or an `error` saying how far along the person is. */
const TokenBody = Schema.Struct({
  access_token: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
});

type CheckEffect = Effect.Effect<StudioGitHubSignInCheckResult, StudioGitHubSignInError>;

const unreachable = () =>
  new StudioGitHubSignInError({ message: "GitHub could not be reached. Try again." });

export class StudioGitHubSignIn extends Context.Service<
  StudioGitHubSignIn,
  {
    /** Asks GitHub for a code to show the person. */
    readonly start: Effect.Effect<StudioGitHubSignInStartResult, StudioGitHubSignInError>;
    /** Asks GitHub once whether the code was entered, and saves the token when it was. */
    readonly check: (
      input: StudioGitHubSignInCheckInput,
    ) => Effect.Effect<StudioGitHubSignInCheckResult, StudioGitHubSignInError>;
  }
>()("t3/studio/StudioGitHubSignIn") {}

const make = Effect.gen(function* () {
  const httpClient = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
  const settings = yield* ServerSettings.ServerSettingsService;

  const post = <A, I>(
    url: string,
    params: Record<string, string>,
    schema: Schema.Codec<A, I>,
  ): Effect.Effect<A, StudioGitHubSignInError> =>
    HttpClientRequest.post(url).pipe(
      HttpClientRequest.acceptJson,
      HttpClientRequest.bodyUrlParams(params),
      httpClient.execute,
      Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)),
      Effect.timeout(REQUEST_TIMEOUT),
      Effect.mapError(unreachable),
    );

  /** Joins the tokens already saved: the map travels whole in a settings patch. */
  const saveToken = (token: string) =>
    settings.getSettings.pipe(
      Effect.flatMap((current) => {
        const github = readSourceControlHostSettings(
          GitHubClient.settings,
          current.sourceControlHosts[GitHubClient.definition.kind],
        );
        return settings.updateSettings({
          sourceControlHosts: { github: { tokens: { ...github.tokens, [HOST]: token } } },
        });
      }),
      Effect.mapError(
        () =>
          new StudioGitHubSignInError({
            message: "Signed in, but the sign-in could not be saved on this computer. Try again.",
          }),
      ),
    );

  return StudioGitHubSignIn.of({
    start: post(DEVICE_CODE_URL, { client_id: CLIENT_ID, scope: SCOPE }, DeviceCodeBody).pipe(
      Effect.map((body) => ({
        deviceCode: body.device_code,
        userCode: body.user_code,
        verificationUri: body.verification_uri,
        intervalSeconds: body.interval,
        expiresInSeconds: body.expires_in,
      })),
    ),
    check: Effect.fn("StudioGitHubSignIn.check")(({ deviceCode }) =>
      post(
        TOKEN_URL,
        { client_id: CLIENT_ID, device_code: deviceCode, grant_type: DEVICE_GRANT },
        TokenBody,
      ).pipe(
        Effect.flatMap((body): CheckEffect => {
          if (body.access_token !== undefined) {
            return saveToken(body.access_token).pipe(Effect.as({ state: "signed-in" } as const));
          }
          switch (body.error) {
            case "authorization_pending":
              return Effect.succeed({ state: "waiting" });
            case "slow_down":
              return Effect.succeed({ state: "slow-down" });
            case "expired_token":
              return Effect.succeed({ state: "expired" });
            case "access_denied":
              return Effect.succeed({ state: "denied" });
            default:
              return Effect.fail(unreachable());
          }
        }),
      ),
    ),
  });
});

export const layer = Layer.effect(StudioGitHubSignIn, make);
