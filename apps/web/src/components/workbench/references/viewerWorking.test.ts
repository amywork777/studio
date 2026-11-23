import { describe, expect, it } from "vite-plus/test";

import { useViewerWorkingStore } from "./viewerWorking";

describe("telling the views beside a chat that a turn is under way", () => {
  it("marks a chat while its turn runs and forgets it when the turn ends", () => {
    const { set } = useViewerWorkingStore.getState();
    set("chat-a", true);
    set("chat-b", true);
    expect(useViewerWorkingStore.getState().working).toEqual({ "chat-a": true, "chat-b": true });
    set("chat-a", false);
    expect(useViewerWorkingStore.getState().working).toEqual({ "chat-b": true });
    const before = useViewerWorkingStore.getState().working;
    set("chat-b", true);
    // The same state again changes nothing, so the views are not told twice.
    expect(useViewerWorkingStore.getState().working).toBe(before);
  });
});
