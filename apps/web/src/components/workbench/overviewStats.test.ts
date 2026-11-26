import { describe, expect, it } from "vite-plus/test";

import { lastExport, measureFileFor, measuredSize, sizeWords } from "./overviewStats";

describe("the Overview's stats", () => {
  it("finds a part's measured size where its printing check wrote one", () => {
    const paths = [
      "parts/stand.py",
      "checks/stand_print.dfam_measure.json",
      "checks/clip.dfam_measure.json",
    ];
    expect(measureFileFor(paths, "stand.step")).toBe("checks/stand_print.dfam_measure.json");
    expect(measureFileFor(paths, "bracket.step")).toBeNull();
    const size = measuredSize(JSON.stringify({ mesh: { bbox_mm: [105.04, 140.0, 80.0] } }));
    expect(size).toEqual([105.04, 140, 80]);
    expect(sizeWords(size!)).toBe("105 × 140 × 80 mm");
    expect(measuredSize("{")).toBeNull();
    expect(measuredSize(JSON.stringify({ mesh: { bbox_mm: [1, "2", 3] } }))).toBeNull();
  });

  it("reads the last export from the newest zip in exports/, a second of the day too", () => {
    expect(
      lastExport([
        "exports/Rig 2026-11-24.zip",
        "exports/Rig STEP 2026-11-25 2.zip",
        "exports/Rig 2026-11-25/RECEIPT.md",
        "docs/old 2027-01-01.zip",
      ]),
    ).toBe("2026-11-25");
    expect(lastExport(["parts/a.step"])).toBeNull();
  });
});
