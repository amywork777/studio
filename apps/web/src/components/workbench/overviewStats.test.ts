import { describe, expect, it } from "vite-plus/test";

import {
  lastExport,
  madePartCount,
  measureFileFor,
  measuredSize,
  sizeWords,
} from "./overviewStats";
import type { ProjectFile } from "./projectFiles";

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

  it("counts the parts the project made, once each, and not their assembly or bought parts", () => {
    const file = (path: string, kind: string, extra: Partial<ProjectFile> = {}): ProjectFile => ({
      path,
      name: path.split("/").at(-1)!,
      title: path,
      folder: path.split("/").slice(0, -1).join("/"),
      group: "CAD",
      kind,
      ...extra,
    });
    expect(
      madePartCount([
        file("parts/plate.py", "Part", { document: "id-plate" }),
        file("parts/plate.step", "Part"),
        file("parts/plate.stl", "Mesh"),
        file("assemblies/plate_assembly.py", "Assembly", { document: "id-assembly" }),
        file("parts/imported/iso4017_m8x20.py", "Part", {
          document: "id-bolt",
          group: "Reference parts",
        }),
      ]),
    ).toBe(1);
  });
});
