import type { OrchestrationV2ProviderFailure } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";

import * as AnalyticsService from "./AnalyticsService.ts";

/**
 * Why an AI turn failed, from a closed list. Only this word leaves the machine with
 * `provider.turn.failed`; the provider's own message and code never do (law 9).
 */
export const TURN_FAILURE_REASONS = [
  "usage_limit",
  "sign_in",
  "permission",
  "service_down",
  "connection",
  "context_full",
  "could_not_start",
  "gave_up",
  "stopped",
  "answer_cut_off",
  "unanswered_request",
  "session_lost",
  "bad_request",
  "other",
] as const;
export type TurnFailureReason = (typeof TURN_FAILURE_REASONS)[number];

const SIGN_IN = new Set([
  "api_error_401",
  "unauthorized",
  "authentication_failed",
  "ProviderAuthError",
]);
const PERMISSION = new Set(["api_error_403", "sandboxError"]);
const CONTEXT_FULL = new Set([
  "prompt_too_long",
  "rapid_refill_breaker",
  "contextWindowExceeded",
  "ContextOverflowError",
  "compaction_failed",
]);
const COULD_NOT_START = new Set([
  "turn_setup_failed",
  "error_during_execution",
  "queued_start_failed",
  "context_handoff_unsupported",
]);
const GAVE_UP = new Set([
  "api_error",
  "malformed_tool_use_exhausted",
  "structured_output_retry_exhausted",
  "budget_exhausted",
  "error_max_turns",
  "error_max_budget_usd",
  "responseTooManyFailedAttempts",
]);
const SERVICE_DOWN = new Set(["serverOverloaded", "internalServerError"]);
const CONNECTION = new Set([
  "httpConnectionFailed",
  "responseStreamConnectionFailed",
  "responseStreamDisconnected",
  "process_exited_nonzero",
  "process_killed_by_signal",
]);
const UNANSWERED = new Set(["claude_request_unanswered", "claude_mod_ui_unsupported"]);

// OpenCode's adapter ends these turns with a message and no code; the message is read here, on the
// machine, and only the reason word leaves. Each prefix is the start of a message in its adapter.
const OPENCODE_BY_MESSAGE: ReadonlyArray<readonly [string, TurnFailureReason]> = [
  ["OpenCode is waiting on a request", "unanswered_request"],
  ["OpenCode asked for ", "unanswered_request"],
  ["The OpenCode session no longer exists", "session_lost"],
  ["OpenCode is still stopping the previous turn", "could_not_start"],
  ["OpenCode ended the turn with an error while", "connection"],
];

/** Sorts a provider failure into one reason from {@link TURN_FAILURE_REASONS}. */
export function turnFailureReason(
  failure:
    | (Pick<OrchestrationV2ProviderFailure, "class" | "code"> & { readonly message?: string })
    | null
    | undefined,
): TurnFailureReason {
  if (!failure) return "other";
  const code = failure.code ?? "";
  if (failure.class === "usage_limit" || code === "api_error_429") return "usage_limit";
  // Claude's signed-out turn (`claudeSignedOutMessage`) often carries no 401; its message is read
  // here, on the machine, and only the word `sign_in` leaves.
  if (SIGN_IN.has(code) || failure.message?.startsWith("Claude could not authenticate")) {
    return "sign_in";
  }
  if (failure.class === "permission_error" || PERMISSION.has(code)) return "permission";
  if (SERVICE_DOWN.has(code) || /^api_error_5\d\d$/.test(code)) return "service_down";
  if (failure.class === "transport_error" || CONNECTION.has(code)) return "connection";
  if (CONTEXT_FULL.has(code)) return "context_full";
  if (COULD_NOT_START.has(code)) return "could_not_start";
  if (GAVE_UP.has(code)) return "gave_up";
  if (code === "MessageAbortedError") return "stopped";
  if (code === "MessageOutputLengthError") return "answer_cut_off";
  if (UNANSWERED.has(code)) return "unanswered_request";
  const message = failure.message ?? "";
  const byMessage = OPENCODE_BY_MESSAGE.find(([start]) => message.startsWith(start));
  if (byMessage) return byMessage[1];
  if (failure.class === "validation_error") return "bad_request";
  return "other";
}

type TerminalTurn = Extract<
  ProviderAdapter.ProviderAdapterV2Event,
  { readonly type: "turn.terminal" }
>;

/** Counts a failed turn once (`provider.turn.failed`), with its provider and reason only. */
export class ProviderTurnFailureAnalytics extends Context.Reference<{
  /** Called with each terminal turn the ingestor stored; only a failed one counts. */
  readonly turnEnded: (providerInstanceId: string, event: TerminalTurn) => Effect.Effect<void>;
}>("t3/orchestration-v2/ProviderTurnFailureAnalytics", {
  defaultValue: () => ({ turnEnded: () => Effect.void }),
}) {}

export const layerFailureAnalytics = Layer.effect(
  ProviderTurnFailureAnalytics,
  Effect.gen(function* () {
    const analytics = yield* AnalyticsService.AnalyticsService;
    // A provider can report the same terminal turn more than once.
    const counted = new Set<string>();
    return {
      turnEnded: Effect.fn("ProviderTurnFailureAnalytics.turnEnded")(function* (
        providerInstanceId: string,
        event: TerminalTurn,
      ) {
        if (event.status !== "failed") return;
        const key = `${providerInstanceId}:${event.providerTurnId}`;
        if (counted.has(key)) return;
        counted.add(key);
        if (counted.size > 4096) {
          const oldest = counted.values().next().value;
          if (oldest !== undefined) counted.delete(oldest);
        }
        yield* analytics.record("provider.turn.failed", {
          provider: event.driver,
          reason: turnFailureReason(event.failure),
          // The contract's closed class list; tells "other" apart (provider_error, unknown, ...).
          kind: event.failure?.class ?? "unknown",
        });
      }),
    };
  }),
);
