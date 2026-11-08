import { describe, expect, it } from "vite-plus/test";

// The Motor mount sample's own strength study of its plate, as `cad fea` wrote it.
import STUDY from "../../../../../../studio-sample/motor-mount/studies/motor_plate.fea.json?raw";
import { figure, studyFigures } from "./studyFigures";

describe("study figures", () => {
  it("reads the sample plate's strength study as it was run", () => {
    expect(studyFigures(STUDY)).toEqual([
      { label: "Load", value: "50 N" },
      { label: "Material", value: "Aluminum 6061-T6" },
      { label: "Peak stress", value: "0.529 MPa (limit 276 MPa)" },
      { label: "Safety factor", value: "521" },
      { label: "Most it moves", value: "0.000114 mm" },
    ]);
  });

  it("gives three significant digits without exponents, and nothing for a file that is no study", () => {
    expect([figure(521.397), figure(12_345.6), figure(0.5293), figure(0)]).toEqual([
      "521",
      "12,346",
      "0.529",
      "0",
    ]);
    expect(studyFigures("not json")).toEqual([]);
    expect(studyFigures('{"findings": []}')).toEqual([]);
  });
});
