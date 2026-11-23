import { describe, expect, it } from "vite-plus/test";

import { selectTakenBy, useViewerSelectStore } from "./viewerSelect";

describe("asking the views beside a chat to select a message's picks", () => {
  it("keeps the latest press per chat, and of several views' answers the one that found the most", () => {
    const store = useViewerSelectStore.getState();
    const first = store.select("chat-a", ["d#arm<1>"], null);
    const second = useViewerSelectStore
      .getState()
      .select("chat-a", ["d#base<1>", "d#head<1>"], "parts/lamp.step");
    expect(second).toBeGreaterThan(first);
    expect(useViewerSelectStore.getState().asks["chat-a"]).toEqual({
      references: ["d#base<1>", "d#head<1>"],
      nonce: second,
      file: "parts/lamp.step",
    });
    // A view of another document finds none; the view of the part finds one and misses one.
    useViewerSelectStore.getState().answer(second, { found: 0, missing: 2 });
    useViewerSelectStore.getState().answer(second, { found: 1, missing: 1 });
    useViewerSelectStore.getState().answer(second, { found: 0, missing: 2 });
    expect(useViewerSelectStore.getState().answers[second]).toEqual({ found: 1, missing: 1 });
  });

  it("is taken by the view of the message's file where one is open, else by the view in front", () => {
    const openFiles = ["/p/parts/lamp.step", "/p/parts/base.step"];
    const by = (viewFile: string, front: boolean, file: string | null) =>
      selectTakenBy({ file, viewFile, front, openFiles });
    // The message names lamp.step: its view takes the ask even behind; the one in front does not.
    expect(by("/p/parts/lamp.step", false, "parts/lamp.step")).toBe(true);
    expect(by("/p/parts/base.step", true, "parts/lamp.step")).toBe(false);
    // A document id names no view's file: the view in front takes it, one behind does not.
    expect(by("/p/parts/base.step", true, "29ae9a38-16fc")).toBe(true);
    expect(by("/p/parts/lamp.step", false, "29ae9a38-16fc")).toBe(false);
    // No file at all: the view in front.
    expect(by("/p/parts/base.step", true, null)).toBe(true);
  });

  it("knows the views open beside a chat until they leave", () => {
    const leave = useViewerSelectStore.getState().opened("chat-b", "/p/a.step");
    useViewerSelectStore.getState().opened("chat-b", "/p/b.step");
    expect(useViewerSelectStore.getState().open["chat-b"]).toEqual(["/p/a.step", "/p/b.step"]);
    leave();
    expect(useViewerSelectStore.getState().open["chat-b"]).toEqual(["/p/b.step"]);
  });
});
