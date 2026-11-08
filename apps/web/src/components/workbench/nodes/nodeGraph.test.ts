import { classifyProjectFile } from "../projectFiles";
import { describe, expect, it } from "vite-plus/test";

import {
  buildNodeGraph,
  downstream,
  graphParts,
  nodePrompt,
  nodeSockets,
  scriptImportNames,
  scriptImports,
  wirePrompt,
  sharedName,
  upstream,
  type GraphPart,
} from "./nodeGraph";

// The motor mount example's scripts, as far as their imports go.
const SOURCES = new Map([
  ["parts/sizes.py", "MOTOR_BODY_LENGTH = 40\n"],
  [
    "parts/motor_plate.py",
    "import sys\nfrom cadgen import model\nfrom sizes import MOTOR_BOLT_PATTERN\n",
  ],
  ["parts/nema17.py", "import build123d as bd\nfrom cadgen import model\n"],
  [
    "assemblies/motor_mount.py",
    "import sys\nfrom pathlib import Path\nimport build123d as bd\nfrom cadgen.mates import mate\n" +
      "from motor_plate import SCREW_CLEARANCE, motor_plate  # noqa: E402\n" +
      "from nema17 import nema17  # noqa: E402\nfrom sizes import MOTOR_BODY_LENGTH  # noqa: E402\n",
  ],
  [
    "checks/motor_plate_geometry.py",
    "import motor_plate as mp\nfrom sizes import MOTOR_BOLT_PATTERN\n",
  ],
  ["exports.py", "from motor_mount import motor_mount\n"],
]);

const MODELS: GraphPart[] = [
  {
    id: "doc:plate",
    name: "Motor plate",
    script: "parts/motor_plate.py",
    kind: "Part",
    updated: "1",
  },
  { id: "doc:nema", name: "NEMA 17", script: "parts/nema17.py", kind: "Part", updated: "1" },
  {
    id: "doc:mount",
    name: "Motor mount",
    script: "assemblies/motor_mount.py",
    kind: "Assembly",
    updated: "1",
  },
];

describe("scriptImports", () => {
  it("reads from-imports, plain imports and aliases, each once", () => {
    expect(
      scriptImports(
        "import os, sys as s\nfrom a.b import c\nfrom sizes import X\n  import sizes\n",
      ),
    ).toEqual(["a", "sizes", "os", "sys"]);
  });
});

describe("scriptImportNames", () => {
  it("reads the names each import takes, over several lines and past comments", () => {
    expect(
      scriptImportNames(
        "from sizes import (\n    MOTOR_FRAME,  # the face\n    MOTOR_PILOT as PILOT,\n)\n" +
          "from cadgen.ap242 import annotate, datum\nimport motor_plate as mp\n",
      ),
    ).toEqual([
      { module: "sizes", names: ["MOTOR_FRAME", "MOTOR_PILOT"] },
      { module: "cadgen", names: ["annotate", "datum"] },
      { module: "motor_plate", names: ["*"] },
    ]);
  });
});

describe("buildNodeGraph", () => {
  const graph = buildNodeGraph(MODELS, SOURCES);

  it("adds the shared sizes the parts use, and leaves out checks and exports", () => {
    expect(graph.nodes.map((node) => node.name)).toEqual([
      "Sizes",
      "NEMA 17",
      "Motor plate",
      "Motor mount",
    ]);
    expect(graph.nodes.find((node) => node.name === "Sizes")?.kind).toBe("Shared");
  });

  it("wires each part to what it imports, left to right", () => {
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from: "parts/sizes.py", to: "doc:plate", names: ["MOTOR_BOLT_PATTERN"] },
        { from: "doc:plate", to: "doc:mount", names: ["SCREW_CLEARANCE", "motor_plate"] },
        { from: "doc:nema", to: "doc:mount", names: ["nema17"] },
        { from: "parts/sizes.py", to: "doc:mount", names: ["MOTOR_BODY_LENGTH"] },
      ]),
    );
    expect(graph.edges).toHaveLength(4);
    const column = (id: string) => graph.nodes.find((node) => node.id === id)?.column;
    expect([column("parts/sizes.py"), column("doc:plate"), column("doc:mount")]).toEqual([0, 1, 2]);
    expect(column("doc:nema")).toBe(0);
  });

  it("gives each node a socket per name it takes and gives", () => {
    expect(nodeSockets(graph, "doc:mount").inputs.map((socket) => socket.name)).toEqual([
      "SCREW_CLEARANCE",
      "Motor plate",
      "NEMA 17",
      "MOTOR_BODY_LENGTH",
    ]);
    expect(nodeSockets(graph, "doc:plate").outputs.map((socket) => socket.id)).toEqual([
      "shape",
      "SCREW_CLEARANCE",
    ]);
    expect(nodeSockets(graph, "parts/sizes.py").outputs.map((socket) => socket.id)).toEqual([
      "MOTOR_BOLT_PATTERN",
      "MOTOR_BODY_LENGTH",
    ]);
    expect(nodeSockets(graph, "doc:mount").inputs[1]).toMatchObject({
      from: "doc:plate",
      fromSocket: "shape",
      type: "Part",
    });
  });

  it("knows what rebuilds after a change, and what a part uses", () => {
    expect(downstream(graph, "parts/sizes.py")).toEqual(["doc:plate", "doc:mount"]);
    expect(downstream(graph, "doc:mount")).toEqual([]);
    expect(upstream(graph, "doc:mount")).toEqual(["doc:plate", "doc:nema", "parts/sizes.py"]);
  });

  it("survives an import loop", () => {
    const loop = buildNodeGraph(
      [
        { id: "a", name: "A", script: "a.py", kind: "Part", updated: null },
        { id: "b", name: "B", script: "b.py", kind: "Part", updated: null },
      ],
      new Map([
        ["a.py", "from b import x\n"],
        ["b.py", "from a import y\n"],
      ]),
    );
    expect(loop.nodes).toHaveLength(2);
    expect(downstream(loop, "a")).toEqual(["b"]);
  });
});

describe("sharedName", () => {
  it("names a shared script in plain words", () => {
    expect(sharedName("parts/sizes.py")).toBe("Sizes");
    expect(sharedName("lib/motor_specs.py")).toBe("Motor specs");
  });
});

describe("nodePrompt", () => {
  it("asks for one part only, with what it must meet and what follows it", () => {
    expect(
      nodePrompt({
        link: "[Hinge](parts/hinge.py)",
        kind: "Part",
        ask: " Make it stiffer ",
        context: ["Takes all 11 N at the stop", "PETG HF"],
        uses: ["Sizes"],
        usedBy: ["Phone case"],
      }),
    ).toBe(
      [
        "Change only [Hinge](parts/hinge.py): Make it stiffer",
        "",
        "What this part must meet:",
        "- Takes all 11 N at the stop",
        "- PETG HF",
        "",
        "It uses: Sizes.",
        "Used by: Phone case.",
        "",
        "Edit only this script. Then rebuild it and what uses it. If one of those no longer fits, say which and why, and don't change it.",
      ].join("\n"),
    );
  });
});

describe("graphParts", () => {
  // The motor mount project as Studio files it: STEPs made by scripts, and two imported STEPs.
  const PATHS = [
    "assemblies/motor_mount.py",
    "assemblies/motor_mount.step",
    "parts/motor_plate.py",
    "parts/motor_plate.step",
    "parts/motor_plate_drawing.py",
    "parts/nema17.py",
    "parts/nema17.step",
    "parts/sizes.py",
    "parts/imported/stepper_motor_nema17_l0040_single_shaft.step",
    "checks/motor_plate_geometry.py",
  ];
  const steps = PATHS.flatMap((path) => {
    const file = classifyProjectFile(path);
    return file !== null && path.endsWith(".step") ? [file] : [];
  });

  it("finds each STEP's script by its name, and marks the assembly", () => {
    const parts = graphParts(steps, PATHS);
    const byId = new Map(parts.map((part) => [part.id, part]));
    expect(byId.get("parts/motor_plate.step")?.script).toBe("parts/motor_plate.py");
    expect(byId.get("assemblies/motor_mount.step")).toMatchObject({
      script: "assemblies/motor_mount.py",
      kind: "Assembly",
    });
    expect(byId.get("parts/imported/stepper_motor_nema17_l0040_single_shaft.step")?.script).toBe(
      "parts/imported/stepper_motor_nema17_l0040_single_shaft.step",
    );
  });

  it("wires a project with no cadgen models", () => {
    const parts = graphParts(steps, PATHS);
    const graph = buildNodeGraph(parts, SOURCES);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "parts/sizes.py", to: "parts/motor_plate.step" }),
        expect.objectContaining({
          from: "parts/motor_plate.step",
          to: "assemblies/motor_mount.step",
        }),
        expect.objectContaining({ from: "parts/nema17.step", to: "assemblies/motor_mount.step" }),
      ]),
    );
  });
});

describe("wirePrompt", () => {
  it("asks for a size drawn into a part to be used there", () => {
    expect(
      wirePrompt({
        fromLink: "[Sizes](parts/sizes.py)",
        name: "MOTOR_FRAME",
        type: "Size",
        toLink: "[Motor plate](parts/motor_plate.step)",
      }),
    ).toBe(
      "Use the size MOTOR_FRAME from [Sizes](parts/sizes.py) in [Motor plate](parts/motor_plate.step), importing it by name. Edit only [Motor plate](parts/motor_plate.step)'s script, then rebuild it and what uses it.",
    );
  });
});
