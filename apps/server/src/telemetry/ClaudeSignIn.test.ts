import type { ServerProvider } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";

import { claudeSignIns } from "./ClaudeSignIn.ts";

const provider = (instanceId: string, driver: string, status: ServerProvider["auth"]["status"]) =>
  ({ instanceId, driver, auth: { status } }) as unknown as ServerProvider;

it("counts a Claude instance that turns from signed out to signed in", () => {
  const first = claudeSignIns(new Map(), [
    provider("claudeAgent", "claudeAgent", "unauthenticated"),
  ]);
  assert.strictEqual(first.signedIn, 0);
  const second = claudeSignIns(first.statuses, [
    provider("claudeAgent", "claudeAgent", "authenticated"),
  ]);
  assert.strictEqual(second.signedIn, 1);
  const third = claudeSignIns(second.statuses, [
    provider("claudeAgent", "claudeAgent", "authenticated"),
  ]);
  assert.strictEqual(third.signedIn, 0, "staying signed in is not another sign-in");
});

it("does not count a launch that finds Claude already signed in", () => {
  const first = claudeSignIns(new Map(), [provider("claudeAgent", "claudeAgent", "unknown")]);
  const second = claudeSignIns(first.statuses, [
    provider("claudeAgent", "claudeAgent", "authenticated"),
  ]);
  assert.strictEqual(second.signedIn, 0);
});

it("ignores other providers", () => {
  const first = claudeSignIns(new Map(), [provider("codex", "codex", "unauthenticated")]);
  const second = claudeSignIns(first.statuses, [provider("codex", "codex", "authenticated")]);
  assert.strictEqual(second.signedIn, 0);
});
