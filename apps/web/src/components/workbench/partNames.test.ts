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

  it("names a bought part by its standard and size, as the standard prints it", () => {
    expect(humanName("iso4017_m8x16")).toBe("ISO 4017 M8×16");
    expect(humanName("iso4032_m8")).toBe("ISO 4032 M8");
    expect(humanName("iso7089_m8")).toBe("ISO 7089 M8");
    expect(humanName("iso7380_1_m4x10")).toBe("ISO 7380-1 M4×10");
    expect(humanName("din931_m2_5x20")).toBe("DIN 931 M2.5×20");
    expect(partLabel("parts/imported/iso4762_m3x8.py")).toBe("ISO 4762 M3×8 source");
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
    // The cam skill's programs, one a run of one tool: `<part>.<setup>.<run>-T<tool>.nc`.
    expect(partLabel("CAM/plate.top.1-T1.nc")).toBe("Plate · top setup · run 1 · T1 G-code");
    // A model the engine holds names them by its id: its part's name where the project lists it,
    // else the setup and the tool, never the id.
    const id = "6128c65e-2127-553b-adf3-31e0c4a1b2d9";
    const titles = new Map([[id, "Base plate"]]);
    expect(partName(`CAM/${id}.top.2-T2.nc`, titles)).toEqual({
      name: "Base plate · top setup · run 2 · T2",
      kind: "G-code",
      label: "Base plate · top setup · run 2 · T2 G-code",
    });
    expect(partLabel(`CAM/${id}.top.2-T2.nc`)).toBe("Top setup · run 2 · T2 G-code");
    expect(partLabel(`CAM/${id}.bottom.nc`, new Map())).toBe("Bottom setup G-code");
    expect(partLabel(`CAM/${id}.bottom.nc`, titles)).toBe("Base plate · bottom setup G-code");
    expect(partLabel("electronics/servo_power.kicad_pcb")).toBe("Servo power board");
    expect(partLabel("electronics/main_board.kicad_pcb")).toBe("Main board");
    expect(partLabel("electronics/servo_power.bom.csv")).toBe("Servo power bill of materials");
    // A check and the script that measures it are listed together, so each says which it is.
    expect(partName("checks/test_plate.drawing-check.json")).toEqual({
      name: "Test plate",
      kind: "Drawing check",
      label: "Test plate drawing check",
    });
    expect(partName("checks/test_plate_drawing_check.py")).toEqual({
      name: "Test plate",
      kind: "Drawing check",
      label: "Test plate drawing check script",
    });
  });

  it("names text-to-cad 0.11's results for the folder they were written into", () => {
    expect(partName("studies/tip-load/result.glb")).toEqual({
      name: "Tip load",
      kind: "FEA study",
      label: "Tip load FEA results",
    });
    expect(partLabel("studies\\servo_bracket-fea\\result.json")).toBe("Servo bracket FEA results");
    // A CAM job's plan is not the job: `flat_plate.cam.json` and the folder its plan wrote.
    expect(partName("manufacturing/flat_plate_cam/result.json")).toEqual({
      name: "Flat plate",
      kind: "CAM plan",
      label: "Flat plate CAM plan",
    });
    expect(partName("parts/flat_plate.cam.json")?.kind).toBe("CAM job");
    expect(partLabel("cam/horn_adapter/result.glb")).toBe("Horn adapter CAM plan");
    // A folder that only says what it holds names nothing more.
    expect(partLabel("CAM/result.glb")).toBe("CAM plan");
    expect(partLabel("manufacturing/cam-preview/result.json")).toBe("Cam preview CAM plan");
    expect(partLabel("manufacturing/grbl/result.glb")).toBe("Grbl CAM plan");
    expect(partLabel("cam-preview/result.json")).toBe("Cam preview CAM plan");
    expect(partLabel("manufacturing\\grbl\\result.json")).toBe("Grbl CAM plan");
    expect(partLabel("studies/camshaft/result.json")).toBe("Camshaft FEA results");
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
