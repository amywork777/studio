import { describe, expect, it } from "vite-plus/test";

import { itemMatches, itemType, itemTypeCounts, projectFileItems } from "./projectItems";

describe("project items", () => {
  it("shows a study once, whatever a solve left beside it", () => {
    const items = projectFileItems([
      {
        root: "/case",
        paths: [
          "studies/case_t0.4.step",
          "studies/case_t0.4.fea.glb",
          "studies/case_t0.4.fea.json",
          "studies/case_pads_t0.4.step",
          "studies/early/case_t0.4.fea.glb",
          "studies/early/case_t0.4.step",
        ],
      },
    ]);
    expect(items.map((item) => item.file.path)).toEqual([
      "studies/case_pads_t0.4.step",
      "studies/case_t0.4.fea.glb",
      "studies/early/case_t0.4.fea.glb",
    ]);
  });

  it("lists every file once, by type then name, by the file that shows it", () => {
    const items = projectFileItems([
      {
        root: "/p/roomba",
        paths: [
          "README.md",
          "parts/bumper.step",
          "parts/bumper.stl",
          "parts/chassis.step",
          "drawings/bumper_drawing.pdf",
          "reference/vendor/motor.step",
          "electronics/main.kicad_pcb",
          "parts/bumper.fea.json",
          "parts/bumper.fea.glb",
          "cam/bumper.cam.json",
          "cam/bumper.cam.glb",
          "docs/prd.md",
          "photos/prototype.jpg",
        ],
      },
    ]);
    expect(items.map((item) => [itemType(item.file.group), item.label])).toEqual([
      ["CAD", "Bumper"],
      ["CAD", "Bumper drawing"],
      ["CAD", "Chassis"],
      ["CAD", "Motor"],
      ["Electronics", "Main board"],
      ["Analysis", "Bumper FEA study"],
      ["Manufacturing", "Bumper CAM job"],
      ["Documents", "PRD"],
      ["References", "Prototype"],
    ]);
    expect(items.find((item) => item.label === "Bumper FEA study")?.file.path).toBe(
      "parts/bumper.fea.glb",
    );
  });

  it("counts a mesh as a model: an STL, a GLB and a 3MF are CAD beside a STEP, a result is not", () => {
    const items = projectFileItems([
      {
        root: "/p/enclosure",
        paths: ["enclosure_base.glb", "lid.stl", "clip.3mf", "l_bracket.step", "l_bracket.fea.glb"],
      },
    ]);
    const counts = itemTypeCounts(items.map((item) => ({ type: itemType(item.file.group) })));
    expect([counts.get("CAD"), counts.get("Analysis")]).toEqual([4, 1]);
  });

  it("calls a STEP in an assemblies folder an Assembly, and filters by name, kind and folder", () => {
    const items = projectFileItems([
      {
        root: "/p/mount",
        paths: [
          "assemblies/motor_mount.step",
          "parts/motor_plate.step",
          "drawings/plate_drawing.pdf",
        ],
      },
    ]);
    expect(items.map((item) => [item.label, item.kind])).toEqual([
      ["Motor mount", "Assembly"],
      ["Motor plate", "Part"],
      ["Plate drawing", "Drawing"],
    ]);
    const found = (query: string) =>
      items.filter((item) => itemMatches(item, query)).map((item) => item.label);
    expect(found("assembly")).toEqual(["Motor mount"]);
    expect(found("motor_plate")).toEqual(["Motor plate"]);
    expect(found("plate drawings")).toEqual(["Plate drawing"]);
    expect(found("  ")).toHaveLength(3);
  });

  it("calls a .gsl an Implicit part, and folds one beside a part's script into that part's row", () => {
    const items = projectFileItems([
      {
        root: "/p/lattice",
        paths: ["parts/bracket.py", "parts/bracket.gsl", "parts/grip_pad.gsl"],
        models: [
          { id: "b1", name: "bracket", script: "parts/bracket.py", kind: "Part", updated: null },
        ],
      },
    ]);
    expect(items.map((item) => [item.label, item.kind])).toEqual([
      ["Bracket", "Part · implicit concept"],
      ["Grip pad", "Implicit part"],
    ]);
  });

  it("lists nothing for a folder still being read", () => {
    expect(projectFileItems([{ root: "/p/new", paths: null }])).toEqual([]);
  });
});
