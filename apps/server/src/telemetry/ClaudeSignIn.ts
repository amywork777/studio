/**
 * Counts a Claude sign-in (`claude.signed_in`, no properties), the Claude match for
 * `chatgpt.auth.completed`.
 *
 * Claude signs in outside Studio (`claude auth login`), so Studio sees a sign-in only as a Claude
 * instance's auth status turning from `unauthenticated` to `authenticated`. A launch that finds
 * Claude already signed in goes from `unknown` to `authenticated` and is not counted.
 *
 * @module ClaudeSignIn
 */
import type { ServerProvider } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import * as ProviderRegistry from "../provider/ProviderRegistry.ts";
import * as AnalyticsService from "./AnalyticsService.ts";

const CLAUDE_DRIVER = "claudeAgent";

type AuthStatus = ServerProvider["auth"]["status"];

/** Each Claude instance's auth status now, and how many of them just signed in. */
export function claudeSignIns(
  previous: ReadonlyMap<string, AuthStatus>,
  providers: ReadonlyArray<ServerProvider>,
): { readonly statuses: ReadonlyMap<string, AuthStatus>; readonly signedIn: number } {
  const statuses = new Map<string, AuthStatus>();
  let signedIn = 0;
  for (const provider of providers) {
    if (provider.driver !== CLAUDE_DRIVER) continue;
    const status = provider.auth.status;
    if (previous.get(provider.instanceId) === "unauthenticated" && status === "authenticated") {
      signedIn += 1;
    }
    statuses.set(provider.instanceId, status);
  }
  return { statuses, signedIn };
}

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const analytics = yield* AnalyticsService.AnalyticsService;
    const providers = yield* ProviderRegistry.ProviderRegistry;
    const statuses = yield* Ref.make<ReadonlyMap<string, AuthStatus>>(new Map());
    yield* providers.streamChanges.pipe(
      Stream.runForEach((snapshot) =>
        Ref.modify(statuses, (previous) => {
          const next = claudeSignIns(previous, snapshot);
          return [next.signedIn, next.statuses] as const;
        }).pipe(
          Effect.flatMap((signedIn) =>
            Effect.forEach(
              Array.from({ length: signedIn }),
              () => analytics.record("claude.signed_in").pipe(Effect.ignoreCause),
              { discard: true },
            ),
          ),
        ),
      ),
      Effect.forkScoped,
    );
  }),
);
