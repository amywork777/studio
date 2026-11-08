import { describe, expect, it } from "vite-plus/test";

import { classifyProjectFile, filePlaces, groupProjectFiles, isProjectWork } from "./projectFiles";

const demo = [
  "parts/STEP/l_bracket.step",
  "parts/STEP/mounting_plate.step",
  "parts/src/l_bracket.py",
  "parts/src/lib/part_common.py",
  "electronics/PCB/servo_power.kicad_pcb",
  "electronics/PCB/servo_power.kicad_sch",
  "electronics/PCB/servo_power.bom.csv",
  "electronics/PCB/servo_power.gerbers.zip",
  "out/l_bracket.cam.glb",
  "out/l_bracket.nc",
  "fea/results/charging-thermal.glb",
  "reference/raytac/MDBT50Q.step",
  "plans/bracket-review.md",
  "AGENTS.md",
  "assets/icon.svg",
  "brief/brief.json",
  "brief/project.md",
  "brief/references/sketch.jpg",
  ".venv/lib/readme.md",
  "node_modules/x/README.md",
];

describe("project files", () => {
  it("lists a study as one card, in the code interface's lists too", () => {
    const groups = groupProjectFiles(["studies/a.step", "studies/a.fea.glb", "parts/a.step"]);
    expect(groups.map(({ group, files }) => [group, files.map((file) => file.path)])).toEqual([
      ["CAD", ["parts/a.step"]],
      ["Analysis", ["studies/a.fea.glb"]],
    ]);
  });

  it("files a project the way an engineer would, leaving source and tooling out", () => {
    expect(
      groupProjectFiles(demo).map(({ group, files }) => [group, files.map((file) => file.name)]),
    ).toEqual([
      ["CAD", ["l_bracket.step", "mounting_plate.step"]],
      ["Electronics", ["servo_power.kicad_pcb", "servo_power.kicad_sch"]],
      ["Documents", ["bracket-review.md"]],
      ["Analysis", ["charging-thermal.glb"]],
      [
        "Manufacturing",
        ["servo_power.bom.csv", "servo_power.gerbers.zip", "l_bracket.cam.glb", "l_bracket.nc"],
      ],
      ["Reference parts", ["MDBT50Q.step"]],
      ["References", ["project.md", "sketch.jpg"]],
    ]);
  });

  it("knows the project's own work from its tooling, whatever kind of file it is", () => {
    const work = [
      "parts/src/l_bracket.py",
      "parts/STEP/l_bracket.step",
      "docs/prd.md",
      "README.md",
      "notes.txt",
      "./docs/prd.md",
      "docs\\prd.md",
    ];
    const tooling = [
      "AGENTS.md",
      "docs/CLAUDE.md",
      "assets/icon.svg",
      ".gitignore",
      ".claude/skills/cad/SKILL.md",
      ".venv/lib/readme.md",
      "node_modules/x/README.md",
      "parts/__pycache__/l_bracket.cpython-312.pyc",
      "build/out.step",
      "dist/app.md",
      "tmp/scratch.md",
      "../outside/notes.md",
      "./.git/config",
    ];
    expect(work.map(isProjectWork)).toEqual(work.map(() => true));
    expect(tooling.map(isProjectWork)).toEqual(tooling.map(() => false));
    // It is the rule that files a project: what it rejects is never filed.
    expect(tooling.map((path) => classifyProjectFile(path))).toEqual(tooling.map(() => null));
  });

  it("names what each file is and what it is called", () => {
    expect(classifyProjectFile("electronics/PCB/servo_power.bom.csv")).toMatchObject({
      title: "Servo power",
      kind: "Bill of materials",
      folder: "electronics/PCB",
    });
    expect(classifyProjectFile("parts/STEP/l_bracket.step")).toMatchObject({
      title: "L bracket",
      kind: "Part",
    });
    expect(classifyProjectFile("brief/references/sketch.jpg")).toMatchObject({
      title: "Sketch",
      kind: "Image",
    });
    // A cadgen 0.8 document saved as a file (`@xbf`, or exported) is a part like a STEP.
    expect(classifyProjectFile("parts/XBF/l_bracket.xbf")).toMatchObject({
      title: "L bracket",
      kind: "Part",
      group: "CAD",
    });
    expect(classifyProjectFile("out/l_bracket.nc")?.kind).toBe("G-code");
    expect(classifyProjectFile("parts/src/l_bracket.py")).toBeNull();
  });

  it("says where a file sits only to tell two alike apart", () => {
    const files = ["parts/v1/bracket.step", "parts/v2/bracket.step", "bracket.dxf", "plate.step"]
      .map(classifyProjectFile)
      .filter((file) => file !== null);
    expect(Object.fromEntries(filePlaces(files))).toEqual({
      "parts/v1/bracket.step": "V1",
      "parts/v2/bracket.step": "V2",
    });
  });

  it("narrows by a search over paths", () => {
    expect(
      groupProjectFiles(demo, "servo").flatMap(({ files }) => files.map((f) => f.name)),
    ).toEqual([
      "servo_power.kicad_pcb",
      "servo_power.kicad_sch",
      "servo_power.bom.csv",
      "servo_power.gerbers.zip",
    ]);
  });
});
