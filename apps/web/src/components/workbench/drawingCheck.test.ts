import { describe, expect, it } from "vite-plus/test";

import { parseCheckResult } from "./checkResults";

import {
  drawingCheckHeadline,
  gradeDrawingCheck,
  parseDrawingCheck,
  printedDecimals,
  regionAround,
} from "./drawingCheck";

const TITLE_BLOCK = { decimals: { "2": 0.01, "3": 0.005 }, fraction: 1 / 32, angle: 0.5 };

const graded = (rows: ReadonlyArray<Record<string, unknown>>, extra: object = {}) => {
  const check = parseDrawingCheck(
    JSON.stringify({ units: "in", generalTolerance: TITLE_BLOCK, dimensions: rows, ...extra }),
  );
  if (check === null) throw new Error("not a drawing check");
  return gradeDrawingCheck(check);
};

describe("parseDrawingCheck", () => {
  it("reads only a file with dimensions", () => {
    expect(parseDrawingCheck("{")).toBeNull();
    expect(parseDrawingCheck(JSON.stringify({ findings: [] }))).toBeNull();
    expect(parseDrawingCheck(JSON.stringify({ dimensions: [] }))?.dimensions).toEqual([]);
  });

  it("drops a row with no feature and places a row on the first source by default", () => {
    const check = parseDrawingCheck(
      JSON.stringify({
        sources: [{ id: "FL-100", file: "brief/references/FL-100.pdf" }],
        dimensions: [
          { text: "Ø4.00" },
          { feature: "Flange OD", text: "Ø4.00", where: { page: 2, box: [0.1, 0.2, 0.05, 0.02] } },
          { feature: "Bad box", where: { page: 1, box: [0.1, 0.2, 2, 0.02] } },
        ],
      }),
    );
    expect(check?.dimensions.map((row) => row.feature)).toEqual(["Flange OD", "Bad box"]);
    expect(check?.dimensions[0]?.where).toEqual({
      source: "FL-100",
      page: 2,
      view: null,
      box: [0.1, 0.2, 0.05, 0.02],
    });
    expect(check?.dimensions[1]?.where?.box).toBeNull();
  });
});

describe("gradeDrawingCheck", () => {
  it("holds a size to its own limits, then the title block by printed decimals", () => {
    const check = graded([
      {
        feature: "Front bore",
        text: "Ø1.000/1.002",
        nominal: 1.001,
        limits: [1, 1.002],
        measured: 1.001,
      },
      {
        feature: "Bore at its limit",
        text: "Ø1.000/1.002",
        limits: [1, 1.002],
        measured: 1.002 + 1e-12,
      },
      { feature: "Flange OD", text: "Ø4.00", nominal: 4, measured: 4.009 },
      { feature: "Flange OD again", text: "Ø4.00", nominal: 4, measured: 4.011 },
      { feature: "Pilot", text: ".550", nominal: 0.55, measured: 0.5549 },
    ]);
    expect(check.dimensions.map((row) => [row.status, row.band?.from])).toEqual([
      ["ok", "limits"],
      ["ok", "limits"],
      ["ok", "general"],
      ["out", "general"],
      ["ok", "general"],
    ]);
  });

  it("uses the fraction and angle tolerances, and the printed digit when the title block has none", () => {
    const check = graded([
      { feature: "Scallop depth", text: '1 1/4"', nominal: 1.25, measured: 1.28 },
      { feature: "Bore cone", text: "30°", nominal: 30, units: "deg", measured: 30.6 },
      { feature: "Terminal pitch", text: "20", nominal: 20, units: "mm", measured: 20.4 },
    ]);
    expect(check.dimensions.map((row) => [row.status, row.band?.from])).toEqual([
      ["ok", "general"],
      ["out", "general"],
      ["ok", "as-printed"],
    ]);
    expect(printedDecimals("2X .03 X 45°")).toBe(2);
    expect(printedDecimals("1.000/1.002")).toBe(3);
    // A count that is the dimension itself is held to it.
    expect(printedDecimals("(4) Places")).toBe(0);
  });

  it("never passes what was not measured, a flag, a reference or a note", () => {
    const check = graded([
      { feature: "Groove width", text: ".12", nominal: 0.12 },
      {
        feature: "Lip height",
        text: "5",
        nominal: 5,
        units: "mm",
        measured: 5.5,
        flag: "conflict",
      },
      { feature: "Cavity depth", nominal: 1.75, measured: 1.75, flag: "missing" },
      {
        feature: "Collar to back",
        text: "(4.14)",
        nominal: 4.14,
        measured: 4.9,
        flag: "reference",
      },
      { feature: "Finish", text: "32 RMS", flag: "note" },
    ]);
    expect(check.dimensions.map((row) => row.status)).toEqual([
      "not-checked",
      "flag",
      "flag",
      "reference",
      "note",
    ]);
    expect(check.dimensions[1]?.delta).toBeCloseTo(0.5);
    expect(drawingCheckHeadline(check.counts)).toBe("2 to confirm · 0 match · 1 not checked");
  });
});

describe("a drawing check among a part's checks", () => {
  it("fails on a size out of tolerance, naming both numbers, and warns on one to confirm", () => {
    const contents = JSON.stringify({
      model: "parts/flange.step",
      units: "in",
      dimensions: [
        {
          feature: "Flange OD",
          text: "Ø4.00",
          nominal: 4,
          tolerance: [-0.01, 0.01],
          measured: 4.02,
        },
        {
          feature: "Groove",
          text: ".12",
          nominal: 0.12,
          flag: "conflict",
          note: "the section draws it wider",
        },
        { feature: "Bore", text: "Ø2.50", nominal: 2.5, measured: 2.5 },
      ],
    });
    const result = parseCheckResult("checks/flange.drawing-check.json", contents);
    expect(result).toMatchObject({
      part: "flange.step",
      model: "checks/flange.drawing-check.json",
      check: "Drawing check",
      status: "fix",
      headline: "1 out of tolerance · 1 to confirm · 1 match",
      issues: [
        {
          severity: "error",
          summary: "Flange OD: 4.020 (Δ +0.020) on the model, Ø4.00 on the drawing",
        },
        { severity: "warning", summary: "Groove: conflict", detail: "the section draws it wider" },
      ],
    });
  });
});

describe("regionAround", () => {
  it("shows a callout with room around it, inside the sheet, at the crop's aspect", () => {
    const sheet = { width: 3000, height: 2000 };
    // A small callout in the middle: at least an eighth of the sheet's width around it.
    expect(regionAround([0.5, 0.5, 0.01, 0.01], sheet, 2)).toEqual({
      x: 1335,
      y: 920,
      width: 360,
      height: 180,
    });
    // At the corner it stays on the sheet; with no box it is the whole sheet.
    expect(regionAround([0.99, 0, 0.01, 0.01], sheet, 2)).toMatchObject({ x: 2640, y: 0 });
    expect(regionAround(null, sheet, 1.5)).toEqual({ x: 0, y: 0, width: 3000, height: 2000 });
  });
});
