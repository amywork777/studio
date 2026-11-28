import type { OrchestrationV2PendingBackgroundTask } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { backgroundWorkAfterTurn } from "./backgroundWorkAfterTurn";

// A Bash command that outlived its 120 s limit, waiting on input, moved to the background.
const hung: OrchestrationV2PendingBackgroundTask = {
  taskId: "bm0yxrymr",
  kind: "command",
  description: "Write shared spec and sketch helper modules",
};

describe("backgroundWorkAfterTurn", () => {
  it("says a command left running after the reply is still running, and that Stop ends it", () => {
    expect(backgroundWorkAfterTurn([hung], false)).toEqual({
      title: "Still running after the reply · Write shared spec and sketch helper modules",
      description: "The agent left it running in the background. Stop ends it.",
    });
    expect(backgroundWorkAfterTurn([hung, { ...hung, taskId: "b2" }], false)?.title).toBe(
      "2 still running after the reply",
    );
  });

  it("leaves T3's line while the turn runs, with nothing left running, or while the agent waits on it", () => {
    expect(backgroundWorkAfterTurn([hung], true)).toBeNull();
    expect(backgroundWorkAfterTurn([], false)).toBeNull();
    expect(backgroundWorkAfterTurn([{ ...hung, awaited: true }], false)).toBeNull();
  });
});
