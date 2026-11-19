import { describe, expect, it } from "vite-plus/test";

import { tabOffersCopyPath } from "./studioRightPanelTabs";

describe("Copy path on a tab", () => {
  it("is offered on a file tab outside the engineering interface only", () => {
    const file = { kind: "file" } as const;
    expect(tabOffersCopyPath(file, false)).toBe(true);
    expect(tabOffersCopyPath(file, true)).toBe(false);
  });

  it("is never offered on an attachment or on a tab that is not a file", () => {
    expect(tabOffersCopyPath({ kind: "file", attachment: {} }, false)).toBe(false);
    expect(tabOffersCopyPath({ kind: "preview" }, false)).toBe(false);
  });
});
