import { describe, expect, it } from "vite-plus/test";

import { HARDWARE_ACTIONS, type HardwareActionMenu, hardwareActions } from "./hardwareActions";
import { entryOfAction } from "./library/libraryCatalog";

const titled = (sections: HardwareActionMenu["sections"]) =>
  sections.map((section) => [section.title, section.actions.map((action) => action.label)]);
const menu = (group: string, kind: string, skills: string[], process?: string) =>
  hardwareActions(kind, new Set(skills), process).find((entry) => entry.group === group);

describe("hardware actions", () => {
  it("leads Manufacture with the project's own way of making it, whole, and keeps the others apart", () => {
    const manufacture = menu("Manufacture", "Part", ["cad", "print3d", "cam"], "3D printing (FDM)");
    expect(titled(manufacture!.sections)).toEqual([
      [
        "3D printing",
        [
          "Check for FDM printing",
          "Slice and print",
          "Check for resin printing",
          "Check for powder printing",
          "Check for metal printing",
        ],
      ],
      ["Files and off-the-shelf parts", ["Off-the-shelf parts", "Export"]],
    ]);
    expect(titled(manufacture!.others)).toEqual([
      [
        "Machining and molding",
        ["Check for CNC machining", "G-code for CNC", "Check for injection molding"],
      ],
      ["Sheet metal and cutting", ["Check as sheet metal", "Flat pattern DXF"]],
    ]);
    expect(manufacture!.moreLabel).toBe("Other ways to make it");
  });

  it("puts the files to export in Manufacture, after the ways to make it", () => {
    const manufacture = menu("Manufacture", "Part", ["cad"], "CNC machining");
    expect(titled(manufacture!.sections)).toEqual([
      ["Machining and molding", ["Check for CNC machining", "Check for injection molding"]],
      ["Files and off-the-shelf parts", ["Off-the-shelf parts", "Export"]],
    ]);
    expect(menu("Manufacture", "Board", ["cad"])).toBeUndefined();
  });

  it("keeps every way to make it apart until the project chooses one", () => {
    const manufacture = menu("Manufacture", "Part", ["cad", "sendcutsend"]);
    expect(manufacture!.sections.map((section) => section.title)).toEqual([
      "Files and off-the-shelf parts",
    ]);
    expect(manufacture!.others.map((section) => section.title)).toEqual([
      "3D printing",
      "Machining and molding",
      "Sheet metal and cutting",
    ]);
    expect(manufacture!.moreLabel).toBe("Ways to make it");
  });

  it("puts the strength study in Evaluate, with nothing apart", () => {
    const evaluate = menu("Evaluate", "Part", ["fea", "cad"]);
    expect(titled(evaluate!.sections)).toEqual([
      ["Simulation", ["Strength under load"]],
      ["Fit, motion and mass", ["Weight and center of mass"]],
    ]);
    expect(evaluate!.others).toEqual([]);
  });

  it("gives an assembly its strength, fit, motion and building documents", () => {
    const evaluate = menu("Evaluate", "Assembly", ["fea", "cad"]);
    expect(titled(evaluate!.sections)).toEqual([
      ["Simulation", ["Strength under load"]],
      [
        "Fit, motion and mass",
        ["Fit and clearance", "Range of motion", "Weight and center of mass"],
      ],
    ]);
    const document = menu("Document", "Assembly", [
      "cad",
      "engineering-drawing",
      "work-instructions",
      "robot-simulation",
    ]);
    expect(titled(document!.sections)).toEqual([
      ["Drawings", ["Engineering drawing", "3D PMI"]],
      ["Building it", ["Parts list", "Assembly instructions", "Exploded view"]],
      ["Pictures and video", ["Pictures from every side", "Motion video"]],
      ["Reports", ["Test plan", "Write up the results"]],
    ]);
    expect(titled(document!.others)).toEqual([["Robot description", ["Robot files"]]]);
  });

  it("gives a mesh only the printing methods", () => {
    expect(
      menu("Manufacture", "Mesh", ["cad", "cam"])!.others.map((section) => section.title),
    ).toEqual(["3D printing"]);
  });

  it("gives a board and its schematic their checks and files, and nothing else", () => {
    expect(titled(menu("Evaluate", "Board", ["pcb", "cad"])!.sections)).toEqual([
      ["Circuit board", ["Board checks", "Review before ordering"]],
    ]);
    expect(titled(menu("Evaluate", "Schematic", ["pcb"])!.sections)).toEqual([
      ["Circuit board", ["Board checks"]],
    ]);
    expect(titled(menu("Manufacture", "Board", ["pcb", "cad"])!.sections)).toEqual([
      ["Circuit board", ["Fabrication files", "Board STEP"]],
    ]);
    expect(menu("Evaluate", "Part", ["pcb"])).toBeUndefined();
  });

  it("names the part in the job it writes", () => {
    const evaluate = menu("Evaluate", "Part", ["fea"]);
    expect(evaluate?.sections[0]?.actions[0]?.prompt("parts/bracket.step")).toMatch(
      /^Check parts\/bracket\.step /,
    );
  });

  it("says what every job makes", () => {
    // Its tile's tooltip: a sentence, at most 100 characters (3D PMI's, which names model-based
    // definition and AP242, is the longest).
    const unsaid = HARDWARE_ACTIONS.filter(
      (action) => !/^\S.*\.$/.test(action.gets) || action.gets.length > 100,
    );
    expect(unsaid.map((action) => `${action.id}: ${action.gets}`)).toEqual([]);
  });

  it("says every outcome a check reports, in one shape", () => {
    // The cad skill's manufacturing check reports a pass, a fail, or a review or unverified
    // finding: each check's line, and the library's Manufacturing check, name all three.
    const checks = HARDWARE_ACTIONS.filter(
      (action) => action.skill === "cad" && action.checks && action.group === "Manufacture",
    );
    expect(checks).not.toEqual([]);
    const unsaid = checks.filter(
      (action) =>
        !/^Findings for .+, each passing, to fix or to check, with the fix\.$/.test(action.gets),
    );
    expect(unsaid.map((action) => `${action.id}: ${action.gets}`)).toEqual([]);
    expect(entryOfAction("cnc")?.gets).toBe(
      "Findings, each passing, to fix or to check, with the fix.",
    );
  });

  it("every job has its library entry", () => {
    const unlisted = HARDWARE_ACTIONS.filter((action) => entryOfAction(action.id) === null);
    expect(unlisted.map((action) => action.id)).toEqual([]);
  });
});
