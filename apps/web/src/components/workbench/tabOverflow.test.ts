import { describe, expect, it } from "vite-plus/test";

import { hiddenTabs, PREVIEWABLE } from "./tabOverflow";

describe("a tab strip's tabs out of sight", () => {
  it("lists the tabs past either edge, a tab cut by an edge among them, in the strip's order", () => {
    const tabs = [
      { id: "a", left: -40, right: 100 },
      { id: "b", left: 104, right: 240 },
      { id: "c", left: 244, right: 380 },
      { id: "d", left: 384, right: 520 },
    ];
    expect(hiddenTabs(tabs, { left: 0, right: 400 })).toEqual(["a", "d"]);
    expect(hiddenTabs(tabs, { left: -40, right: 520.5 })).toEqual([]);
  });

  it("previews the files the CAD tools draw", () => {
    expect(
      ["base.step", "arm.STL", "lamp.glb", "plate.xbf"].every((f) => PREVIEWABLE.test(f)),
    ).toBe(true);
    expect(["drawing.pdf", "README.md", "bracket.py"].some((f) => PREVIEWABLE.test(f))).toBe(false);
  });
});
