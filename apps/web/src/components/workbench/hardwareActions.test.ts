import { describe, expect, it } from "vite-plus/test";

import { HARDWARE_ACTIONS, type HardwareActionMenu, hardwareActions } from "./hardwareActions";
import { entryOfAction } from "./library/libraryCatalog";

const titled = (sections: HardwareActionMenu["sections"]) =>
  sections.map((section) => [section.title, section.actions.map((action) => action.label)]);
const menu = (group: string, kind: string, skills: string[], process?: string) =>
  hardwareActions(kind, new Set(skills), process).find((entry) => entry.group === group);

describe("hardware actions", () => {
  it("leads Manufacture with the project's own way of making it, whole, and keeps the others apart", () => {
    const manufacture = menu(
      "Manufacture",
      "Part",
      ["dfm", "dfam-check", "gcode", "bambu-labs", "cam", "step-parts"],
      "3D printing (FDM)",
    );
    expect(titled(manufacture!.sections)).toEqual([
      [
        "3D printing",
        [
          "Check for FDM printing",
          "Slice for FDM",
          "Print on a Bambu printer",
          "Check for resin printing",
          "Check for SLS printing",
          "Check for MJF printing",
          "Check for metal printing",
        ],
      ],
      ["Files and off-the-shelf parts", ["Off-the-shelf parts"]],
    ]);
    expect(titled(manufacture!.others)).toEqual([
      [
        "Machining and molding",
        ["Check for CNC machining", "G-code for CNC", "Check for injection molding"],
      ],
      ["Sheet metal and cutting", ["Check as sheet metal"]],
    ]);
    expect(manufacture!.moreLabel).toBe("Other ways to make it");
  });

  it("puts the files to export in Manufacture, after the ways to make it", () => {
    const manufacture = menu("Manufacture", "Part", ["dfm", "cad"], "CNC machining");
    expect(titled(manufacture!.sections)).toEqual([
      ["Machining and molding", ["Check for CNC machining", "Check for injection molding"]],
      ["Files and off-the-shelf parts", ["STEP", "STL and 3MF"]],
    ]);
    expect(menu("Manufacture", "Board", ["cad"])).toBeUndefined();
  });

  it("keeps every way to make it apart until the project chooses one", () => {
    const manufacture = menu("Manufacture", "Part", ["dfm", "dxf", "sendcutsend"]);
    expect(manufacture!.sections).toEqual([]);
    expect(manufacture!.others.map((section) => section.title)).toEqual([
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
      "urdf",
      "sdf",
      "srdf",
    ]);
    expect(titled(document!.sections)).toEqual([
      ["Drawings", ["Engineering drawing", "3D PMI"]],
      ["Building it", ["Parts list", "Assembly instructions", "Exploded view"]],
      ["Pictures and video", ["Pictures from every side", "Motion video"]],
      ["Reports", ["Test plan", "Write up the results"]],
    ]);
    expect(titled(document!.others)).toEqual([
      ["Robot description", ["URDF", "SDF for Gazebo", "SRDF for MoveIt"]],
    ]);
  });

  it("gives a mesh only the printing methods", () => {
    expect(
      menu("Manufacture", "Mesh", ["dfm", "dfam-check", "cam"])!.others.map(
        (section) => section.title,
      ),
    ).toEqual(["3D printing"]);
  });

  it("names the part in the job it writes", () => {
    const evaluate = menu("Evaluate", "Part", ["fea"]);
    expect(evaluate?.sections[0]?.actions[0]?.prompt("parts/bracket.step")).toMatch(
      /^Check parts\/bracket\.step /,
    );
  });

  it("has every manufacturing check save its review where its part's check reads it", () => {
    const job = (id: string) => HARDWARE_ACTIONS.find((action) => action.id === id);
    expect(job("cnc")?.prompt("parts/bracket.step")).toMatch(
      / Save the review in docs\/ as the part's file name followed by _cnc_dfm\.md, /,
    );
    expect(job("sendcutsend")?.prompt("parts/bracket.step")).toMatch(/_sendcutsend\.md, /);
    expect(job("strength")?.prompt("parts/bracket.step")).not.toMatch(/Save the review/);
    expect(job("dxf")?.prompt("parts/bracket.step")).not.toMatch(/Save the review/);
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
    // dfam-check and dfm report a pass, a fail and a third outcome (need more info,
    // review, unverified): each check's line, and the library's Manufacturing check, name all three.
    const checks = HARDWARE_ACTIONS.filter((action) =>
      ["dfam-check", "dfm"].includes(action.skill ?? ""),
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
