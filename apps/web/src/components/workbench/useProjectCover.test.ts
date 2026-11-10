import { describe, expect, it } from "vite-plus/test";

import { projectCover, projectPage } from "./useProjectCover";

describe("a project's picture", () => {
  it("pictures the whole product: its first assembly before its parts", () => {
    expect(
      projectCover([
        "README.md",
        "parts/bracket.py",
        "parts/bracket.step",
        "assemblies/clip.py",
        "assemblies/clip.step",
      ]),
    ).toBe("assemblies/clip.step");
    expect(projectCover(["parts/bracket.step", "parts/arm.step"])).toBe("parts/arm.step");
  });

  it("pictures a part, not the flat pattern made from it, though the flat has two bodies", () => {
    const model = (id: string, script: string, kind: "Part" | "Assembly") => ({
      id,
      name: id,
      script,
      kind,
      updated: null,
    });
    expect(
      projectCover(
        ["parts/bracket_flat.py", "parts/bracket.py"],
        [
          model("flat", "parts/bracket_flat.py", "Assembly"),
          model("bracket", "parts/bracket.py", "Part"),
        ],
      ),
    ).toBe("bracket");
  });

  it("pictures the assembly though it is named after one of its parts", () => {
    expect(
      projectCover([
        "assemblies/phone_stand_portrait.step",
        "parts/phone_placeholder.step",
        "parts/phone_stand.step",
        "parts/phone_stand_print.step",
      ]),
    ).toBe("assemblies/phone_stand_portrait.step");
  });

  it("pictures a board when there is no part, and nothing when there is only writing", () => {
    expect(projectCover(["docs/setup.md", "electronics/board/board.kicad_pcb"])).toBe(
      "electronics/board/board.kicad_pcb",
    );
    expect(projectCover(["README.md", "assets/icon.svg"])).toBeNull();
  });
});

describe("a project with nothing to picture", () => {
  it("is pictured by its first document, else by what its README says", () => {
    expect(projectPage(["README.md", "docs/prd.md", "assets/icon.svg"])).toBe("docs/prd.md");
    expect(projectPage(["README.md", "assets/icon.svg"])).toBe("README.md");
    expect(projectPage(["assets/icon.svg"])).toBeNull();
  });
});
