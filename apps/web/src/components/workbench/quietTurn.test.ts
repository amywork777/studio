import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import type { TimelineEntry } from "../../session-logic";
import { latestTurnActivity } from "./quietTurn";

describe("latestTurnActivity", () => {
  const prompt = {
    id: "u1",
    kind: "message",
    createdAt: "2026-11-04T10:00:00.000Z",
    message: {
      id: "u1",
      role: "user",
      text: "make a bracket",
      createdAt: "2026-11-04T10:00:00.000Z",
      updatedAt: "2026-11-04T10:00:00.000Z",
      streaming: false,
    },
  } as unknown as TimelineEntry;
  const tool = (id: string, title: string, startedAt: string, changedAt?: string) =>
    ({
      id,
      kind: "work",
      createdAt: startedAt,
      entry: {
        id,
        createdAt: startedAt,
        label: "Tool",
        toolTitle: title,
        tone: "tool",
        ...(changedAt
          ? { projectedItem: { item: { updatedAt: DateTime.makeUnsafe(changedAt) } } }
          : {}),
      },
    }) as unknown as TimelineEntry;

  it("counts from when a long tool finished, not when it started", () => {
    expect(
      latestTurnActivity(
        [
          prompt,
          tool("mesh", "Mesh the bracket", "2026-11-04T10:01:00.000Z", "2026-11-04T10:19:00.000Z"),
        ],
        0,
        "2026-11-04T10:00:00.000Z",
      ),
    ).toEqual({ at: "2026-11-04T10:19:00.000Z", step: "Mesh the bracket" });
  });

  it("names the latest step, and leaves out the turns before this one", () => {
    const earlier = tool("old", "Old step", "2026-11-04T09:00:00.000Z");
    expect(
      latestTurnActivity(
        [
          earlier,
          prompt,
          tool("build", "Build model", "2026-11-04T10:02:00.000Z"),
          tool("solve", "Run strength check", "2026-11-04T10:03:00.000Z"),
        ],
        1,
        "2026-11-04T10:00:00.000Z",
      ),
    ).toEqual({ at: "2026-11-04T10:03:00.000Z", step: "Run strength check" });
  });

  it("is the turn's start while nothing has happened yet", () => {
    expect(latestTurnActivity([prompt], 0, "2026-11-04T10:00:00.000Z")).toEqual({
      at: "2026-11-04T10:00:00.000Z",
      step: null,
    });
  });
});
