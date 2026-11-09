import { describe, expect, it } from "vite-plus/test";

import { humanName, inSentence, partLabel, partName } from "./partNames";

describe("part names", () => {
  it("reads a file's stem as a name, keeping part numbers and an engineer's capitals", () => {
    expect(humanName("servo_bracket_v2")).toBe("Servo bracket v2");
    expect(humanName("l_bracket")).toBe("L bracket");
    expect(humanName("enclosureLid")).toBe("Enclosure lid");
    expect(humanName("M3_STANDOFF")).toBe("M3 standoff");
    expect(humanName("MDBT50Q")).toBe("MDBT50Q");
    expect(humanName("pcb-mount-rev-b")).toBe("PCB mount rev B");
    expect(humanName("README")).toBe("Readme");
    expect(humanName("fea-summary")).toBe("FEA summary");
    expect(humanName("prd")).toBe("PRD");
    expect(humanName("fmea")).toBe("FMEA");
    expect(humanName("product_xrd")).toBe("Product XRD");
    expect(humanName("Product_xRD")).toBe("Product xRD");
  });

  it("names a part by its name and what was made from it by the part", () => {
    expect(partName("parts/STEP/servo_bracket.step")).toEqual({
      name: "Servo bracket",
      kind: "Part",
      label: "Servo bracket",
    });
    expect(partLabel("drawings/l_bracket.dxf")).toBe("L bracket drawing");
    expect(partLabel("parts/l_bracket.fea.json")).toBe("L bracket FEA study");
    expect(partLabel("out/l_bracket.cam.glb")).toBe("L bracket CAM job");
    expect(partLabel("out/l_bracket.nc")).toBe("L bracket G-code");
    expect(partLabel("electronics/servo_power.kicad_pcb")).toBe("Servo power board");
    expect(partLabel("electronics/main_board.kicad_pcb")).toBe("Main board");
    expect(partLabel("electronics/servo_power.bom.csv")).toBe("Servo power bill of materials");
  });

  it("names text-to-cad 0.11's results for the folder they were written into", () => {
    expect(partName("studies/tip-load/result.glb")).toEqual({
      name: "Tip load",
      kind: "FEA study",
      label: "Tip load FEA study",
    });
    expect(partLabel("studies\\servo_bracket-fea\\result.json")).toBe("Servo bracket FEA study");
    expect(partLabel("cam/horn_adapter/result.glb")).toBe("Horn adapter CAM job");
    // A folder that only says what it holds names nothing more.
    expect(partLabel("CAM/result.glb")).toBe("CAM job");
    expect(partLabel("FEA/result.json")).toBe("FEA study");
    expect(partName("parts/result.step")?.kind).toBe("Part");
  });

  it("calls an exported mesh by its format, and the viewer's own GLB a mesh", () => {
    expect(partLabel("exports/clip.stl")).toBe("Clip STL");
    expect(partLabel("exports/clip.3mf")).toBe("Clip 3MF");
    expect(partLabel("parts/STEP/clip.glb")).toBe("Clip mesh");
  });

  it("calls a file named for what it is by that, and a document by its name", () => {
    expect(partLabel("fab/bom.csv")).toBe("Bill of materials");
    expect(partLabel("fab/gerbers.zip")).toBe("Gerbers");
    expect(partLabel("plans/bracket-review.md")).toBe("Bracket review");
    expect(partLabel("PLAN.md")).toBe("Plan");
    expect(partLabel("/Users/me/studio-projects/abc/project.json")).toBe("Project setup");
    expect(partLabel("brief/project.md")).toBe("Project brief");
  });

  it("leaves a file it cannot name by its file name", () => {
    expect(partName("package.json")).toBeNull();
    expect(partLabel("src/lib/util.ts")).toBe("util.ts");
  });

  it("puts a name in a sentence without shouting or losing its capitals", () => {
    expect(inSentence("Servo bracket")).toBe("the servo bracket");
    expect(inSentence("PCB mount")).toBe("the PCB mount");
    expect(inSentence("L bracket")).toBe("the L bracket");
  });
});
