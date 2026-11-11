import { describe, expect, it } from "vite-plus/test";

import { importedToOpen } from "./importIntoProject";

describe("import into a project", () => {
  it("opens the one part an import brought in, as a CAD tool opens the STEP it imports", () => {
    expect(importedToOpen(["/w/bracket/bracket.step"])).toBe("/w/bracket/bracket.step");
    // What came with it does not stop it opening.
    expect(importedToOpen(["/w/bracket/drawing.pdf", "/w/bracket/bracket.STP"])).toBe(
      "/w/bracket/bracket.STP",
    );
    expect(importedToOpen(["/w/board/board.kicad_pcb"])).toBe("/w/board/board.kicad_pcb");
  });

  it("leaves the choice to the Overview when it brought several parts, or none", () => {
    expect(importedToOpen(["/w/a.step", "/w/b.step"])).toBeNull();
    expect(importedToOpen(["/w/notes.pdf"])).toBeNull();
    expect(importedToOpen(["/w/a folder"])).toBeNull();
    expect(importedToOpen([])).toBeNull();
  });
});
