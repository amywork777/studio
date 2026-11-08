import { describe, expect, it } from "vite-plus/test";

import { readBody, readChange, readEditState, sizeUses, typedPreview } from "./sizePreview";

// The motor plate's screw holes as edit mode reads them: MOTOR_BOLT_PATTERN is line 6 of sizes.py.
const STATE = readEditState({
  ok: true,
  units: "mm",
  components: [],
  rows: [
    {
      key: "parts/motor_plate.py:111",
      inputs: [{ value: 120, formula: "PLATE_LENGTH", leaves: ["parts/motor_plate.py:23:15"] }],
    },
    {
      key: "parts/motor_plate.py:135",
      inputs: [
        { value: 3.4, formula: "SCREW_CLEARANCE", leaves: ["parts/motor_plate.py:29:18"] },
        {
          value: 15.5,
          formula: "MOTOR_BOLT_PATTERN/2",
          leaves: ["parts/sizes.py:6:21", "parts/motor_plate.py:131:81"],
        },
        { value: 31, formula: "MOTOR_BOLT_PATTERN", leaves: ["parts/sizes.py:6:21"] },
      ],
    },
    {
      key: "parts/motor_plate.py:126",
      inputs: [
        {
          value: 22.2,
          formula: "MOTOR_PILOT+PILOT_CLEARANCE",
          leaves: ["parts/sizes.py:12:14", "parts/motor_plate.py:27:18"],
        },
      ],
    },
  ],
});

describe("size previews", () => {
  it("finds the features a size shapes by where it is written, in any file", () => {
    expect(STATE).not.toBeNull();
    if (STATE === null) return;
    expect(sizeUses(STATE, "parts/sizes.py", 6).map((use) => [use.row, use.index])).toEqual([
      ["parts/motor_plate.py:135", 1],
      ["parts/motor_plate.py:135", 2],
    ]);
    expect(sizeUses(STATE, "parts/sizes.py", 60)).toEqual([]);
  });

  it("types the feature size that scales with the size, and none for a sum", () => {
    if (STATE === null) return;
    expect(
      typedPreview(sizeUses(STATE, "parts/sizes.py", 6), "MOTOR_BOLT_PATTERN", 31, 35, "mm"),
    ).toEqual({ row: "parts/motor_plate.py:135", values: [{ index: 1, text: "17.5" }] });
    expect(
      typedPreview(sizeUses(STATE, "parts/sizes.py", 12), "MOTOR_PILOT", 22, 24, "mm"),
    ).toBeNull();
    expect(
      typedPreview(sizeUses(STATE, "parts/motor_plate.py", 23), "PLATE_LENGTH", 120, 127, "in"),
    ).toEqual({ row: "parts/motor_plate.py:111", values: [{ index: 0, text: "5" }] });
  });

  it("reads a preview's solids and the whole part's triangles", () => {
    expect(
      readChange({
        ok: true,
        preview: {
          added: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], triangles: [0, 1, 2] },
          removed: null,
          error: null,
        },
      }),
    ).toEqual({
      added: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], triangles: [0, 1, 2] },
      removed: null,
      error: null,
    });
    expect(readBody({ ok: true, draft_check: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] } })).toEqual(
      {
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        triangles: [0, 1, 2],
      },
    );
    expect(readEditState({ ok: true, rows: [], components: [{ name: "plate" }] })?.assembly).toBe(
      true,
    );
  });
});
