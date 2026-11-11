import { describe, expect, it } from "@effect/vitest";

import { TURN_FAILURE_REASONS, turnFailureReason } from "./TurnFailure.ts";

describe("turnFailureReason", () => {
  it("sorts provider failures into the listed reasons", () => {
    const cases = [
      [{ class: "usage_limit", code: "api_error_429" }, "usage_limit"],
      [{ class: "usage_limit", code: "usageLimitExceeded" }, "usage_limit"],
      [{ class: "provider_error", code: "api_error_401" }, "sign_in"],
      [{ class: "provider_error", code: "unauthorized" }, "sign_in"],
      [{ class: "permission_error", code: null }, "permission"],
      [{ class: "provider_error", code: "api_error_529" }, "service_down"],
      [{ class: "provider_error", code: "serverOverloaded" }, "service_down"],
      [{ class: "transport_error", code: null }, "connection"],
      [{ class: "provider_error", code: "prompt_too_long" }, "context_full"],
      [{ class: "provider_error", code: "turn_setup_failed" }, "could_not_start"],
      [{ class: "provider_error", code: "malformed_tool_use_exhausted" }, "gave_up"],
      [{ class: "provider_error", code: "something new" }, "other"],
      [{ class: "unknown", code: null }, "other"],
    ] as const;
    for (const [failure, reason] of cases) {
      expect(turnFailureReason(failure)).toBe(reason);
    }
    expect(turnFailureReason(null)).toBe("other");
    expect(
      turnFailureReason({
        class: "provider_error",
        code: "sdk_result_error",
        message: "Claude could not authenticate. For subscription login, run `claude auth login`.",
      }),
    ).toBe("sign_in");
  });

  it("never sends the provider's own words", () => {
    const reason = turnFailureReason({ class: "provider_error", code: "/Users/someone/part.py" });
    expect(TURN_FAILURE_REASONS).toContain(reason);
    expect(reason).toBe("other");
  });
});
