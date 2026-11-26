import { describe, expect, it } from "vite-plus/test";

import { ISO_FIT_PRESETS, isoFit, isoFitsTable, toleranceClass } from "./isoFits";

/** A class's limits at a size, µm, as ISO 286-2 prints them. */
const microns = (name: string, size: number) => {
  const limits = toleranceClass(name, size);
  if (typeof limits === "string") throw new Error(limits);
  return [Math.round(limits.upper * 10000) / 10, Math.round(limits.lower * 10000) / 10];
};

describe("ISO 286 tolerance classes", () => {
  // Read off ISO 286-2 as Mitsubishi Carbide's and pgreene16/isofits' tables print it.
  it.each([
    ["H7", 20, 21, 0],
    ["H7", 3, 10, 0],
    ["H11", 450, 400, 0],
    ["g6", 20, -7, -20],
    ["f7", 25, -20, -41],
    ["h6", 500, 0, -40],
    ["js6", 20, 6.5, -6.5],
    ["js7", 25, 10.5, -10.5],
    ["k6", 20, 15, 2],
    ["k6", 2, 6, 0],
    ["m6", 60, 30, 11],
    ["n6", 40, 33, 17],
    ["p6", 20, 35, 22],
    ["p6", 1, 12, 6],
    ["r6", 70, 62, 43],
    ["r6", 480, 172, 132],
    ["s6", 60, 72, 53],
    ["s6", 150, 125, 100],
    ["t6", 25, 54, 41],
    ["t6", 170, 171, 146],
    ["u6", 20, 54, 41],
    ["u6", 110, 166, 144],
    ["c9", 2, -60, -85],
    ["c9", 470, -480, -635],
    ["d9", 420, -230, -385],
    ["e8", 300, -110, -191],
    ["F7", 25, 41, 20],
    ["G6", 40, 25, 9],
    ["K6", 8, 2, -7],
    ["K7", 20, 6, -15],
    ["M6", 300, -9, -41],
    ["M7", 50, 0, -25],
    ["N7", 20, -7, -28],
    ["N9", 2, -4, -29],
    ["P7", 20, -14, -35],
    ["P8", 20, -22, -55],
    ["R7", 70, -32, -62],
  ] as const)("%s at %s mm is %s/%s µm", (name, size, upper, lower) => {
    expect(microns(name, size)).toEqual([upper, lower]);
  });

  it("takes a size on a range's upper bound as that range's", () => {
    expect(microns("H7", 18)).toEqual([18, 0]);
    expect(microns("H7", 18.001)).toEqual([21, 0]);
  });

  it("refuses what the table does not hold, saying why", () => {
    expect(toleranceClass("a11", 20)).toMatch(/no a shaft/);
    expect(toleranceClass("H14", 20)).toMatch(/IT4 to IT13/);
    expect(toleranceClass("t6", 20)).toMatch(/no deviation up to 24 mm/);
    expect(toleranceClass("H7", 600)).toMatch(/0 to 500 mm/);
    expect(toleranceClass("H7x", 20)).toMatch(/not an ISO 286 tolerance class/);
  });
});

describe("ISO 286 fits", () => {
  it("tells a clearance, a transition and an interference fit apart", () => {
    expect(isoFit("H7/g6", 20)).toMatchObject({
      tightest: 0.007,
      loosest: 0.041,
      kind: "clearance",
    });
    expect(isoFit("H7/k6", 20)).toMatchObject({
      tightest: -0.015,
      loosest: 0.019,
      kind: "transition",
    });
    expect(isoFit("H7/p6", 20)).toMatchObject({
      tightest: -0.035,
      loosest: -0.001,
      kind: "interference",
    });
  });

  it("wants a hole's class over a shaft's", () => {
    expect(isoFit("g6/H7", 20)).toMatch(/shaft's class/);
    expect(isoFit("H7", 20)).toMatch(/not a fit/);
  });

  it("holds every preset at every size, each the kind its name says", () => {
    for (const preset of ISO_FIT_PRESETS) {
      for (const size of [10, 20, 200, 500]) {
        const fit = isoFit(preset.fit, size);
        if (typeof fit === "string") throw new Error(`${preset.fit} at ${size}: ${fit}`);
        const kind = /interference|drive|force/i.test(preset.name)
          ? "interference"
          : /transition/i.test(preset.name)
            ? "transition"
            : "clearance";
        expect(fit.kind, `${preset.fit} at ${size}`).toBe(kind);
      }
    }
  });

  it("writes the job skill's table as runs of equal limits", () => {
    const table = isoFitsTable();
    expect(table.H7?.at(0)).toEqual([0, 3, 0.01, 0]);
    expect(table.H7?.at(-1)).toEqual([400, 500, 0.063, 0]);
    expect(table.t6?.at(0)?.[0]).toBe(24);
  });
});
