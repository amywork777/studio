import { describe, expect, it } from "vite-plus/test";

import { togglePin } from "./toolboxPins";

describe("togglePin", () => {
  it("pins at the end and unpins in place", () => {
    expect(togglePin(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(togglePin(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});
