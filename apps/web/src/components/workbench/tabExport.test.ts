import { describe, expect, it } from "vite-plus/test";

import { tabExportPlan } from "./tabExport";

const id = "0b6f4a8e-58a4-4a62-9f0e-2f4c1d3b7a10";
const scripts = (known: string | undefined) => () => known;
const files = (file: string | null, script?: string) => {
  const plan = tabExportPlan(file, scripts(script));
  return plan === null ? null : plan.formats.map(plan.destination);
};

describe("a part tab's Export", () => {
  it("writes beside the part, never over the person's own STEP", () => {
    expect(files(id, "parts/base.py")).toEqual([
      "parts/base.step",
      "parts/base.stl",
      "parts/base.3mf",
    ]);
    expect(files("parts/imported/motor.step")).toEqual([
      "parts/imported/motor.stl",
      "parts/imported/motor.3mf",
    ]);
    expect(files("share/arm.xbf")).toEqual(["share/arm.step", "share/arm.stl", "share/arm.3mf"]);
    expect(files("scan.stl")).toEqual(["scan.3mf"]);
  });

  it("offers nothing for a drawing, a document, a file outside the project or an unread model", () => {
    expect(files("drawings/base.dxf")).toBeNull();
    expect(files("docs/parts_list.md")).toBeNull();
    expect(files("/Users/me/Downloads/motor.step")).toBeNull();
    expect(files(id)).toBeNull();
    expect(files(null)).toBeNull();
  });
});
