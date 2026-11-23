import { describe, expect, it } from "vite-plus/test";

import { useViewerSelectStore } from "./viewerSelect";

describe("asking the views beside a chat to select a message's picks", () => {
  it("keeps the latest press per chat, and of several views' answers the one that found the most", () => {
    const store = useViewerSelectStore.getState();
    const first = store.select("chat-a", ["d#arm<1>"]);
    const second = useViewerSelectStore.getState().select("chat-a", ["d#base<1>", "d#head<1>"]);
    expect(second).toBeGreaterThan(first);
    expect(useViewerSelectStore.getState().asks["chat-a"]).toEqual({
      references: ["d#base<1>", "d#head<1>"],
      nonce: second,
    });
    // A view of another document finds none; the view of the part finds one and misses one.
    useViewerSelectStore.getState().answer(second, { found: 0, missing: 2 });
    useViewerSelectStore.getState().answer(second, { found: 1, missing: 1 });
    useViewerSelectStore.getState().answer(second, { found: 0, missing: 2 });
    expect(useViewerSelectStore.getState().answers[second]).toEqual({ found: 1, missing: 1 });
  });
});
