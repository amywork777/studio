import { describe, expect, it } from "vite-plus/test";

import { documentSwap } from "./useOpenInWorkbench";

// A STEP tab in CAD mode is shown by its built document. The document took a second tab, and the
// STEP tab asked for the swap again each time it came to the front, so pressing it fronted the
// document's tab: the tab strip seemed stuck (0.1.18 end-to-end pass).
describe("a view's own part taking its tab", () => {
  const tabs = [{ id: "files" }, { id: "step" }, { id: "other" }];

  it("puts the document in the view's place and closes the view's tab", () => {
    expect(documentSwap(tabs, "step", "doc")).toEqual({ kind: "replace", index: 1, close: "step" });
  });

  it("fronts the document's tab already open and closes the view's, so one part is one tab", () => {
    expect(documentSwap([...tabs, { id: "doc" }], "step", "doc")).toEqual({
      kind: "front-open",
      close: "step",
    });
  });

  it("does nothing for a view no longer open, or one that already shows the document", () => {
    expect(documentSwap(tabs, "gone", "doc")).toBeNull();
    expect(documentSwap([...tabs, { id: "doc" }], "doc", "doc")).toBeNull();
  });
});
