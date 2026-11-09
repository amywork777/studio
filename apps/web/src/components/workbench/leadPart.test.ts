import { describe, expect, it } from "vite-plus/test";

import { leadPartOf } from "./leadPart";

describe("leadPartOf", () => {
  it("takes the first part of the first folder that has one", () => {
    const lead = leadPartOf([
      { root: "/work/notes", paths: ["README.md", "docs/plan.md"] },
      { root: "/work/hook", paths: ["parts/hook.step", "parts/plate.step"] },
    ]);
    expect(lead?.root).toBe("/work/hook");
    expect(lead?.file.path).toBe("parts/hook.step");
  });

  it("leads with the part the others are named after, whichever is listed first", () => {
    const lead = leadPartOf([
      {
        root: "/work/bracket",
        paths: ["parts/bracket_flat.step", "parts/bracket-v2.step", "parts/bracket.step"],
      },
    ]);
    expect(lead?.file.path).toBe("parts/bracket.step");
    // Names that only share their start are parts of their own.
    expect(
      leadPartOf([{ root: "/work/a", paths: ["parts/bracketry.step", "parts/bracket.step"] }])?.file
        .path,
    ).toBe("parts/bracketry.step");
  });

  it("leads with the part with the most made from it, whatever was built last", () => {
    const model = (id: string, kind: "Part" | "Assembly", updated: string) => ({
      id,
      name: id,
      script: `${kind === "Part" ? "parts" : "assemblies"}/${id}.py`,
      kind,
      updated,
    });
    const paths = [
      "cam/motor_plate/motor_plate.top.ngc",
      "cam/motor_plate/result.glb",
      "cam/motor_plate/result.json",
      "drawings/motor_plate_drawing.pdf",
      "studies/motor_plate/result.glb",
      "studies/motor_plate/result.json",
    ];
    const models = [
      model("nema17", "Part", "300"),
      model("motor_plate", "Part", "100"),
      model("motor_mount", "Assembly", "200"),
    ];
    expect(leadPartOf([{ root: "/w", paths, models }])?.file.title).toBe("Motor plate");
    // Across folders too, and a drawing alone counts.
    expect(
      leadPartOf([
        { root: "/a", paths: ["parts/hook.step"] },
        { root: "/b", paths: ["parts/plate.step", "drawings/plate_drawing.pdf"] },
      ])?.root,
    ).toBe("/b");
  });

  it("leads with an assembly ahead of a newer part when neither has more made from it", () => {
    const part = { id: "plate", name: "plate", script: "parts/plate.py", updated: "300" };
    const whole = { id: "mount", name: "mount", script: "mount.py", updated: "100" };
    expect(
      leadPartOf([
        {
          root: "/w",
          paths: [],
          models: [
            { ...part, kind: "Part" },
            { ...whole, kind: "Assembly" },
          ],
        },
      ])?.file.path,
    ).toBe("mount");
    // An assembly by the folder it is filed in, as the tile reads one.
    expect(
      leadPartOf([{ root: "/w", paths: ["parts/plate.step", "assemblies/mount.step"] }])?.file.path,
    ).toBe("assemblies/mount.step");
  });

  it("leads with what was built last, an assembly ahead of the parts built with it", () => {
    const model = (id: string, kind: "Part" | "Assembly", updated: string) => ({
      id,
      name: id,
      script: `parts/${id}.py`,
      kind,
      updated,
    });
    const older = model("frame", "Part", "100");
    const newer = model("carriage", "Part", "200");
    const whole = model("plotter", "Assembly", "200");
    expect(leadPartOf([{ root: "/w", paths: [], models: [older, newer] }])?.file.path).toBe(
      "carriage",
    );
    expect(leadPartOf([{ root: "/w", paths: [], models: [newer, whole, older] }])?.file.path).toBe(
      "plotter",
    );
    // Across folders too, wherever the first folder's parts are.
    expect(
      leadPartOf([
        { root: "/a", paths: [], models: [older] },
        { root: "/b", paths: [], models: [newer] },
      ])?.root,
    ).toBe("/b");
  });

  it("is null when no folder has a part, or while one is still read", () => {
    expect(leadPartOf([])).toBeNull();
    expect(leadPartOf([{ root: "/work/a", paths: ["README.md", "docs/plan.md"] }])).toBeNull();
    expect(leadPartOf([{ root: "/work/a", paths: null }])).toBeNull();
  });
});
