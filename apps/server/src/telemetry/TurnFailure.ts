import type { OrchestrationV2ProviderFailure } from "@t3tools/contracts";

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
  "other",
] as const;
export type TurnFailureReason = (typeof TURN_FAILURE_REASONS)[number];

const SIGN_IN = new Set(["api_error_401", "unauthorized", "authentication_failed"]);
const PERMISSION = new Set(["api_error_403", "sandboxError"]);
const CONTEXT_FULL = new Set(["prompt_too_long", "rapid_refill_breaker", "contextWindowExceeded"]);
const COULD_NOT_START = new Set(["turn_setup_failed", "error_during_execution"]);
const GAVE_UP = new Set([
  "api_error",
  "malformed_tool_use_exhausted",
  "structured_output_retry_exhausted",
  "budget_exhausted",
  "error_max_turns",
  "error_max_budget_usd",
]);
const SERVICE_DOWN = new Set(["serverOverloaded", "internalServerError"]);

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
  if (failure.class === "transport_error") return "connection";
  if (CONTEXT_FULL.has(code)) return "context_full";
  if (COULD_NOT_START.has(code)) return "could_not_start";
  if (GAVE_UP.has(code)) return "gave_up";
  return "other";
}
