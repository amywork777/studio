import { describe, expect, it } from "vite-plus/test";

import { readPartContext, writePartContext } from "./partContext";

describe("part context file", () => {
  it("reads lines by script and drops anything else", () => {
    expect(
      readPartContext('{"parts/hinge.py": ["11 N at the stop", 3, " "], "note": "x", "b.py": []}'),
    ).toEqual({ "parts/hinge.py": ["11 N at the stop"], "b.py": [] });
  });

  it("reads a broken file as empty", () => {
    expect(readPartContext("{not json")).toEqual({});
  });

  it("writes scripts in order and leaves out parts with nothing to meet", () => {
    expect(writePartContext({ "z.py": ["PETG"], "a.py": ["Fits a 6 mm shaft"], "m.py": [] })).toBe(
      '{\n  "a.py": [\n    "Fits a 6 mm shaft"\n  ],\n  "z.py": [\n    "PETG"\n  ]\n}\n',
    );
  });
});
