import { describe, expect, it } from "vite-plus/test";

import {
  draftFile,
  draftMade,
  draftPart,
  draftPrompt,
  draftSource,
  slugOf,
  type Draft,
} from "./drafts";
import { buildNodeGraph, nodeSockets, type GraphPart } from "./nodeGraph";

const PLATE: GraphPart = {
  id: "parts/motor_plate.step",
  name: "Motor plate",
  script: "parts/motor_plate.py",
  kind: "Part",
  updated: "1",
};
const SCREW: GraphPart = {
  id: "parts/iso4762_m3x10.step",
  name: "Iso4762 m3x10",
  script: "parts/iso4762_m3x10.step",
  kind: "Part",
  updated: null,
};
const SOURCES = new Map([
  ["parts/sizes.py", "MOTOR_BOLT_PATTERN = 31\n"],
  ["parts/motor_plate.py", "from sizes import MOTOR_BOLT_PATTERN\n"],
]);

const CLAMP: Draft = {
  id: "draft-1",
  kind: "Part",
  name: "Belt clamp",
  inputs: [
    { from: "parts/sizes.py", socket: "MOTOR_BOLT_PATTERN" },
    { from: PLATE.id, socket: "shape" },
    { from: SCREW.id, socket: "shape" },
  ],
  sent: null,
};

describe("drafts", () => {
  it("stands in the graph as a script importing what is wired into it", () => {
    const base = buildNodeGraph([PLATE, SCREW], SOURCES);
    const source = draftSource(CLAMP, new Map(base.nodes.map((node) => [node.id, node])));
    expect(source).toBe(
      'from sizes import MOTOR_BOLT_PATTERN\nimport motor_plate\n"iso4762_m3x10.step"',
    );
    const graph = buildNodeGraph(
      [PLATE, SCREW, draftPart(CLAMP)],
      new Map([...SOURCES, [draftPart(CLAMP).script, source]]),
    );
    expect(nodeSockets(graph, "draft-1").inputs.map((input) => input.name)).toEqual([
      "MOTOR_BOLT_PATTERN",
      "Motor plate",
      "Iso4762 m3x10",
    ]);
  });

  it("asks for the part by name, file and what it uses", () => {
    expect(slugOf(" Belt clamp (v2) ")).toBe("belt_clamp_v2");
    expect(slugOf("3D bracket")).toBe("part_3d_bracket");
    expect(draftFile({ ...CLAMP, kind: "Assembly", name: "Belt drive" })).toBe(
      "assemblies/belt_drive.py",
    );
    expect(
      draftPrompt(
        CLAMP,
        ["MOTOR_BOLT_PATTERN from [Sizes](parts/sizes.py)", "[Motor plate](parts/motor_plate.py)"],
        "a clamp that grips the belt above the plate.",
      ),
    ).toBe(
      "Make a new part, Belt clamp: a clamp that grips the belt above the plate.\n\n" +
        "It uses MOTOR_BOLT_PATTERN from [Sizes](parts/sizes.py) and [Motor plate](parts/motor_plate.py).\n\n" +
        "Write it as parts/belt_clamp.py, importing what it uses by name so it follows them, then build it.",
    );
    expect(
      draftPrompt({ ...CLAMP, kind: "Stock", inputs: [] }, [], "an M3 x 10 socket head screw"),
    ).toBe(
      "Find an M3 x 10 socket head screw on step.parts and import its STEP file into this project, checked against its record.",
    );
  });

  it("gives way to the part it asked for once that appears", () => {
    const sent: Draft = { ...CLAMP, sent: { at: 1, before: [PLATE.id] } };
    const clamp: GraphPart = { ...PLATE, id: "doc:clamp", script: "parts/belt_clamp.py" };
    expect(draftMade(CLAMP, [PLATE, clamp])).toBe(false);
    expect(draftMade(sent, [PLATE])).toBe(false);
    expect(draftMade(sent, [PLATE, clamp])).toBe(true);
    const stock: Draft = { ...sent, kind: "Stock" };
    expect(draftMade(stock, [PLATE, clamp])).toBe(false);
    expect(draftMade(stock, [PLATE, SCREW])).toBe(true);
  });
});
