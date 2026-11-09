import { describe, expect, it } from "vite-plus/test";

import { changesPhrase, designChanges, foldChanges } from "./designChanges";

describe("design changes", () => {
  it("folds a part's files into the part, and keeps documents their own", () => {
    const { changes, other } = designChanges([
      "parts/src/servo_bracket.py",
      "parts/STEP/servo_bracket.step",
      "parts/STEP/servo_bracket.glb",
      "drawings/servo_bracket.dxf",
      "parts/servo_bracket.fea.json",
      "docs/fea-report.md",
      "parts/src/lib/part_common.py",
      "AGENTS.md",
      ".venv/lib/x.py",
    ]);
    expect(changes).toEqual([
      {
        name: "Servo bracket",
        label: "Servo bracket",
        aspects: ["model", "mesh", "drawing", "FEA study"],
        kind: "Part",
        open: "parts/STEP/servo_bracket.step",
        script: "parts/src/servo_bracket.py",
      },
      {
        name: "FEA report",
        label: "FEA report",
        aspects: [],
        kind: "Document",
        open: "docs/fea-report.md",
        script: null,
      },
    ]);
    expect(other).toBe(3);
  });

  it("says what a document or picture is when it shares its part's name", () => {
    const { changes } = designChanges([
      "parts/bracket_flat.py",
      "drawings/bracket_flat.dxf",
      "drawings/bracket_flat.md",
      "drawings/bracket_flat.png",
      "docs/fea-report.md",
    ]);
    expect(changes.map((change) => change.label)).toEqual([
      "Bracket flat",
      "Bracket flat document",
      "Bracket flat image",
      "FEA report",
    ]);
  });

  it("opens a 0.11 study's answer as the result model in its folder", () => {
    const { changes } = designChanges([
      "studies/tip-load/result.json",
      "studies/tip-load/result.glb",
    ]);
    expect(changes.map((change) => [change.label, change.kind, change.open])).toEqual([
      ["Tip load FEA study", "FEA study", "studies/tip-load/result.glb"],
    ]);
    expect(
      designChanges(["studies/tip-load/result.json"]).changes.map((change) => change.open),
    ).toEqual(["studies/tip-load/result.glb"]);
  });

  it("names a lone aspect with its part, and opens a study's numbers as its model", () => {
    const { changes } = designChanges([
      "drawings/bracket.dxf",
      "fea/plate.fea.json",
      "exports/clip.stl",
    ]);
    expect(changes.map((change) => [change.label, change.open])).toEqual([
      ["Bracket drawing", "drawings/bracket.dxf"],
      ["Plate FEA study", "fea/plate.fea.glb"],
      ["Clip STL", "exports/clip.stl"],
    ]);
  });

  it("reads a SolidCraft design and its STEP as one part, opening the STEP", () => {
    expect(designChanges(["parts/servo_bracket.solidcraft", "parts/servo_bracket.step"])).toEqual({
      changes: [
        {
          name: "Servo bracket",
          label: "Servo bracket",
          aspects: ["model"],
          kind: "Part",
          open: "parts/servo_bracket.step",
          script: null,
        },
      ],
      other: 0,
    });
  });

  it("has no file to open for a model script on its own, only the script its model is named by", () => {
    expect(designChanges(["parts/bracket.py"]).changes[0]).toMatchObject({
      label: "Bracket",
      open: null,
      script: "parts/bracket.py",
    });
  });

  it("says the changes in a sentence", () => {
    const { changes } = designChanges(["a.step", "b.dxf", "c.step"]);
    expect(changesPhrase(changes.slice(0, 1))).toBe("the A");
    expect(changesPhrase(changes.slice(0, 2))).toBe("the A and the B drawing");
    expect(changesPhrase(changes)).toBe("the A and 2 more");
    expect(changesPhrase(changes.slice(0, 1), 2)).toBe("the A and 2 more");
    expect(changesPhrase([])).toBeNull();
  });

  it("folds a long line of changes behind a count, and opens it again", () => {
    const six = ["a", "b", "c", "d", "e", "f"];
    expect(foldChanges(six, false)).toEqual({ shown: ["a", "b", "c", "d"], hidden: 2 });
    expect(foldChanges(six, true)).toEqual({ shown: six, hidden: 0 });
  });

  it("does not fold a single change behind a control as big as it", () => {
    const five = ["a", "b", "c", "d", "e"];
    expect(foldChanges(five, false)).toEqual({ shown: five, hidden: 0 });
  });
});
