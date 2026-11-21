import { STUDIO_PROJECT_KINDS } from "@t3tools/shared/studioProjects";
import { describe, expect, it } from "vite-plus/test";

import { newProjectBrief } from "./newProjectBrief";

const PART = STUDIO_PROJECT_KINDS.find((kind) => kind.id === "part")!;

describe("newProjectBrief", () => {
  it("uses the process it is given, not the kind's", () => {
    const brief = newProjectBrief({
      kind: PART,
      units: "mm",
      standard: "ISO",
      generalTolerance: "",
      material: " Aluminium 6061-T6, 10 mm plate ",
      purpose: "A plate.",
      process: "CNC machining",
    });
    expect(brief).toMatchObject({
      units: "mm",
      material: "Aluminium 6061-T6, 10 mm plate",
      process: "CNC machining",
      purpose: "A plate.",
    });
  });

  it("keeps the kind's process when none is given or it is blank", () => {
    const base = {
      kind: PART,
      units: "mm",
      standard: "ISO",
      generalTolerance: "",
      material: "",
      purpose: "",
    } as const;
    expect(newProjectBrief(base).process).toBe(PART.process);
    expect(newProjectBrief({ ...base, process: "  " }).process).toBe(PART.process);
  });

  it("keeps the tolerance Settings states, else the standard's usual for its units", () => {
    const base = { kind: PART, material: "", purpose: "" } as const;
    const iso = newProjectBrief({ ...base, units: "mm", standard: "ISO", generalTolerance: " " });
    expect(iso).toMatchObject({ standard: "ISO", generalTolerance: "ISO 2768-m" });
    const asme = { ...base, units: "in", standard: "ASME" } as const;
    expect(newProjectBrief({ ...asme, generalTolerance: "" }).generalTolerance).toBe("±.005");
    expect(newProjectBrief({ ...asme, generalTolerance: " ±.010 " }).generalTolerance).toBe(
      "±.010",
    );
  });
});
