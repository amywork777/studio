import { describe, expect, it } from "vite-plus/test";

import { itemType, projectFileItems } from "./projectItems";

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

  it("lists nothing for a folder still being read", () => {
    expect(projectFileItems([{ root: "/p/new", paths: null }])).toEqual([]);
  });
});
