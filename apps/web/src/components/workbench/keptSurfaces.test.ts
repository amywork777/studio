import { describe, expect, it } from "vite-plus/test";

import { keptLayoutOrder, keptSurfaces } from "./keptSurfaces";

const view = (id: string) => ({ id });

describe("the panel's views kept mounted behind the tab in front", () => {
  it("keeps the most recently shown first, at most three, and only those still open", () => {
    const [a, b, c, d] = [view("a"), view("b"), view("c"), view("d")];
    const open = [a, b, c, d];
    let kept = keptSurfaces([], a, open);
    kept = keptSurfaces(kept, b, open);
    kept = keptSurfaces(kept, c, open);
    expect(kept.map((surface) => surface.id)).toEqual(["c", "b", "a"]);
    // A fourth lets the oldest go: each kept view holds a WebGL context.
    kept = keptSurfaces(kept, d, open);
    expect(kept.map((surface) => surface.id)).toEqual(["d", "c", "b"]);
    // Back to one already kept: it moves to the front, nothing reloads.
    kept = keptSurfaces(kept, b, open);
    expect(kept.map((surface) => surface.id)).toEqual(["b", "d", "c"]);
    // A closed tab's view goes at once.
    expect(keptSurfaces(kept, b, [b, c]).map((surface) => surface.id)).toEqual(["b", "c"]);
  });

  it("answers the same list when nothing changed, so the panel does not render again for it", () => {
    const [a, b] = [view("a"), view("b")];
    const kept = keptSurfaces(keptSurfaces([], a, [a, b]), b, [a, b]);
    expect(keptSurfaces(kept, b, [a, b])).toBe(kept);
    // Something else in front (the Overview) keeps the views as they were.
    expect(keptSurfaces(kept, null, [a, b])).toBe(kept);
  });
});

describe("keptLayoutOrder", () => {
  it("lays kept views out in one order however they are switched, so no frame moves and reloads", () => {
    const [a, b, c] = [view("a"), view("b"), view("c")];
    const open = [a, b, c];
    let kept = keptSurfaces([], a, open);
    kept = keptSurfaces(kept, b, open);
    kept = keptSurfaces(kept, c, open);
    const laid = keptLayoutOrder(kept).map((surface) => surface.id);
    // Switching back and forth changes which is most recent, never where each sits.
    for (const shown of [a, c, b, a, b, c]) {
      kept = keptSurfaces(kept, shown, open);
      expect(keptLayoutOrder(kept).map((surface) => surface.id)).toEqual(laid);
    }
  });
});
