// Studio turns on auto-resume for limited chats by default; this pins what that default does.
import { assert, describe, it } from "@effect/vitest";
import { DEFAULT_SERVER_SETTINGS, RunId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import type * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import { limitRecoveryCommand } from "../orchestration-v2/UsageLimitRecoveryWorker.ts";

const stopped = DateTime.makeUnsafe("2026-11-06T01:00:00.000Z");
const resetAt = "2026-11-06T06:00:00.000Z";
const resetMs = Date.parse(resetAt);

const limited: ProjectionStore.ProjectionLimitRecoveryCandidate = {
  id: ThreadId.make("thread-1"),
  status: "failed",
  lastErrorClass: "usage_limit",
  latestRunId: RunId.make("run-1"),
  usageLimitResetAt: resetAt,
  archivedAt: null,
  settledOverride: null,
  pendingRuntimeRequest: null,
  latestRunCompletedAt: stopped,
  updatedAt: stopped,
  limitRecovery: null,
  snoozedUntil: null,
};

describe("limitRecoveryCommand with the default settings", () => {
  const autoResume = DEFAULT_SERVER_SETTINGS.autoResumeLimitedThreads;
  const sweep = (thread: ProjectionStore.ProjectionLimitRecoveryCandidate, atMs: number) =>
    limitRecoveryCommand(thread, autoResume, atMs, DEFAULT_SERVER_SETTINGS.snoozeLimitedThreads);

  it("resumes a limited chat once, at the reset", () => {
    const armed = sweep(limited, resetMs - 60_000);
    assert.equal(armed?.type, "thread.metadata.update");
    const recovery = (armed as { limitRecovery: { autoResume: boolean } }).limitRecovery;
    assert.isTrue(recovery.autoResume);

    const waiting = {
      ...limited,
      limitRecovery: recovery,
    } as ProjectionStore.ProjectionLimitRecoveryCandidate;
    assert.isNull(sweep(waiting, resetMs - 1));

    const resumed = sweep(waiting, resetMs);
    assert.equal(resumed?.type, "message.dispatch");
    // The same id if the sweep runs again before the run starts, so it delivers once.
    assert.equal(sweep(waiting, resetMs + 60_000)?.commandId, resumed?.commandId);
    // Once it runs, the chat is no longer limited, and nothing more is sent.
    assert.isNull(
      sweep(
        { ...waiting, status: "running" } as ProjectionStore.ProjectionLimitRecoveryCandidate,
        resetMs + 60_000,
      ),
    );
  });

  it("leaves a chat whose person cancelled it", () => {
    const cancelled = {
      ...limited,
      limitRecovery: { runId: "run-1", resetAt, autoResume: false, snooze: false },
    } as unknown as ProjectionStore.ProjectionLimitRecoveryCandidate;
    assert.isNull(sweep(cancelled, resetMs + 1));
  });
});
